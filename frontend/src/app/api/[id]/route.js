// app/api/[id]/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const CONTRACT_ADDRESS = "0xDa90Fac43937AD84dC9483ff118C8c2CEc5f1F56";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function ok(json) {
  return NextResponse.json(json, { status: 200 });
}
function payRequired(json) {
  return NextResponse.json(json, { status: 402 });
}
function badRequest(msg = "bad_request") {
  return NextResponse.json({ code: msg, data: {} }, { status: 400 });
}
function serverErr(msg) {
  return NextResponse.json(
    { code: "server_error", data: {}, error: msg },
    { status: 500 }
  );
}

export async function GET(req, ctx) {
  const { id } = await ctx.params; 
  if (!id) return badRequest("missing_id");

  // 1) Load API config (full row so we can return it on success)
  const { data: api, error: apiError } = await supabase
    .from("apis_402")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (apiError) return serverErr(apiError.message);
  if (!api)
    return NextResponse.json({ code: "not_found", data: {} }, { status: 404 });

  const amountWeiStr = String(api.amount_wei);

  // 2) Read session from header
  const sessionIdHex =
    req.headers.get("x-402-session") || req.headers.get("X-402-Session");

  const paymentInfo = (sessionHex) => ({
    session_id: sessionHex,
    network: { chain_id: api.chain_id, name: "Avalanche C-Chain" },
    contract: CONTRACT_ADDRESS,
    amount_wei: amountWeiStr,
    merchant_wallet: api.merchant_wallet,
    token_address: api.token_address,
    calls: {
      native: {
        fn: "payNativeFor(bytes32 sessionId, address merchant)",
        value: amountWeiStr,
        args: [sessionHex, api.merchant_wallet],
      },
      erc20_approve_then_pay: {
        approve: { spender: CONTRACT_ADDRESS, amount: amountWeiStr },
        payFor: {
          fn: "payFor(bytes32 sessionId, address merchant, address token, uint256 amount)",
          args: [sessionHex, api.merchant_wallet, api.token_address, amountWeiStr],
        },
      },
      erc20_permit: {
        fn: "payForWithPermit(bytes32,address,address,uint256,uint256,uint8,bytes32,bytes32)",
        args: {
          sessionId: sessionHex,
          merchant: api.merchant_wallet,
          token: api.token_address,
          amount: amountWeiStr,
          deadline: "<unix_ts>",
          v_r_s: "<v,r,s>",
        },
      },
    },
  });

  // 3) If no session header, create a pending session and return 402 with instructions
  if (!sessionIdHex) {
    const newSessionHex = "0x" + randomBytes(32).toString("hex");

    const { error: insertErr } = await supabase.from("sessions_402").insert({
      session_id_hex: newSessionHex,
      api_id: api.id,
      merchant_wallet: api.merchant_wallet,
      token_address: api.token_address,
      amount_wei: amountWeiStr,
      chain_id: api.chain_id,
      status: "pending",
    });

    if (insertErr) return serverErr(insertErr.message);

    return payRequired({
      code: "payment_required",
      data: paymentInfo(newSessionHex),
    });
  }

  // 4) Check if session is valid and paid (active)
  const nowIso = new Date().toISOString();
  const { data: session, error: sessionErr } = await supabase
    .from("sessions_402")
    .select("id, session_id_hex, status, expires_at, api_id")
    .eq("session_id_hex", sessionIdHex)
    .eq("api_id", id)
    .eq("status", "paid")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (sessionErr) return serverErr(sessionErr.message);

  if (!session) {
    // Check whether the provided session exists but is expired or pending
    const { data: sessionAny, error: sessionAnyErr } = await supabase
      .from("sessions_402")
      .select("session_id_hex, status, expires_at")
      .eq("session_id_hex", sessionIdHex)
      .eq("api_id", id)
      .maybeSingle();

    if (sessionAnyErr) return serverErr(sessionAnyErr.message);

    if (
      sessionAny &&
      sessionAny.status === "paid" &&
      sessionAny.expires_at &&
      new Date(sessionAny.expires_at).toISOString() <= nowIso
    ) {
      // Optional: mint a fresh pending session for quick re-purchase
      const newSessionHex = "0x" + randomBytes(32).toString("hex");
      const { error: insertErr2 } = await supabase.from("sessions_402").insert({
        session_id_hex: newSessionHex,
        api_id: api.id,
        merchant_wallet: api.merchant_wallet,
        token_address: api.token_address,
        amount_wei: amountWeiStr,
        chain_id: api.chain_id,
        status: "pending",
      });
      if (insertErr2) return serverErr(insertErr2.message);

      return NextResponse.json(
        {
          code: "session_expired",
          data: paymentInfo(newSessionHex),
          meta: {
            previous_session: sessionIdHex,
            expired_at: sessionAny.expires_at,
          },
        },
        { status: 402 }
      );
    }

    // Pending or unknown → generic 402 with the provided session (so user can finish payment)
    return payRequired({
      code: "payment_required",
      data: paymentInfo(sessionAny ? sessionIdHex : sessionIdHex),
    });
  }

  // 5) ✅ Session valid — fetch data from the real API URL and return FULL API info + session + upstream
  try {
    const response = await fetch(api.api_url);
    const contentType = response.headers.get("content-type") || "";
    let upstream;

    if (contentType.includes("application/json")) {
      upstream = await response.json();
    } else if (contentType.startsWith("image/")) {
      upstream = { image_url: api.api_url };
    } else {
      upstream = await response.text();
    }

    return ok({
      code: "successful",
      data: {
        api, // full apis_402 row
        session: {
          id: session.id,
          session_id_hex: session.session_id_hex,
          expires_at: session.expires_at,
        },
        upstream: {
          status: response.status,
          content_type: contentType,
          body: upstream,
        },
      },
    });
  } catch (err) {
    return serverErr(`Failed to fetch API URL: ${err.message}`);
  }
}
