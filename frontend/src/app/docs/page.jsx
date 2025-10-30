"use client";

import Navbar from "../../../components/navbar";
import Link from "next/link";
export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Overview</h2>
          <p className="text-slate-700">
            x402 is an HTTP 402-powered paywall for APIs. You create a masked endpoint that responds with HTTP 402 and on-chain payment instructions
            until the caller pays. Once paid, requests with the session header are proxied to your upstream API and returned to the caller.
          </p>
        </section>

        <section className="mb-10">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Glossary</h3>
          <ul className="list-disc pl-6 text-slate-700 space-y-1">
            <li><span className="font-mono">apiId</span>: The identifier for your masked API (path: <span className="font-mono">/api/&lt;apiId&gt;</span>).</li>
            <li><span className="font-mono">X-402-Session</span>: Header the client sends after payment to unlock content.</li>
            <li>Network: Avalanche C-Chain (<span className="font-mono">chain_id</span> from backend; typically 43114).</li>
            <li>Contract: Gateway contract callers pay to (<span className="font-mono">0xDa90Fac43937AD84dC9483ff118C8c2CEc5f1F56</span>).</li>
            <li>Tokens: AVAX (native), ARENA, GLADIUS (ERC-20).</li>
          </ul>
        </section>

        <section className="mb-10">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Create a Masked URL</h3>
          <p className="text-slate-700 mb-3">Two options:</p>
          <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
            <li>Use the UI at <Link href="/gate" className="text-emerald-700 hover:underline">/gate</Link>.</li>
            <li>Call the API: <span className="font-mono">POST /api/402/apis</span> with JSON body:</li>
          </ul>
          <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm"><code>{`POST /api/402/apis
Content-Type: application/json

{
  "p_name": "My API",                   // optional
  "p_api_url": "https://upstream.example.com/data", // required
  "p_merchant_wallet": "0x...",        // required, EVM
  "p_token_address": "0x...",          // AVAX=0x000...000, ARENA, GLADIUS
  "p_amount_wei": "100000000000000000", // amount in wei
  "p_valid_for_sec": 300,               // session duration
  "p_chain_id": 43114,                  // Avalanche C-Chain
  "p_fee_bps_snapshot": 100             // optional
}

Response 200:
{ "apiId": "<uuid-or-id>" }`}</code></pre>
        </section>

        <section className="mb-10">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Calling the Masked API (Agent Flow)</h3>
          <ol className="list-decimal pl-6 text-slate-700 space-y-3">
            <li>
              Request the masked endpoint without a session header:
              <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm"><code>{`curl -i ${'${ORIGIN}'}/api/<apiId>`}</code></pre>
              Expected response: <span className="font-mono">HTTP 402</span> with JSON payment instructions.
              <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm"><code>{`Status: 402
{
  "code": "payment_required",
  "data": {
    "session_id": "0x...",
    "network": { "chain_id": 43114, "name": "Avalanche C-Chain" },
    "contract": "0xDa90Fac43937AD84dC9483ff118C8c2CEc5f1F56",
    "amount_wei": "...",
    "merchant_wallet": "0x...",
    "token_address": "0x...",
    "calls": {
      "native": {
        "fn": "payNativeFor(bytes32 sessionId, address merchant)",
        "value": "<amount_wei>",
        "args": ["<session_id>", "<merchant_wallet>"]
      },
      "erc20_approve_then_pay": {
        "approve": { "spender": "0xDa90...f1F56", "amount": "<amount_wei>" },
        "payFor": {
          "fn": "payFor(bytes32 sessionId, address merchant, address token, uint256 amount)",
          "args": ["<session_id>", "<merchant_wallet>", "<token_address>", "<amount_wei>"]
        }
      },
      "erc20_permit": { /* optional permit flow descriptor */ }
    }
  }
}`}</code></pre>
            </li>
            <li>
              Perform on-chain payment using one of the provided call patterns:
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Native AVAX: call <span className="font-mono">payNativeFor(sessionId, merchant)</span> with <span className="font-mono">value=amount_wei</span>.</li>
                <li>ERC-20: approve the contract, then call <span className="font-mono">payFor(sessionId, merchant, token, amount)</span>.</li>
              </ul>
            </li>
            <li>
              Poll the endpoint with the session header until unlocked:
              <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm"><code>{`curl -s ${'${ORIGIN}'}/api/<apiId> \
  -H "X-402-Session: 0x<session_id>" -i`}</code></pre>
              When unlocked, the server returns <span className="font-mono">HTTP 200</span> with upstream content:
              <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm"><code>{`Status: 200
{
  "code": "successful",
  "data": {
    "api": { /* full apis_402 row incl. api_url, token, amount, etc. */ },
    "session": {
      "id": <number>,
      "session_id_hex": "0x...",
      "expires_at": "<ISO>"
    },
    "upstream": {
      "status": <http_status>,
      "content_type": "<mime>",
      "body": <json|string|{ image_url: string }>
    }
  }
}`}</code></pre>
              If the session expires, the server responds with <span className="font-mono">HTTP 402</span> and <span className="font-mono">code: "session_expired"</span> and includes a fresh pending <span className="font-mono">session_id</span> you can repurchase.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Agent Integration Example (Node + viem/ethers pseudo)</h3>
          <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm"><code>{`import fetch from 'node-fetch';
