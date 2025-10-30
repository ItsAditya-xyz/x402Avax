"use client";

import Link from "next/link";
import Navbar from "../../components/navbar";

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">What do you want to do?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Link href="/gate" className="group block">
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
              <div className="text-sm font-medium text-emerald-700 mb-1">Gate an API</div>
              <div className="text-slate-900 text-lg font-semibold mb-1">x402 Protocol</div>
              <p className="text-slate-600 text-sm">
                Protect any API endpoint behind micropayments. Create x402 masked URLs for agents and users with Arena Tokens
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-emerald-700 text-sm">
                <span className="group-hover:underline">Get started</span>
                <span>→</span>
              </div>
            </div>
          </Link>

          <Link href="/launch" className="group block">
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
              <div className="text-sm font-medium text-emerald-700 mb-1">Launch Token</div>
              <div className="text-slate-900 text-lg font-semibold mb-1">Using X402 (ARENA)</div>
              <p className="text-slate-600 text-sm">
                Spin up a token launch powered by x402 payments in ARENA. Coming soon.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-emerald-700 text-sm">
                <span className="group-hover:underline">Preview</span>
                <span>→</span>
              </div>
            </div>
          </Link>
        </div>

       
      </main>
    </div>
  );
}
