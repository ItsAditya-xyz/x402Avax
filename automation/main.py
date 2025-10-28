import os
import json
import time
from datetime import datetime, timezone, timedelta
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv
from web3 import Web3
from supabase import create_client, Client

load_dotenv()

# ---------- ENV ----------
RPC_URL = os.getenv("RPC_URL")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
START_BLOCK = int(os.getenv("START_BLOCK", "0"))
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "1"))
BLOCK_STEP = int(os.getenv("BLOCK_STEP", "1000"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not (RPC_URL and CONTRACT_ADDRESS and SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
    raise RuntimeError("Missing one or more required env vars.")

# ---------- WEB3 ----------
w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
if not w3.is_connected():
    raise RuntimeError("Web3 provider not connected")

CONTRACT_ADDRESS = Web3.to_checksum_address(CONTRACT_ADDRESS)

# Only the Paid event ABI
X402_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "internalType": "bytes32", "name": "sessionId",   "type": "bytes32"},
            {"indexed": True,  "internalType": "address", "name": "payer",       "type": "address"},
            {"indexed": True,  "internalType": "address", "name": "merchant",    "type": "address"},
            {"indexed": False, "internalType": "address", "name": "token",       "type": "address"},
            {"indexed": False, "internalType": "uint256", "name": "amountGross", "type": "uint256"},
            {"indexed": False, "internalType": "uint256", "name": "fee",         "type": "uint256"},
            {"indexed": False, "internalType": "uint256", "name": "amountNet",   "type": "uint256"},
        ],
        "name": "Paid",
        "type": "event",
    }
]
contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=X402_ABI)
PaidEvent = contract.events.Paid

# Compute the Paid event topic once and guarantee "0x" prefix
_paid_sig_txt = "Paid(bytes32,address,address,address,uint256,uint256,uint256)"
_tmp_topic = w3.keccak(text=_paid_sig_txt)
try:
    _topic_hex = _tmp_topic.hex()
except Exception:
    _topic_hex = None
if not _topic_hex:
    _topic_hex = "0x" + bytes(_tmp_topic).hex()
elif not _topic_hex.startswith("0x"):
    _topic_hex = "0x" + _topic_hex
PAID_TOPIC = _topic_hex

ZERO_ADDR = "0x0000000000000000000000000000000000000000"
AVAX_C_CHAIN_ID = 43114  # Avalanche C-Chain

# ---------- SUPABASE ----------
sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ---------- STATE ----------
STATE_FILE = "x402_indexer_state.json"

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                data = json.load(f)
                return int(data.get("last_block", START_BLOCK))
        except Exception:
            pass
    return START_BLOCK

def save_state(last_block):
    with open(STATE_FILE, "w") as f:
        json.dump({"last_block": last_block}, f)

# ---------- Helpers ----------
def to_lower(addr):
    return (addr or "").lower()

def norm_addr_or_zero(addr):
    if not addr:
        return ZERO_ADDR
    a = addr.lower()
    if a == ZERO_ADDR:
        return ZERO_ADDR
    try:
        return Web3.to_checksum_address(addr).lower()
    except Exception:
        return a

def bytes32_to_hex(b):
    # 0x + 64 hex chars
    if isinstance(b, (bytes, bytearray)):
        return "0x" + b.hex().rjust(64, "0")
    if isinstance(b, str) and b.startswith("0x"):
        h = b[2:]
        return "0x" + h.rjust(64, "0")[:64]
    try:
        return "0x" + bytes(b).hex().rjust(64, "0")
    except Exception:
        return str(b)

def get_block_time(block_number):
    block = w3.eth.get_block(block_number)
    return datetime.fromtimestamp(block.timestamp, tz=timezone.utc)

def strict_session_match(ev, session_row):
    ev_merchant = norm_addr_or_zero(ev["merchant"])
    ev_token    = norm_addr_or_zero(ev["token"])

    db_merchant = norm_addr_or_zero(session_row.get("merchant_wallet"))
    db_token    = norm_addr_or_zero(session_row.get("token_address"))

    merchant_ok = ev_merchant == db_merchant
    token_ok    = ev_token == db_token

    # amount
    expected_amount = session_row.get("amount_wei")
    try:
        expected_amount = int(str(expected_amount))
    except Exception:
        expected_amount = None
    amount_ok = (expected_amount is not None) and (int(ev["amountGross"]) == expected_amount)

    # chain
    chain_ok  = int(session_row.get("chain_id", 0)) == AVAX_C_CHAIN_ID

    # Only a boolean; no prints (keep output minimal)
    return merchant_ok and token_ok and amount_ok and chain_ok

