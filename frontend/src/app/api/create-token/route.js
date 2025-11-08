import { NextResponse } from "next/server";
import { ethers } from "ethers";
import launcherAbi from "../../../../abis/launcher.json";

const CONTRACT_ADDRESS = "0x2196E106Af476f57618373ec028924767c758464";
const AVALANCHE_RPC = "https://api.avax.network/ext/bc/C/rpc";
const ARENA_IMAGE_HOST = "https://static.starsarena.com/uploads/";
const ARENA_PAYMENT_TOKEN = "arena";
const ARENA_BASE_URL = "https://api.starsarena.com";

const A = 677_781; // uint32
const B = 0; // uint8
const CURVE_SCALER = 41_408_599_077n;
const CREATOR_FEE_BPS = 50; // uint8
const TOKEN_SPLIT = 73n; // uint256
const AMOUNT = 0n; // uint256

const REQUIRED_ENV_VARS = [
  "PRIVATE_KEY",
  "ADDRESS",
  "HANDLE",
  "SALT",
  "ARENA_JWT",
];

function validatePictureSlug(slug) {
  if (!slug) return null;
  const normalized = slug.replace(/^\/+/, "");
  return /^[A-Za-z0-9._-]+$/.test(normalized) ? normalized : null;
}

function ensureEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (!ARENA_BASE_URL) missing.push("ARENA_BASE_URL");
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim();
    const symbol = searchParams.get("symbol")?.trim();
    const pictureSlug = validatePictureSlug(searchParams.get("picture")?.trim());

    if (!name || !symbol || !pictureSlug) {
      return NextResponse.json(
        { error: "Missing required params: ?name=...&symbol=...&picture=slug" },
        { status: 400 }
      );
    }

    ensureEnvVars();
    const pk = process.env.PRIVATE_KEY;
    const creatorAddress = process.env.ADDRESS;
    const handle = process.env.HANDLE;
    const salt = process.env.SALT;
    const arenaJwt = process.env.ARENA_JWT;

    const pictureUrl = `${ARENA_IMAGE_HOST}${pictureSlug}`;
    const digest = `${creatorAddress}${handle}${pictureUrl}${symbol}${name}${salt}`;
    const hash = await ethers.hashMessage(digest);

    const payload = {
      hash,
      name: handle,
      photoURL: pictureUrl,
      ticker: symbol,
      tokenName: name,
      address: creatorAddress,
      paymentToken: ARENA_PAYMENT_TOKEN,
    };

    const arenaRes = await fetch(`${ARENA_BASE_URL}/communities/create-community-external`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${arenaJwt}`,
      },
      body: JSON.stringify(payload),
    });

    if (!arenaRes.ok) {
      const errBody = await arenaRes.text();
      throw new Error(`Arena API error (${arenaRes.status}): ${errBody}`);
    }

    const arenaJson = await arenaRes.json();
    const communityId = arenaJson?.community?.id;
    if (!communityId) {
      throw new Error("Arena API did not return community id");
    }

    const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);
    const wallet = new ethers.Wallet(pk, provider);
    const iface = new ethers.Interface(launcherAbi);

    const encodedData = iface.encodeFunctionData("createToken", [
      A,
      B,
      CURVE_SCALER,
      CREATOR_FEE_BPS,
      creatorAddress,
      TOKEN_SPLIT,
      name,
      symbol,
      AMOUNT,
    ]);

    const idBytes = ethers.toUtf8Bytes(String(communityId));
    const idHex = ethers.hexlify(idBytes).slice(2);
    const txData = `${encodedData}${idHex}`;

    const tx = await wallet.sendTransaction({
      to: CONTRACT_ADDRESS,
      data: txData,
    });

    return NextResponse.json({
      ok: true,
      hash: tx.hash,
      communityId: String(communityId),
    });
  } catch (err) {
    console.error("create-token error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
