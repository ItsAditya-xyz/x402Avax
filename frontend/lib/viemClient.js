import { createPublicClient, http } from "viem";
import { avalanche } from "viem/chains"; // or the correct chain

export const publicClient = createPublicClient({
  chain: avalanche,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL), // or hardcoded RPC
});
