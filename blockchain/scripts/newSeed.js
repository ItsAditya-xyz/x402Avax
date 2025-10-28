// scripts/new-seed.js
// Generates a new Ethereum/AVAX wallet and prints address + private key
// Requires: npm i ethers
const { Wallet } = require("ethers");

function main() {
  const wallet = Wallet.createRandom();
  const address = wallet.address;
  const privateKey = wallet.privateKey; // 0x-prefixed

  console.log("\n=== NEW WALLET GENERATED ===\n");
  console.log("Address    :", address);
  console.log("PrivateKey :", privateKey);
  console.log("\n(One-line .env export)");
  console.log(`ADMIN_PRIVATE_KEY=${privateKey}`);
  console.log("\n============================\n");

  // For convenience: show a short fingerprint (not secret) to identify this key locally
  const fingerprint = address.slice(0, 6) + "..." + address.slice(-4);
  console.log("Fingerprint:", fingerprint, "\n");
}

main();
