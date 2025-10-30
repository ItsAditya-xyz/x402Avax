import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import launcherAbi from "../../../../abis/launcher.json"

// Proxy contract address
const CONTRACT_ADDRESS = '0x2196E106Af476f57618373ec028924767c758464';

// Constants from your original transaction
const A = 677_781; // uint32
const B = 0; // uint8
const CURVE_SCALER = 41_408_599_077n;
const CREATOR_FEE_BPS = 50; // uint8
const TOKEN_SPLIT = 73n; // uint256
const AMOUNT = 0n; // uint256

// Avalanche RPC
const AVALANCHE_RPC = 'https://api.avax.network/ext/bc/C/rpc';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    const symbol = searchParams.get('symbol');

    if (!name || !symbol) {
      return NextResponse.json(
        { error: 'Missing required params: ?name=...&symbol=...' },
        { status: 400 }
      );
    }

    // Load environment variables
    const pk = process.env.PRIVATE_KEY;
    const creatorAddress = process.env.ADDRESS;

    if (!pk || !creatorAddress) {
      return NextResponse.json(
        { error: 'Missing .env vars: ADDRESS or PRIVATE_KEY' },
        { status: 500 }
      );
    }

    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);
    const wallet = new ethers.Wallet(pk, provider);

    // Connect contract (use implementation ABI, talk to proxy)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, launcherAbi, wallet);

    // Call createToken()
    const tx = await contract.createToken(
      A,
      B,
      CURVE_SCALER,
      CREATOR_FEE_BPS,
      creatorAddress, // from env
      TOKEN_SPLIT,
      name,
      symbol,
      AMOUNT
    );

    return NextResponse.json({
      ok: true,
      hash: tx.hash,
    });
  } catch (err) {
    console.error('create-token error:', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
