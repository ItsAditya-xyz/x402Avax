"use client";

import { useState } from "react";

// --- small helpers ---
const isHexAddress = (s) => /^0x[a-fA-F0-9]{40}$/.test(s);

function toWeiString(amount, unit = "token", decimals = 18) {
  if (unit === "wei") {
    if (!/^\d+$/.test(String(amount)))
      throw new Error("amount (wei) must be integer");
    return String(amount);
  }
  if (!/^\d+(\.\d+)?$/.test(String(amount)))
    throw new Error("amount (token) must be number");
  const [whole, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (
    BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0")
  ).toString();
}

async function createApi({
  name,
  api_url,
  merchant_wallet,
  token_address,
  amount_wei,
  valid_for_sec,
  chain_id,
}) {
  const res = await fetch("/api/402/apis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_name: name || "Untitled API",
      p_api_url: api_url,
      p_merchant_wallet: merchant_wallet.toLowerCase(),
      p_token_address: token_address.toLowerCase(),
      p_amount_wei: amount_wei,
      p_valid_for_sec: valid_for_sec ?? 5,
      p_chain_id: chain_id ?? 43114,
      p_fee_bps_snapshot: 100,
    }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to create"));
  const data = await res.json();
  return data.apiId;
}

/**
 * Props:
 * - onSuccess?: (payload) => void   // called with { apiId, summary }
 * - defaultChainId?: number         // default 43114
 * - defaultValidSec?: number        // default 5
 */
export default function FormBuilder({
  onSuccess,
  defaultChainId = 43114,
  defaultValidSec = 5 * 60,
}) {
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [merchant, setMerchant] = useState("");

  // token selection (dropdown)
  const tokenAddresses = {
    avax: "0x0000000000000000000000000000000000000000",
    arena: "0xB8d7710f7d8349A506b75dD184F05777c82dAd0C",
    gladius: "0x34a1D2105dd1b658A48EAD516A9CE3032082799C",
  };
  const [tokenKey, setTokenKey] = useState("avax");
  const tokenAddress = tokenAddresses[tokenKey];

  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("token"); // 'token' | 'wei'
  const [validSec, setValidSec] = useState(defaultValidSec);
  const [chainId, setChainId] = useState(defaultChainId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const handleSubmit = async () => {
    try {
      setErr("");
      setOkMsg("");
      if (!apiUrl || !/^https?:\/\//i.test(apiUrl))
        throw new Error("Valid API URL required (http/https)");
      if (!isHexAddress(merchant))
        throw new Error("Merchant must be 0x + 40 hex");
      if (!isHexAddress(tokenAddress))
        throw new Error("Selected token address is invalid");
      if (!amount) throw new Error("Amount required");

      const amount_wei = toWeiString(amount, unit);
      setLoading(true);

      const apiId = await createApi({
        name: name || "Untitled API",
        api_url: apiUrl,
        merchant_wallet: merchant,
        token_address: tokenAddress,
        amount_wei,
        valid_for_sec: Number(validSec) || 5,
        chain_id: Number(chainId) || 43114,
      });

      const summary = {
        name: name || "Untitled API",
        api_url: apiUrl,
        merchant_wallet: merchant.toLowerCase(),
        token_address: tokenAddress.toLowerCase(),
        amount_wei,
        valid_for_sec: Number(validSec) || 5,
        chain_id: Number(chainId) || 43114,
      };

      setOkMsg(`Saved. id: ${apiId}`);
if (onSuccess) onSuccess({ apiId, summary, tokenKey });
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Create x402 API</h2>
          <p className="text-sm text-slate-600 mt-1">
            Configure your API payment settings and parameters
          </p>
        </div>

        <div className="px-6 py-5 space-y-5 text-slate-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                API description <span className="text-slate-400">(optional)</span>
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter API description"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Merchant Wallet Address <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="0x..."
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              API URL <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="https://api.example.com/endpoint"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Token <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                value={tokenKey}
                onChange={(e) => setTokenKey(e.target.value)}
              >
                <option value="avax">AVAX (native)</option>
                <option value="arena">ARENA (ERC-20)</option>
                <option value="gladius">GLADIUS (ERC-20)</option>
              </select>
           
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
               
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Session Duration (seconds)
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="5"
              value={validSec}
              onChange={(e) => setValidSec(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">Default: 5 minutes</p>
          </div>
        </div>

        {(err || okMsg) && (
          <div className="px-6 pb-4">
            {err && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{err}</p>
              </div>
            )}
            {okMsg && (
              <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-sm text-emerald-700">{okMsg}</p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-200 px-6 py-4 text-slate-500 bg-slate-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              <span className="text-red-500">*</span> Required fields
            </p>
            <button
              disabled={loading}
              onClick={handleSubmit}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Saving..." : "Save API"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
