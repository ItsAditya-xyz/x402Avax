// scripts/configureTokens.js
// Usage:
//   npx hardhat run scripts/configureTokens.js --network avax
//
// Automatically whitelists all tokens in `tokensToWhitelist`
// for X402 (or any compatible contract with setTokenWhitelist).

const hre = require("hardhat");

async function main() {
  const contractAddress = "0xDa90Fac43937AD84dC9483ff118C8c2CEc5f1F56"; // X402 contract
  const tokensToWhitelist = [
   
    { name: "GLADIUS", address: "0x34a1D2105dd1b658A48EAD516A9CE3032082799C" },
  ];

  const signer = (await hre.ethers.getSigners())[0];
  const addr = await signer.getAddress();
  console.log(`Using signer: ${addr}`);
  console.log(`Contract: ${contractAddress}`);

  const x402 = await hre.ethers.getContractAt("X402", contractAddress, signer);

  for (const token of tokensToWhitelist) {
    console.log(`\n== Whitelisting ${token.name} ==`);
    const tx = await x402.setTokenWhitelist(token.address, true);
    await tx.wait();
    console.log(`✅ ${token.name} (${token.address}) whitelisted`);
  }

  console.log("\nAll tokens whitelisted successfully ✅");
}

// Boilerplate
main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
