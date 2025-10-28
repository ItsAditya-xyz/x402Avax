// scripts/configureTreasuryAndFee.js
// Usage:
//   npx hardhat run scripts/configureTreasuryAndFee.js --network avax
//
// Sets the feeRecipient (treasury) and feeBps (2.5%) for X402 contract.

const hre = require("hardhat");

async function main() {
  const contractAddress = "0xDa90Fac43937AD84dC9483ff118C8c2CEc5f1F56"; // X402 contract
  const newTreasury = "0x71d605d6a07565d9d2115e910d109df446a937a0";   // new feeRecipient
  const newFeeBps = 250; // 2.5% = 250 basis points

  const signer = (await hre.ethers.getSigners())[0];
  const addr = await signer.getAddress();
  console.log(`Using signer: ${addr}`);
  console.log(`Contract: ${contractAddress}`);

  const x402 = await hre.ethers.getContractAt("X402", contractAddress, signer);

  console.log("\n== Updating feeRecipient ==");
  const tx1 = await x402.setFeeRecipient(newTreasury);
  await tx1.wait();
  console.log(`✅ Fee recipient updated to: ${newTreasury}`);

  console.log("\n== Updating feeBps ==");
  const tx2 = await x402.setFeeBps(newFeeBps);
  await tx2.wait();
  console.log(`✅ Fee basis points updated to: ${newFeeBps} (${newFeeBps / 100}% fee)`);

  console.log("\nAll configuration changes applied successfully ✅");
}

// Boilerplate
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
