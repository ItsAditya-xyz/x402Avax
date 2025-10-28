// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title X402
 * @notice Minimal "receipt printer" for pay-to-unlock APIs:
 * - Accepts AVAX (native) or admin-whitelisted ERC-20 tokens.
 * - Admin-settable fee in basis points (default 1% = 100 bps), with a hard cap.
 * - Immediately forwards net to merchant and fee to feeRecipient (no custody).
 * - Emits Paid(sessionId, ...) for off-chain indexers.
 */

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Optional IERC20Permit interface (EIP-2612)
interface IERC20Permit {
  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
  ) external;
}

contract X402 is Ownable, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ====== Events ======
  event Paid(
    bytes32 indexed sessionId,
    address indexed payer,
    address indexed merchant,
    address token,         // address(0) for AVAX
    uint256 amountGross,   // user-paid total
    uint256 fee,           // fee taken
    uint256 amountNet      // merchant received
  );

  event FeeRecipientChanged(address indexed oldRecipient, address indexed newRecipient);
  event FeeBpsChanged(uint16 oldFeeBps, uint16 newFeeBps);
  event TokenWhitelistSet(address indexed token, bool allowed);
  event Rescue(address indexed token, uint256 amount, address indexed to);

  // ====== Constants/Config ======
  uint16 public constant MAX_FEE_BPS = 1000; // 10% hard cap, adjust if needed

  // ====== Storage ======
  address public feeRecipient;   // receives platform fees
  uint16  public feeBps;         // e.g., 100 = 1%
  mapping(address => bool) public tokenWhitelist; // ERC-20s only

  constructor(address _owner, address _feeRecipient, uint16 _feeBps) Ownable(_owner) {
    require(_feeRecipient != address(0), "feeRecipient=0");
    require(_feeBps <= MAX_FEE_BPS, "fee too high");
    feeRecipient = _feeRecipient;
    feeBps = _feeBps; // set to 100 for 1% initially
  }

  // ====== External: Payments ======

  /// @notice Pay in AVAX (native). Forwards net to merchant, fee to feeRecipient.
  function payNativeFor(bytes32 sessionId, address merchant)
    external
    payable
    whenNotPaused
    nonReentrant
  {
    require(merchant != address(0), "merchant=0");
    require(msg.value > 0, "no value");
    (uint256 fee, uint256 net) = _quoteFee(msg.value);

    // Forward net to merchant
    (bool ok1, ) = merchant.call{value: net}("");
    require(ok1, "native->merchant failed");

    // Forward fee to feeRecipient (can be zero)
    if (fee > 0) {
      (bool ok2, ) = feeRecipient.call{value: fee}("");
      require(ok2, "native->fee failed");
    }

    emit Paid(sessionId, msg.sender, merchant, address(0), msg.value, fee, net);
  }

  /// @notice Pay in a whitelisted ERC-20.
  function payFor(bytes32 sessionId, address merchant, address token, uint256 amount)
    external
    whenNotPaused
    nonReentrant
  {
    require(merchant != address(0), "merchant=0");
    require(token != address(0), "token=0");
    require(tokenWhitelist[token], "token not allowed");
    require(amount > 0, "amount=0");

    IERC20 erc = IERC20(token);
    // Pull full amount into this contract
    erc.safeTransferFrom(msg.sender, address(this), amount);

    (uint256 fee, uint256 net) = _quoteFee(amount);

    // Payouts
    if (net > 0) erc.safeTransfer(merchant, net);
    if (fee > 0) erc.safeTransfer(feeRecipient, fee);

    emit Paid(sessionId, msg.sender, merchant, token, amount, fee, net);
  }

  /// @notice Pay in a whitelisted ERC-20 using EIP-2612 permit to skip separate approve.
  function payForWithPermit(
    bytes32 sessionId,
    address merchant,
    address token,
    uint256 amount,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
  )
    external
    whenNotPaused
    nonReentrant
  {
    require(merchant != address(0), "merchant=0");
    require(token != address(0), "token=0");
    require(tokenWhitelist[token], "token not allowed");
    require(amount > 0, "amount=0");

    // Permit this contract to transferFrom payer
    IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);

    IERC20 erc = IERC20(token);
    erc.safeTransferFrom(msg.sender, address(this), amount);

    (uint256 fee, uint256 net) = _quoteFee(amount);

    if (net > 0) erc.safeTransfer(merchant, net);
    if (fee > 0) erc.safeTransfer(feeRecipient, fee);

    emit Paid(sessionId, msg.sender, merchant, token, amount, fee, net);
  }

  // ====== View helpers ======

  function quoteFee(uint256 amount) external view returns (uint256 fee, uint256 net) {
    return _quoteFee(amount);
  }

  function _quoteFee(uint256 amount) internal view returns (uint256 fee, uint256 net) {
    fee = (amount * feeBps) / 10_000; // rounds down
    net = amount - fee;
  }

  // ====== Admin ======

  function setFeeRecipient(address newRecipient) external onlyOwner {
    require(newRecipient != address(0), "feeRecipient=0");
    emit FeeRecipientChanged(feeRecipient, newRecipient);
    feeRecipient = newRecipient;
  }

  function setFeeBps(uint16 newBps) external onlyOwner {
    require(newBps <= MAX_FEE_BPS, "fee too high");
    emit FeeBpsChanged(feeBps, newBps);
    feeBps = newBps;
  }

  function setTokenWhitelist(address token, bool allowed) external onlyOwner {
    require(token != address(0), "token=0");
    tokenWhitelist[token] = allowed;
    emit TokenWhitelistSet(token, allowed);
  }

  function pause() external onlyOwner { _pause(); }
  function unpause() external onlyOwner { _unpause(); }

  /// @notice Rescue tokens accidentally sent to this contract (does not pull user funds normally).
  function rescueTokens(address token, uint256 amount, address to) external onlyOwner nonReentrant {
    require(to != address(0), "to=0");
    if (token == address(0)) {
      (bool ok, ) = to.call{value: amount}("");
      require(ok, "native rescue failed");
    } else {
      IERC20(token).safeTransfer(to, amount);
    }
    emit Rescue(token, amount, to);
  }

  // Reject stray native transfers (must call payNativeFor)
  receive() external payable {
    revert("direct AVAX not accepted");
  }
  fallback() external payable {
    revert("no fallback");
  }
}
