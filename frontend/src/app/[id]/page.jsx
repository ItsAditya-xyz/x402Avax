// app/[id]/page.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import Link from "next/link";
import { useParams } from "next/navigation";
// --- Minimal ABIs ---
const X402_ABI = [
  // pay native
  {
    type: "function",
    name: "payNativeFor",
    stateMutability: "payable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "merchant", type: "address" },
    ],
    outputs: [],
  },
  // pay erc20 (after approve)
  {
    type: "function",
    name: "payFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
];

const SESSION_STORAGE_KEY = "x402_session_by_api_id"; // map apiId -> sessionHex

function getStoredSession(id) {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[id] || null;
  } catch {
    return null;
  }
}
function setStoredSession(id, sessionHex) {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = sessionHex;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function JSONPretty({ data }) {
  const json = useMemo(() => JSON.stringify(data, null, 2), [data]);
  return (
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm">
      {json}
    </pre>
  );
}

export default function ApiHumanPage() {

    const tokenAddresses = {
  avax: "0x0000000000000000000000000000000000000000",
  arena: "0xB8d7710f7d8349A506b75dD184F05777c82dAd0C",
  gladius: "0x34a1D2105dd1b658A48EAD516A9CE3032082799C",
};


  const params = useParams();
const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [view, setView] = useState("loading"); // loading | pay | paying | showing | error
  const [apiMeta, setApiMeta] = useState(null); // the full "api" row when paid
  const [upstream, setUpstream] = useState(null); // { status, content_type, body }
  const [payInfo, setPayInfo] = useState(null);  // paymentRequired.data payload
  const [errMsg, setErrMsg] = useState("");
  const [sessionHex, setSessionHex] = useState(null);

  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const contractAddress = useMemo(() => {
    // Returned by backend in payInfo.contract
    return payInfo?.contract;
  }, [payInfo]);

const doFetch = async (sessionOverride = null, opts = { fromPoll: false }) => {
  const fromPoll = !!opts?.fromPoll;

  // Don't spam visible errors while polling
  if (!fromPoll) setErrMsg("");

  // If we're currently "paying", do NOT let non-polling calls downgrade the UI back to "pay"
  // (prevents races where an earlier fetch finishes late and flips the screen)
  const allowDowngrade = !(viewRef.current === "paying" && !fromPoll);

  try {
    const headers = {};
    const sess = sessionOverride ?? getStoredSession(id);
    if (sess) headers["X-402-Session"] = sess;

    const res = await fetch(`/api/${id}`, { headers });
    const json = await res.json().catch(() => ({}));

    if (res.status === 200 && json?.code === "successful") {
      setView("showing");
      setApiMeta(json?.data?.api || null);
      setUpstream(json?.data?.upstream || null);

      // persist session if we used/received one
      const persisted = sess ?? sessionHex;
      if (persisted) setSessionHex(persisted);
      return;
    }

    if (res.status === 402) {
      // Still locked. Only downgrade to "pay" if we're allowed to.
      if (allowDowngrade) setView("pay");

      const info = json?.data;
      if (info?.session_id) {
        setSessionHex(info.session_id);
        setStoredSession(id, info.session_id);
      }
      setPayInfo(info);
      return;
    }

    // Other 4xx/5xx
    if (allowDowngrade) {
      setView("error");
      setErrMsg(json?.error || json?.code || `HTTP ${res.status}`);
    }
  } catch (e) {
    if (allowDowngrade) {
      setView("error");
      setErrMsg(e?.message || "Network error");
    }
  }
};

  const tokenName = useMemo(() => {
  if (!payInfo?.token_address) return "";
  const addr = payInfo.token_address.toLowerCase();
  if (addr === tokenAddresses.avax.toLowerCase()) return "AVAX";
  if (addr === tokenAddresses.arena.toLowerCase()) return "ARENA";
  if (addr === tokenAddresses.gladius.toLowerCase()) return "GLADIUS";
  return "TOKEN";
}, [payInfo]);

  // ---- FIX #1: Polling logic uses stale state (use refs + cleanup) ----
  const viewRef = useRef(view);
  const sessionRef = useRef(sessionHex);
  const pollIntervalRef = useRef(null);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { sessionRef.current = sessionHex; }, [sessionHex]);

  const startPolling = () => {
    setView("paying");
    let tries = 0;
    const maxTries = 45; // ~90s if interval=2s

    // clear any existing poller before starting a new one
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    const intervalId = setInterval(async () => {
      tries += 1;
      await doFetch(sessionRef.current);
      if (viewRef.current === "showing") {
        clearInterval(intervalId);
        pollIntervalRef.current = null;
        return;
      }
      if (tries >= maxTries) {
        clearInterval(intervalId);
        pollIntervalRef.current = null;
        setView("pay"); // back to pay state
      }
    }, 2000);

    pollIntervalRef.current = intervalId;
  };

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);
  // ---- END FIX #1 ----

  useEffect(() => {
    // initial load: use stored session header if present
    const stored = getStoredSession(id);
    if (stored) setSessionHex(stored);
    doFetch(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Helpers
  const isNative = useMemo(() => {
    if (!payInfo?.token_address) return false;
    const a = payInfo.token_address.toLowerCase();
    return a === zeroAddress || a === "0x0000000000000000000000000000000000000000";
  }, [payInfo]);

  const amountWei = useMemo(() => {
    try {
      return BigInt(payInfo?.amount_wei ?? "0");
    } catch {
      return 0n;
    }
  }, [payInfo]);

  // Try to read ERC20 decimals/symbol only if needed



  // Pay handlers
  const handlePayNative = async () => {
    if (!isConnected) return;
    if (!contractAddress || !payInfo?.merchant_wallet || !sessionHex) return;

    try {
      setErrMsg("");
      // write to contract (payable)
      await writeContractAsync({
        abi: X402_ABI,
        address: contractAddress,
        functionName: "payNativeFor",
        args: [sessionHex, payInfo.merchant_wallet],
        value: amountWei,
        chainId: payInfo?.network?.chain_id,
      });

      // begin polling backend until paid
      startPolling();
    } catch (e) {
      setErrMsg(e?.shortMessage || e?.message || "Transaction failed");
      setView("pay");
    }
  };

  const handlePayERC20 = async () => {
    if (!isConnected) return;
    if (!contractAddress || !payInfo?.merchant_wallet || !sessionHex) return;

    try {
      setErrMsg("");
      // 1) approve
      await writeContractAsync({
        abi: ERC20_ABI,
        address: payInfo.token_address,
        functionName: "approve",
        args: [contractAddress, amountWei],
        chainId: payInfo?.network?.chain_id,
      });
      // 2) payFor
      await writeContractAsync({
        abi: X402_ABI,
        address: contractAddress,
        functionName: "payFor",
        args: [sessionHex, payInfo.merchant_wallet, payInfo.token_address, amountWei],
        chainId: payInfo?.network?.chain_id,
      });

      startPolling();
    } catch (e) {
      setErrMsg(e?.shortMessage || e?.message || "Transaction failed");
      setView("pay");
    }
  };

  const prettyAmount = useMemo(() => {
  if (!amountWei) return "0";
  return `${Number(formatUnits(amountWei, 18))} `;
}, [amountWei, tokenName]);

  // UI blocks
  const PayPanel = () => {
    if (!payInfo) return null;
    return (
      <div className="w-full max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Payment required</h1>
        <p className="text-slate-600 text-sm mb-4">
          This endpoint is gated by <span className="font-mono">x402</span>. Complete the payment to unlock.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm mb-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Amount</span>
         <span className="font-medium text-slate-900">{prettyAmount} ${tokenName}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-slate-600">Network</span>
            <span className="font-medium text-slate-900">
              {payInfo.network?.name || "Avalanche C-Chain"} ({payInfo.network?.chain_id})
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-slate-600">Session</span>
            <code className="text-[12px] text-slate-800">
              {sessionHex?.slice(0, 10)}…{sessionHex?.slice(-6)}
            </code>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-slate-600">Merchant</span>
            <code className="text-[12px] text-slate-600">{payInfo.merchant_wallet}</code>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-slate-600">Contract</span>
            <code className="text-[12px] text-slate-600">{payInfo.contract}</code>
          </div>
        </div>

        {!isConnected && (
          <div className="mb-3">
            <appkit-button class="" />
          </div>
        )}

    <div className="mt-4">
  <button
    onClick={isNative ? handlePayNative : handlePayERC20}
    disabled={!isConnected}
    className={`w-full px-4 py-3 rounded-lg text-white text-sm font-semibold transition
      ${isConnected ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90" : "bg-slate-400 cursor-not-allowed"}
    `}
  >
    {isConnected
      ? `Pay ${prettyAmount} ${tokenName}`
      : "Connect wallet to pay"}
  </button>
</div>

        {errMsg ? (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            {errMsg}
          </div>
        ) : null}

        <div className="mt-4 text-xs text-slate-500">
          Your browser keeps the session id locally. After confirming the transaction, we’ll auto-refresh
          until your access is unlocked.
        </div>
      </div>
    );
  };

  const ShowingPanel = () => {
    const ctype = upstream?.content_type || "";
    const isImage = ctype.startsWith("image/") || upstream?.body?.image_url;
    const imageUrl = upstream?.body?.image_url || apiMeta?.api_url;

    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Unlocked ✅</h2>
          <p className="text-slate-600 text-sm">
            Status {upstream?.status} • <span className="font-mono">{ctype || "unknown"}</span>
          </p>
        </div>

        {isImage ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <img
              src={imageUrl}
              alt="Unlocked content"
              className="w-full h-auto rounded-xl"
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <JSONPretty data={upstream?.body ?? {}} />
          </div>
        )}

        <div className="mt-4 text-center">
          <button
            onClick={() => doFetch(sessionHex)}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto h-14 px-4 flex items-center justify-between">
          <div className="text-slate-900 font-semibold hover:cursor-pointer"
          onClick={()=>{
            window.location.href = "/"
          }}
          >x402 View</div>
          <div className="flex items-center gap-3 text-slate-900">
            <appkit-button class="" />
            
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {view === "loading" && (
          <div className="flex items-center justify-center py-24 text-slate-600">
            Loading…
          </div>
        )}

        {view === "pay" && <PayPanel />}

        {view === "paying" && (
          <div className="w-full max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
            <div className="text-slate-900 font-semibold mb-2">Waiting for confirmation…</div>
            <p className="text-slate-600 text-sm">
              We’re checking every 2s to see if your session is unlocked.
            </p>
            <div className="mt-4">
              <button
                onClick={() => doFetch(sessionHex)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
              >
                Manual refresh
              </button>
            </div>
          </div>
        )}

        {view === "showing" && <ShowingPanel />}

        {view === "error" && (
          <div className="w-full max-w-xl mx-auto bg-white rounded-2xl border border-red-200 shadow-sm p-6">
            <div className="text-red-700 font-semibold mb-1">Error</div>
            <div className="text-sm text-red-600">{errMsg}</div>
            <div className="mt-4">
              <button
                onClick={() => doFetch(sessionHex)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