// import { walletClient } from './wallet'; // your preconfigured signer on Avalanche C-Chain

async function callMasked(apiId) {
  const origin = process.env.ORIGIN || 'https://your.app';

  // 1) initial 402
  const r1 = await fetch(
    
    origin + '/api/' + apiId
  );
  if (r1.status !== 402) throw new Error('Expected 402');
  const j1 = await r1.json();
  const info = j1.data; // includes session_id, contract, token_address, amount_wei

  // 2) on-chain payment (choose native or erc20 path shown in info.calls)
  // await walletClient.writeContract({
  //   address: info.contract,
  //   abi: [...],
  //   functionName: 'payNativeFor',
  //   args: [info.session_id, info.merchant_wallet],
  //   value: BigInt(info.amount_wei),
  //   chain: avalanche,
  // });

  // 3) poll until 200
  for (let i = 0; i < 45; i++) {
    const r2 = await fetch(origin + '/api/' + apiId, {
      headers: { 'X-402-Session': info.session_id },
    });
    if (r2.status === 200) {
      const ok = await r2.json();
      return ok.data.upstream; // { status, content_type, body }
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error('Timeout waiting for unlock');
}`}</code></pre>
        </section>

        <section className="mb-10">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Human UI</h3>
          <p className="text-slate-700">
            End-users can visit <span className="font-mono">/{`<apiId>`}</span> to complete payment with a wallet and see the unlocked response.
          </p>
        </section>

        <section className="mb-10">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Response Shapes</h3>
          <ul className="list-disc pl-6 text-slate-700 space-y-2">
            <li>402 payment required: <span className="font-mono">{`{ code: "payment_required", data: { session_id, network, contract, amount_wei, merchant_wallet, token_address, calls } }`}</span></li>
            <li>402 session expired: <span className="font-mono">{`{ code: "session_expired", data: {...}, meta: { previous_session, expired_at } }`}</span></li>
            <li>200 success: <span className="font-mono">{`{ code: "successful", data: { api, session, upstream } }`}</span></li>
            <li>404 not found: <span className="font-mono">{`{ code: "not_found" }`}</span></li>
          </ul>
        </section>

        <section className="mb-16">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Notes</h3>
          <ul className="list-disc pl-6 text-slate-700 space-y-2">
            <li>Set and persist <span className="font-mono">X-402-Session</span> client-side while polling.</li>
            <li>Upstream JSON is returned directly; for images, the server returns <span className="font-mono">{`{ image_url: <api_url> }`}</span>.</li>
            <li>All payments and sessions are validated server-side against Supabase tables <span className="font-mono">apis_402</span> and <span className="font-mono">sessions_402</span>.</li>
          </ul>
        </section>

        <div className="text-xs text-slate-500">Contract: 0xDa90Fac43937AD84dC9483ff118C8c2CEc5f1F56 · Network: Avalanche C-Chain</div>
      </main>
    </div>
  );
}
