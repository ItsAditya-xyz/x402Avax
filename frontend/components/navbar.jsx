"use client";

import Link from "next/link";
import gladiusImage from "../public/icons/arena.svg";

export default function Navbar({ showWallet = false }) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center">
            <img src={gladiusImage.src} alt="Logo" className="w-10 h-10 rounded-xl" />
          </div>
          <span className="text-lg font-semibold text-slate-900">Arena X402</span>
        </Link>
        <div className="flex items-center gap-3">
          {showWallet ? <appkit-button class="" /> : null}
        </div>
      </div>
    </header>
  );
}

