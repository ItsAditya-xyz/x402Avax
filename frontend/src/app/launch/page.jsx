"use client";

import Link from "next/link";
import Navbar from "../../../components/navbar";

export default function LaunchPage() {
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
          <div className="mt-6">
            <Link href="/gate" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700">Gate an API now</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
