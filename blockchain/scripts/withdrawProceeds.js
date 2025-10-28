// scripts/withdrawProceeds.js
// Usage:
// npx hardhat run scripts/withdrawProceeds.js --network avax --slot 0
// Optional: --contract 0xYourRaffle

const hre = require("hardhat");

function getArg(flag, fallback = undefined) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main() {
  const DEFAULT_CONTRACT = "0x7249525F6050cb972540506A55d648CE7D824137"; // your deployed BoiRaffle
  const contractAddress =DEFAULT_CONTRACT
  const slotIdStr = "0"

  if (!slotIdStr) throw new Error("❌ Missing --slot <slotId>");
  const slotId = BigInt(slotIdStr);

  const [signer] = await hre.ethers.getSigners();
  const signerAddr = await signer.getAddress();

  console.log(`👤 Signer: ${signerAddr}`);
  console.log(`📜 Contract: ${contractAddress}`);
  console.log(`🎟️ Slot ID: ${slotId}`);

  const raffle = await hre.ethers.getContractAt("BoiRaffle", contractAddress, signer);

  // Optional: quote expected withdrawal before actually calling it
  try {
    const quote = await raffle.quoteCreatorWithdrawal(slotId);
    console.log("\n💰 Withdrawal Preview:");
    console.log(`   Token:           ${quote.token}`);
    console.log(`   Gross Proceeds:  ${quote.grossProceeds}`);
    console.log(`   Fee Amount:      ${quote.feeAmount}`);
    console.log(`   Creator Receives:${quote.creatorReceives}`);
  } catch (e) {
    console.log("⚠️ Could not get withdrawal quote (maybe not ready yet).");
  }

  console.log("\n🚀 Withdrawing proceeds...");
  const tx = await raffle.withdrawCreatorProceeds(slotId);
  const receipt = await tx.wait();

  console.log(`✅ Withdrawal successful!`);
  console.log(`   Tx Hash: ${receipt.transactionHash}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err.message || err);
    process.exit(1);
  });
