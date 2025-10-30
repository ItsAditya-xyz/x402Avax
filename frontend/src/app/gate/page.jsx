"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import FormBuilder from "../../../components/formBuilder";
import Navbar from "../../../components/navbar";

function formatWeiToToken(weiStr, decimals = 18) {
  try {
    const wei = BigInt(weiStr);
    const base = 10n ** BigInt(decimals);
    const whole = wei / base;
    const frac = wei % base;
    let fracStr = frac.toString().padStart(decimals, "0");
    fracStr = fracStr.slice(0, 6).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return "?";
  }
}

function resolveTokenName(addr) {
  const a = (addr || "").toLowerCase();
  if (a === "0x0000000000000000000000000000000000000000") return "AVAX";
  if (a === "0xb8d7710f7d8349a506b75dd184f05777c82dad0c") return "ARENA";
  if (a === "0x34a1d2105dd1b658a48ead516a9ce3032082799c") return "GLADIUS";
  return "TOKEN";
}

export default function GatePage() {
  const [result, setResult] = useState(null); // { apiId, summary }
  const hasResult = !!result?.apiId;

  const tokenName = useMemo(() => resolveTokenName(result?.summary?.token_address), [result]);
  const prettyAmount = useMemo(() => formatWeiToToken(result?.summary?.amount_wei || "0"), [result]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {!hasResult && (
          <FormBuilder
            onSuccess={({ apiId, summary }) => {
              setResult({ apiId, summary });
            }}
          />
        )}

        {hasResult && (
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">✅ API saved</h2>
            <p className="text-slate-600 text-sm mb-4">Share these endpoints with agents and users.</p>

            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="text-slate-600">x402 URI (For Agents)</div>
                <a
                  href={`/api/${result.apiId}`}
                  className="text-emerald-700 hover:underline break-all"
                  target="_blank"
                >
                  {typeof window !== "undefined" ? `${window.location.origin}/api/${result.apiId}` : `/api/${result.apiId}`}
                </a>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="text-slate-600">x402 URL (For Users)</div>
                <a
                  href={`/${result.apiId}`}
                  className="text-emerald-700 hover:underline break-all"
                  target="_blank"
                >
                  {typeof window !== "undefined" ? `${window.location.origin}/${result.apiId}` : `/${result.apiId}`}
                </a>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-600">Token</div>
                <div className="text-slate-900 font-medium">{tokenName}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-600">Amount</div>
                <div className="text-slate-900 font-medium">{prettyAmount}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-600">Session</div>
                <div className="text-slate-900 font-medium">{result.summary.valid_for_sec}s</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="text-slate-600">Original URL</div>
                <a href={result.summary.api_url} className="text-emerald-700 hover:underline break-all" target="_blank">
                  {result.summary.api_url}
                </a>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Link href={`/${result.apiId}`} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">Open user view</Link>
              <Link href={`/api/${result.apiId}`} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white">Open agent URI</Link>
              <Link href="/gate" className="ml-auto text-sm text-emerald-700 hover:underline">Create another</Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
