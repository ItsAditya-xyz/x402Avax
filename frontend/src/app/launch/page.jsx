"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/navbar";

const ARENA_IMAGE_HOST = "https://static.starsarena.com/uploads/";

const tokenAddresses = {
  avax: "0x0000000000000000000000000000000000000000",
  arena: "0xB8d7710f7d8349A506b75dD184F05777c82dAd0C",
  gladius: "0x34a1D2105dd1b658A48EAD516A9CE3032082799C",
};

const isHexAddress = (value = "") => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

function toWeiString(amount) {
  if (!/^\d+(\.\d+)?$/.test(String(amount || ""))) {
    throw new Error("Payment amount must be a number");
  }
  const [whole, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return (
    BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0")
  ).toString();
}

function formatWeiToToken(weiStr, decimals = 18) {
  try {
    const wei = BigInt(weiStr || "0");
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

function resolveTokenName(addr = "") {
  const lower = addr.toLowerCase();
  if (lower === tokenAddresses.avax.toLowerCase()) return "AVAX";
  if (lower === tokenAddresses.arena.toLowerCase()) return "ARENA";
  if (lower === tokenAddresses.gladius.toLowerCase()) return "GLADIUS";
  return "TOKEN";
}

export default function LaunchPage() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [pictureSlug, setPictureSlug] = useState("");
  const [uploadInfo, setUploadInfo] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [merchant, setMerchant] = useState("");
  const [tokenKey, setTokenKey] = useState("avax");
  const [amount, setAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const hasResult = !!result?.apiId;

  const summaryTokenName = useMemo(
    () => resolveTokenName(result?.summary?.token_address || ""),
    [result]
  );

  const prettyAmount = useMemo(
    () => formatWeiToToken(result?.summary?.amount_wei || "0"),
    [result]
  );

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadInfo(null);

    try {
      const data = new FormData();
      data.append("file", file, file.name);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: data,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Upload failed");
      }

      setPictureSlug((json.slug || "").trim());
      setUploadInfo(json);
    } catch (e) {
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateLaunchApi = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!name.trim()) throw new Error("Token name is required");
      if (!symbol.trim()) throw new Error("Token symbol is required");
      if (!pictureSlug) throw new Error("Upload an image to generate a slug");
      if (!isHexAddress(merchant)) throw new Error("Merchant wallet must be 0x + 40 hex");
      if (!amount || Number(amount) <= 0) throw new Error("Payment amount must be greater than 0");

      const tokenAddress = tokenAddresses[tokenKey];
      if (!tokenAddress) throw new Error("Unknown token selection");

      const amountWei = toWeiString(amount);
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_ORIGIN;
      if (!origin) throw new Error("Unable to resolve site origin");

      const params = new URLSearchParams({
        name: name.trim(),
        symbol: symbol.trim(),
        picture: pictureSlug,
      });
      const apiUrl = `${origin}/api/create-token?${params.toString()}`;

      const payload = {
        p_name: name.trim(),
        p_api_url: apiUrl,
        p_merchant_wallet: merchant.trim().toLowerCase(),
        p_token_address: tokenAddress.toLowerCase(),
        p_amount_wei: amountWei,
        p_valid_for_sec: 3600000, // 1000 hours
        p_chain_id: 43114,
        p_fee_bps_snapshot: 100,
        p_onlyonce: true,
      };

      const res = await fetch("/api/402/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to create launch API");
      }

      const apiId = data.apiId;
      setResult({
        apiId,
        summary: {
          api_url: apiUrl,
          merchant_wallet: payload.p_merchant_wallet,
          token_address: payload.p_token_address,
          amount_wei: amountWei,
          valid_for_sec: payload.p_valid_for_sec,
        },
        tokenMeta: {
          name: name.trim(),
          symbol: symbol.trim(),
          slug: pictureSlug,
          imageUrl: uploadInfo?.url || `${ARENA_IMAGE_HOST}${pictureSlug}`,
        },
      });
    } catch (e) {
      setError(e?.message || "Failed to create launch API");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    !!name &&
    !!symbol &&
    !!pictureSlug &&
    !!merchant &&
    !!amount &&
    !uploading &&
    !loading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {!hasResult && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Launch tokens with x402
            </h2>
            <p className="text-slate-600 text-sm">
              Configure token metadata and the payment you want to collect. We will create a masked API that, once paid, mints the token from the Arena wallet.
            </p>

            <div className="mt-6 space-y-6 text-slate-800">
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Token metadata
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Token Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Arena Ninjas"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="NINJA"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Upload icon
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Uploading stores the icon on StarsArena and auto-generates the slug.
                  </p>
                  {uploading && (
                    <p className="mt-2 text-sm text-slate-600">Uploading image…</p>
                  )}
                  {uploadError && (
                    <p className="mt-2 text-sm text-red-600">{uploadError}</p>
                  )}
                  {uploadInfo?.url && (
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={uploadInfo.url}
                        alt="Token preview"
                        className="w-16 h-16 rounded-lg border border-slate-200 object-cover"
                      />
                      <div className="text-xs text-slate-500 break-all">
                        Slug: <span className="font-mono text-slate-900">{pictureSlug}</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Payment parameters
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Merchant wallet
                    </label>
                    <input
                      type="text"
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      placeholder="0x..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Token to collect
                    </label>
                    <select
                      value={tokenKey}
                      onChange={(e) => setTokenKey(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="avax">AVAX (native)</option>
                      <option value="arena">ARENA (ERC-20)</option>
                      <option value="gladius">GLADIUS (ERC-20)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment amount
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.5"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Amount is interpreted in whole tokens (18 decimals).
                  </p>
                </div>

             
              </section>
            </div>

            {error && (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Link
                href="/gate"
                className="text-sm text-slate-600 hover:underline"
              >
                Need a standard API gate?
              </Link>
              <button
                onClick={handleCreateLaunchApi}
                disabled={!canSubmit}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? "Saving..." : "Create launch API"}
              </button>
            </div>
          </div>
        )}

        {hasResult && (
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              ✅ Launch API ready
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              Share these endpoints with users and agents. Once paid, we will call your minting API exactly once.
            </p>

            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="text-slate-600">x402 URI (Agents)</div>
                <a
                  href={`/api/${result.apiId}`}
                  className="text-emerald-700 hover:underline break-all"
                  target="_blank"
                >
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/${result.apiId}`
                    : `/api/${result.apiId}`}
                </a>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="text-slate-600">x402 URL (Users)</div>
                <a
                  href={`/${result.apiId}`}
                  className="text-emerald-700 hover:underline break-all"
                  target="_blank"
                >
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/${result.apiId}`
                    : `/${result.apiId}`}
                </a>
              </div>
             
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-600">Token</div>
                <div className="text-slate-900 font-medium">{summaryTokenName}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-600">Amount</div>
                <div className="text-slate-900 font-medium">{prettyAmount}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-600">Session duration</div>
                <div className="text-slate-900 font-medium">
                  {result.summary.valid_for_sec}s
                </div>
              </div>
            </div>

            <div className="mt-6 border border-slate-100 rounded-xl p-4 flex items-center gap-4">
              {result.tokenMeta?.imageUrl && (
                <img
                  src={result.tokenMeta.imageUrl}
                  alt="Token icon"
                  className="w-16 h-16 rounded-xl border border-slate-200 object-cover"
                />
              )}
              <div>
                <div className="text-slate-900 font-medium">
                  {result.tokenMeta?.name} • {result.tokenMeta?.symbol}
                </div>
                <div className="text-xs text-slate-500 break-all">
                  Slug: <span className="font-mono">{result.tokenMeta?.slug}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/${result.apiId}`}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
              >
                Open user view
              </Link>
              <Link
                href={`/api/${result.apiId}`}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white"
              >
                Open agent URI
              </Link>
              <Link
                href="/launch"
                className="ml-auto text-sm text-emerald-700 hover:underline"
              >
                Create another
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
