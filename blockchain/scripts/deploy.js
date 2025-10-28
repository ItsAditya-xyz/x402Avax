// scripts/deploy.js
// Deploys X402 with (owner, feeRecipient, feeBps)
// Usage:
//   npx hardhat run scripts/deploy.js --network <yourNetwork>

const hre = require("hardhat");

async function main() {
  // ==== CONFIG: set your params here or via env ====
  const owner         = process.env.PUBLIC_KEY         || "0x813cD5459484e4C085849c0DD6e45120468c5cb5";
  const feeRecipient  = process.env.PUBLIC_KEY || "0x813cD5459484e4C085849c0DD6e45120468c5cb5";
  const feeBps        = Number(process.env.X402_FEE_BPS || 100); // 1% = 100 bps; must be <= 1000 per contract

  if (!owner || !feeRecipient) {
    throw new Error("Missing owner/feeRecipient");
  }

  console.log("Network     :", hre.network.name);
  console.log("Deployer    :", (await hre.ethers.getSigners())[0].address);
  console.log("Params      :", { owner, feeRecipient, feeBps });

  // ==== Deploy ====
  const X402 = await hre.ethers.getContractFactory("X402");
  console.log("Deploying X402...");
  const x402 = await X402.deploy(owner, feeRecipient, feeBps);
  await x402.waitForDeployment();

  const addr = await x402.getAddress();
  console.log("X402 deployed at:", addr);

  // ==== Optional: Etherscan-style verification (if API key is set) ====
  // Wait a few confirmations so the verifier can find the bytecode
  const tx = x402.deploymentTransaction();
  if (tx) {
    console.log("Deployment tx:", tx.hash);
    await tx.wait(5).catch(() => {}); // ignore if network doesn't support
  }

  if (process.env.ETHERSCAN_API_KEY) {
    try {
      console.log("Verifying on explorer...");
      await hre.run("verify:verify", {
        address: addr,
        constructorArguments: [owner, feeRecipient, feeBps],
      });
      console.log("Verified ✓");
    } catch (e) {
      console.log("Verify skipped/failed:", e.message || e);
    }
  } else {
    console.log("No ETHERSCAN_API_KEY set; skipping verify.");
  }
}

// Boilerplate
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