def mark_session_paid(session_row, ev, block_time):
    api_id = session_row.get("api_id")

    # Fetch valid_for_sec
    try:
        api_res = (
            sb.table("apis_402")
            .select("valid_for_sec")
            .eq("id", api_id)
            .maybe_single()
            .execute()
        )
        api = api_res.data or {}
    except Exception as e:
        print(f"[DB ERR] apis_402 fetch error for {api_id}: {e}")
        return False

    valid_for_sec = int(api.get("valid_for_sec") or 0)
    expires_at = block_time + timedelta(seconds=valid_for_sec) if valid_for_sec > 0 else None

    update_payload = {
        "status": "paid",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if expires_at:
        update_payload["expires_at"] = expires_at.isoformat()

    # Optional: store last payment tx if the column exists on your schema
    if "last_payment_tx" in session_row or True:
        update_payload["last_payment_tx"] = ev["tx_hash"]

    try:
        upd = (
            sb.table("sessions_402")
            .update(update_payload)
            .eq("session_id_hex", session_row["session_id_hex"])
            .eq("status", "pending")
            .execute()
        )
    except Exception as e:
        print(f"[DB ERR] sessions_402 update error: {e}")
        return False

    # Only return boolean; caller prints success
    return bool(upd.data)

def record_payment(session_row_or_none, ev_payload):
    """
    Upsert immutable payment facts into payments_402.
    Idempotent on tx_hash. Stores both session_id (UUID) when known and session_id_hex (text).
    """
    session_id = session_row_or_none.get("id") if session_row_or_none else None
    payload = {
        "session_id": session_id,
        "session_id_hex": ev_payload["sessionId"],
        "tx_hash": ev_payload["tx_hash"],
        "block_number": ev_payload["blockNumber"],
        "block_time": ev_payload["blockTime"],
        "chain_id": AVAX_C_CHAIN_ID,
        "payer": ev_payload["payer"],
        "merchant": ev_payload["merchant"],
        "token": ev_payload["token"],
        "amount_gross": ev_payload["amountGross"],
        "fee": ev_payload["fee"],
        "amount_net": ev_payload["amountNet"],
    }

    try:
        sb.table("payments_402").upsert(payload, on_conflict="tx_hash").execute()
        return True
    except Exception as e:
        print(f"[DB ERR] payments_402 upsert error (tx={ev_payload['tx_hash']}): {e}")
        return False

def handle_paid_event(log):
    try:
        ev = PaidEvent().process_log(log)
    except Exception as e:
        print(f"[ERR] process_log: {e}")
        return

    args = ev["args"]

    session_hex = bytes32_to_hex(args["sessionId"])
    tx_hash = log["transactionHash"].hex()
    block_number = log["blockNumber"]
    try:
        block_time = get_block_time(block_number)
    except Exception as e:
        print(f"[ERR] get_block_time: {e}")
        return

    # Normalize event fields
    try:
        payer    = Web3.to_checksum_address(args["payer"])
        merchant = Web3.to_checksum_address(args["merchant"])
        token_raw = args["token"]
        token_norm = ZERO_ADDR if to_lower(token_raw) == to_lower(ZERO_ADDR) else Web3.to_checksum_address(token_raw)
    except Exception as e:
        print(f"[ERR] normalize_fields: {e}")
        return

    event_payload = {
        "sessionId": session_hex,
        "payer": payer,
        "merchant": merchant,
        "token": token_norm,  # checksum or ZERO_ADDR
        "amountGross": int(args["amountGross"]),
        "fee": int(args["fee"]),
        "amountNet": int(args["amountNet"]),
        "tx_hash": tx_hash,
        "blockNumber": block_number,
        "blockTime": block_time.isoformat(),
    }

    # Find the session (errors only)
    session_row = None
    try:
        sess = (
            sb.table("sessions_402")
            .select("id, api_id, session_id_hex, status, merchant_wallet, token_address, amount_wei, chain_id, last_payment_tx")
            .eq("session_id_hex", session_hex)
            .maybe_single()
            .execute()
        )
        session_row = sess.data
    except Exception as e:
        print(f"[DB ERR] sessions_402 lookup error: {e}")

    # Always record payment facts (errors only)
    record_payment(session_row, event_payload)

    # If no session row or not pending or mismatch, silently ignore (no noise)
    if not session_row:
        return
    if session_row.get("status") != "pending":
        return
    if not strict_session_match(event_payload, session_row):
        return

    # Try to flip to paid; on success print the minimal success line with block
    try:
        ok = mark_session_paid(session_row, event_payload, block_time)
        if ok:
            print(f"marked paid for session: {session_hex} (block {block_number})")
    except Exception as e:
        print(f"[ERR] mark_session_paid: {e}")

def main():
    last_block = load_state()

    while True:
        try:
            latest = w3.eth.block_number
            if last_block == 0:
                last_block = latest  # start "now" if not set

            if last_block > latest:
                time.sleep(POLL_INTERVAL)
                continue

            to_block = min(last_block + BLOCK_STEP - 1, latest)

            try:
                logs = w3.eth.get_logs({
                    "fromBlock": last_block,
                    "toBlock": to_block,
                    "address": CONTRACT_ADDRESS,
                    "topics": [PAID_TOPIC],
                })
            except Exception as e:
                print(f"[ERR] get_logs: {e}")
                logs = []

            if logs:
                for lg in logs:
                    try:
                        handle_paid_event(lg)
                    except Exception as e:
                        print(f"[ERR] handle_paid_event: {e}")

            last_block = to_block + 1
            save_state(last_block)
            time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"[LOOP ERR] {e}")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
