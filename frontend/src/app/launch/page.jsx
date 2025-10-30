"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/navbar";

export default function LaunchPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");

  const handleCreateToken = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ name, symbol });
      const res = await fetch(`/api/create-token?${params.toString()}`, {
        method: "GET",
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data || { message: "Unknown error" });
      } else {
        setResult(data);
      }
    } catch (e) {
      setError({ message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Coming soon</h2>
          <p className="text-slate-600 text-sm">
            We are building a token launch experience powered by x402 payments in ARENA. You will be able to configure parameters,
            collect payments, and distribute access seamlessly.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/gate"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
            >
              Gate an API now
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 text-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Token Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Token"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="MYT"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={handleCreateToken}
              disabled={loading || !name || !symbol}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create token"}
            </button>
          </div>

          {(result || error) && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
              <div className="font-medium mb-2">Result</div>
              <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(result || error, null, 2)}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
