

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cancel_limit_order_reserved"("p_user_id" "uuid", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_order RECORD;
  v_position RECORD;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND user_id = p_user_id AND type = 'limit' AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.side = 'buy' THEN
    UPDATE users SET available_balance = available_balance + v_order.amount
    WHERE id = p_user_id;

  ELSIF v_order.side = 'sell' THEN
    SELECT * INTO v_position FROM positions WHERE user_id = p_user_id AND symbol = v_order.symbol FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Position not found';
    END IF;

    UPDATE positions
    SET reserved_quantity = reserved_quantity - v_order.quantity
    WHERE id = v_position.id;
  END IF;

  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."cancel_limit_order_reserved"("p_user_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_leverage_order"("p_user_id" "uuid", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_order RECORD;
  v_position RECORD;
  v_closed_quantity NUMERIC;
  v_new_qty NUMERIC;
  v_new_margin NUMERIC;
  v_new_avg_price NUMERIC;
  v_new_leverage NUMERIC;
  v_remaining_notional NUMERIC;
BEGIN
  -- ✅ Lock order row
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND user_id = p_user_id AND type = 'leverage' AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- ✅ Lock corresponding position row
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND symbol = v_order.symbol
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  -- ✅ Perform calculations safely inside transaction

  v_closed_quantity := v_order.amount / v_order.price;

  v_new_qty := v_position.quantity - v_closed_quantity;
  v_new_margin := v_position.margin - v_order.margin;

  IF v_new_qty <= 0.0000001 THEN
    -- Full position closed
    DELETE FROM positions WHERE id = v_position.id;
  ELSE
    -- Weighted new average price
    v_remaining_notional := (v_position.quantity * v_position.average_price) - (v_closed_quantity * v_order.price);
    v_new_avg_price := v_remaining_notional / v_new_qty;

    -- Weighted new leverage
    v_new_leverage := ((v_position.margin * v_position.leverage) - (v_order.margin * v_order.leverage)) / v_new_margin;

    UPDATE positions
    SET quantity = v_new_qty,
        average_price = v_new_avg_price,
        leverage = ROUND(v_new_leverage::numeric, 4),
        margin = v_new_margin,
        updated_at = NOW()
    WHERE id = v_position.id;
  END IF;

  -- ✅ Refund margin back to user's available balance
  UPDATE users
  SET available_balance = available_balance + v_order.margin
  WHERE id = p_user_id;

  -- ✅ Mark order as closed
  UPDATE orders
  SET status = 'closed', closed_at = NOW()
  WHERE id = p_order_id;

END;
$$;


ALTER FUNCTION "public"."close_leverage_order"("p_user_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_leverage_position"("p_user_id" "uuid", "p_position_id" "uuid", "p_current_price" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_position RECORD;
  v_notional NUMERIC;
  v_position_value NUMERIC;
  v_pnl NUMERIC;
  v_final_balance NUMERIC;
BEGIN
  -- ✅ Lock position row for update
  SELECT * INTO v_position
  FROM positions
  WHERE id = p_position_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  -- ✅ Compute notional value
  v_notional := v_position.margin * v_position.leverage;
  v_position_value := p_current_price * v_position.quantity;

  -- ✅ Calculate PnL based on LONG/SHORT
  IF v_position.symbol LIKE '%LONG/%' THEN
    v_pnl := v_position_value - v_notional;
  ELSIF v_position.symbol LIKE '%SHORT/%' THEN
    v_pnl := v_notional - v_position_value;
  ELSE
    v_pnl := 0;
  END IF;

  -- ✅ Calculate final refund
  v_final_balance := v_position.margin + v_pnl;

  -- ✅ Delete position
  DELETE FROM positions WHERE id = p_position_id;

  -- ✅ Refund user balance atomically
  UPDATE users
  SET available_balance = available_balance + v_final_balance
  WHERE id = p_user_id;

  -- ✅ Update matching leverage order(s)
  UPDATE orders
  SET status = 'filled', closed_at = NOW()
  WHERE user_id = p_user_id AND symbol = v_position.symbol AND type = 'leverage' AND status = 'open';

  -- ✅ Return result for API response
  RETURN jsonb_build_object(
    'pnl', v_pnl,
    'final_balance', v_final_balance
  );
END;
$$;


ALTER FUNCTION "public"."close_leverage_position"("p_user_id" "uuid", "p_position_id" "uuid", "p_current_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_limit_order_fill"("p_order_id" "uuid", "p_executed_price" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order RECORD;
  v_position RECORD;
  v_user_id UUID;
  v_quantity NUMERIC;
  v_amount_in_usd NUMERIC;
  v_symbol TEXT;
  v_side TEXT;
  v_existing_qty NUMERIC;
  v_new_avg_price NUMERIC;
  v_remaining_qty NUMERIC;
BEGIN
  -- Lock order row to prevent race
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or already filled';
  END IF;

  v_user_id := v_order.user_id;
  v_symbol := v_order.symbol;
  v_side := v_order.side;

  IF v_side = 'buy' THEN
    v_quantity := v_order.amount / p_executed_price;
    v_amount_in_usd := v_order.amount;

    -- Merge or insert position
    SELECT * INTO v_position
    FROM positions
    WHERE user_id = v_user_id AND symbol = v_symbol
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO positions (user_id, symbol, quantity, average_price, leverage)
      VALUES (v_user_id, v_symbol, v_quantity, p_executed_price, 1);
    ELSE
      v_existing_qty := v_position.quantity + v_quantity;
      v_new_avg_price := (
        (v_position.quantity * v_position.average_price) + (v_quantity * p_executed_price)
      ) / v_existing_qty;

      UPDATE positions
      SET quantity = v_existing_qty,
          average_price = v_new_avg_price,
          updated_at = NOW()
      WHERE id = v_position.id;
    END IF;

  ELSIF v_side = 'sell' THEN
    v_quantity := v_order.quantity;
    v_amount_in_usd := v_quantity * p_executed_price;

    -- Lock position row
    SELECT * INTO v_position
    FROM positions
    WHERE user_id = v_user_id AND symbol = v_symbol
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Position not found';
    END IF;

    -- Update reserved and quantity
    v_remaining_qty := v_position.quantity - v_quantity;

    IF v_remaining_qty < 0 THEN
      RAISE EXCEPTION 'Oversell detected';
    END IF;

    UPDATE positions
    SET reserved_quantity = reserved_quantity - v_quantity,
        quantity = v_remaining_qty,
        updated_at = NOW()
    WHERE id = v_position.id;

    -- Delete position if fully sold
    IF v_remaining_qty <= 0 THEN
      DELETE FROM positions WHERE id = v_position.id;
    END IF;

    -- Refund USD back to balance
    UPDATE users
    SET available_balance = available_balance + v_amount_in_usd
    WHERE id = v_user_id;

  ELSE
    RAISE EXCEPTION 'Invalid order side';
  END IF;

  -- Mark order as filled
  UPDATE orders
  SET status = 'filled',
      quantity = v_quantity,
      price = p_executed_price,
      closed_at = NOW()
  WHERE id = p_order_id;

END;
$$;


ALTER FUNCTION "public"."execute_limit_order_fill"("p_order_id" "uuid", "p_executed_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_user_balance"("p_user_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update users
  set available_balance = available_balance + p_amount
  where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."increment_user_balance"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_leverage_order"("p_user_id" "uuid", "p_symbol" "text", "p_price" numeric, "p_quantity" numeric, "p_side" "text", "p_leverage" integer, "p_margin" numeric, "p_position_size" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_balance NUMERIC;
  v_existing RECORD;
  v_total_qty NUMERIC;
  v_new_avg_price NUMERIC;
  v_new_margin NUMERIC;
  v_weighted_leverage NUMERIC;
BEGIN
  -- ✅ Lock balance row
  SELECT available_balance INTO v_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_balance < p_margin THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- ✅ Deduct margin
  UPDATE users
  SET available_balance = available_balance - p_margin
  WHERE id = p_user_id;

  -- ✅ Insert audit trail order
  INSERT INTO orders (
    user_id, symbol, type, side, amount, price, leverage, status, margin
  )
  VALUES (
    p_user_id, p_symbol, 'leverage', p_side, p_position_size, p_price, p_leverage, 'open', p_margin
  );

  -- ✅ Check for existing position
  SELECT * INTO v_existing
  FROM positions
  WHERE user_id = p_user_id AND symbol = p_symbol
  FOR UPDATE;

  IF FOUND THEN
    v_total_qty := v_existing.quantity + p_quantity;
    v_new_avg_price := ((v_existing.quantity * v_existing.average_price) + (p_quantity * p_price)) / v_total_qty;
    v_new_margin := v_existing.margin + p_margin;
    v_weighted_leverage := (
      (v_existing.margin * v_existing.leverage) + (p_margin * p_leverage)
    ) / v_new_margin;

    UPDATE positions
    SET quantity = v_total_qty,
        average_price = v_new_avg_price,
        updated_at = NOW(),
        margin = v_new_margin,
        leverage = ROUND(v_weighted_leverage::numeric, 4)
    WHERE id = v_existing.id;

  ELSE
    INSERT INTO positions (
      user_id, symbol, quantity, average_price, leverage, margin
    )
    VALUES (
      p_user_id, p_symbol, p_quantity, p_price, p_leverage, p_margin
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."perform_leverage_order"("p_user_id" "uuid", "p_symbol" "text", "p_price" numeric, "p_quantity" numeric, "p_side" "text", "p_leverage" integer, "p_margin" numeric, "p_position_size" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_limit_order_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_side" "text", "p_price" numeric, "p_quantity" numeric, "p_order_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_balance NUMERIC;
  v_position RECORD;
  v_available_qty NUMERIC;
BEGIN
  IF p_side = 'buy' THEN
    SELECT available_balance INTO v_balance FROM users WHERE id = p_user_id FOR UPDATE;
    IF v_balance < p_order_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE users SET available_balance = available_balance - p_order_amount WHERE id = p_user_id;

  ELSIF p_side = 'sell' THEN
    SELECT * INTO v_position FROM positions WHERE user_id = p_user_id AND symbol = p_symbol FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No position found';
    END IF;

    v_available_qty := v_position.quantity - v_position.reserved_quantity;

    IF v_available_qty < p_quantity THEN
      RAISE EXCEPTION 'Insufficient tokens to sell';
    END IF;

    UPDATE positions
    SET reserved_quantity = reserved_quantity + p_quantity
    WHERE id = v_position.id;

  END IF;

  INSERT INTO orders (user_id, symbol, type, side, amount, price, leverage, status, quantity)
  VALUES (p_user_id, p_symbol, 'limit', p_side, p_order_amount, p_price, 1, 'open', p_quantity);
END;
$$;


ALTER FUNCTION "public"."perform_limit_order_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_side" "text", "p_price" numeric, "p_quantity" numeric, "p_order_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_liquidation"("p_position_id" "uuid", "p_current_price" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_position RECORD;
  v_user_id UUID;
  v_symbol TEXT;
  v_leverage NUMERIC;
  v_entry_price NUMERIC;
  v_quantity NUMERIC;
  v_margin NUMERIC;
  v_loss NUMERIC;
  v_refunded_margin NUMERIC;
BEGIN
  -- Lock position
  SELECT * INTO v_position
  FROM positions
  WHERE id = p_position_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  v_user_id := v_position.user_id;
  v_symbol := v_position.symbol;
  v_leverage := v_position.leverage;
  v_entry_price := v_position.average_price;
  v_quantity := v_position.quantity;
  v_margin := v_position.margin;

  IF v_leverage <= 1 THEN
    RAISE EXCEPTION 'Position is not leveraged';
  END IF;

  -- Calculate loss
  IF v_symbol LIKE '%LONG/%' THEN
    v_loss := (v_entry_price - p_current_price) * v_quantity;
  ELSIF v_symbol LIKE '%SHORT/%' THEN
    v_loss := (p_current_price - v_entry_price) * v_quantity;
  ELSE
    RAISE EXCEPTION 'Unknown position type';
  END IF;

  v_refunded_margin := GREATEST(0, v_margin - v_loss);

  -- Delete position
  DELETE FROM positions WHERE id = p_position_id;

  -- Refund any remaining margin
  IF v_refunded_margin > 0 THEN
    UPDATE users
    SET available_balance = available_balance + v_refunded_margin
    WHERE id = v_user_id;
  END IF;

  -- Update related leverage orders as liquidated
  UPDATE orders
  SET status = 'liquidated',
      liquidation_price = p_current_price,
      closed_at = NOW()
  WHERE user_id = v_user_id
    AND symbol = v_symbol
    AND type = 'leverage'
    AND status = 'open';
END;
$$;


ALTER FUNCTION "public"."perform_liquidation"("p_position_id" "uuid", "p_current_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_market_order"("p_user_id" "uuid", "p_symbol" "text", "p_amount" numeric, "p_price" numeric, "p_quantity" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_balance NUMERIC;
  v_existing RECORD;
  v_new_order RECORD;
BEGIN
  -- Lock user's balance row to prevent double-spend race conditions
  SELECT available_balance INTO v_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct balance
  UPDATE users
  SET available_balance = available_balance - p_amount
  WHERE id = p_user_id;

  -- Insert order into orders table
  INSERT INTO orders (
    user_id, type, side, amount, price, leverage, status, symbol, quantity
  )
  VALUES (
    p_user_id, 'market', 'buy', p_amount, p_price, 1, 'filled', p_symbol, p_quantity
  )
  RETURNING * INTO v_new_order;

  -- Check if position exists (spot positions are always side=null)
  SELECT * INTO v_existing
  FROM positions
  WHERE user_id = p_user_id AND symbol = p_symbol
  FOR UPDATE;

  IF FOUND THEN
    -- Update existing position
    UPDATE positions
    SET quantity = quantity + p_quantity,
        average_price = (
          (v_existing.quantity * v_existing.average_price) + (p_quantity * p_price)
        ) / (v_existing.quantity + p_quantity),
        updated_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    -- Insert new position
    INSERT INTO positions (
      user_id, symbol, quantity, average_price, leverage
    )
    VALUES (
      p_user_id, p_symbol, p_quantity, p_price, 1
    );
  END IF;

  RETURN to_jsonb(v_new_order);
END;
$$;


ALTER FUNCTION "public"."perform_market_order"("p_user_id" "uuid", "p_symbol" "text", "p_amount" numeric, "p_price" numeric, "p_quantity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_market_sell"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_balance NUMERIC;
  v_position RECORD;
  v_total_return NUMERIC;
  v_new_order RECORD;
BEGIN
  -- Lock position row first
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND symbol = p_symbol
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No position found';
  END IF;

  IF v_position.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient position quantity';
  END IF;

  -- Calculate USD return
  v_total_return := p_quantity * p_price;

  -- Lock user's balance row
  SELECT available_balance INTO v_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Update balance
  UPDATE users
  SET available_balance = available_balance + v_total_return
  WHERE id = p_user_id;

  -- Update position or delete if fully sold
  IF (v_position.quantity - p_quantity) <= 0 THEN
    DELETE FROM positions WHERE id = v_position.id;
  ELSE
    UPDATE positions
    SET quantity = quantity - p_quantity,
        updated_at = NOW()
    WHERE id = v_position.id;
  END IF;

  -- Insert order record
  INSERT INTO orders (
    user_id, type, side, amount, price, leverage, status, symbol, quantity
  )
  VALUES (
    p_user_id, 'market', 'sell', v_total_return, p_price, 1, 'filled', p_symbol, p_quantity
  )
  RETURNING * INTO v_new_order;

  RETURN to_jsonb(v_new_order);
END;
$$;


ALTER FUNCTION "public"."perform_market_sell"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_market_sell_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric, "p_total_return" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_position RECORD;
  v_available_qty NUMERIC;
BEGIN
  SELECT * INTO v_position FROM positions WHERE user_id = p_user_id AND symbol = p_symbol FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  v_available_qty := v_position.quantity - v_position.reserved_quantity;

  IF v_available_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient available tokens';
  END IF;

  UPDATE positions
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE id = v_position.id;

  UPDATE users
  SET available_balance = available_balance + p_total_return
  WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."perform_market_sell_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric, "p_total_return" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.users (id, username, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set 
    username = excluded.username,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    last_login_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."upsert_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text",
    "side" "text",
    "amount" numeric NOT NULL,
    "price" numeric,
    "leverage" integer NOT NULL,
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "symbol" "text" NOT NULL,
    "margin" numeric DEFAULT 0,
    "quantity" numeric,
    "liquidation_price" numeric,
    "closed_at" timestamp without time zone,
    CONSTRAINT "orders_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "orders_leverage_check" CHECK ((("leverage" >= 1) AND ("leverage" <= 100))),
    CONSTRAINT "orders_side_check" CHECK (("side" = ANY (ARRAY['buy'::"text", 'sell'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'filled'::"text", 'cancelled'::"text", 'liquidated'::"text", 'closed'::"text"]))),
    CONSTRAINT "orders_type_check" CHECK (("type" = ANY (ARRAY['market'::"text", 'limit'::"text", 'stop_loss'::"text", 'leverage'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "symbol" "text",
    "quantity" numeric DEFAULT 0 NOT NULL,
    "average_price" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "side" "text",
    "leverage" numeric DEFAULT 1 NOT NULL,
    "margin" numeric DEFAULT 0,
    "reserved_quantity" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "positions_side_check" CHECK ((("side" = ANY (ARRAY['buy'::"text", 'sell'::"text"])) OR ("side" IS NULL)))
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "symbol" "text" NOT NULL,
    "price" numeric NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."price_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "order_id" "uuid",
    "side" "text",
    "amount" numeric NOT NULL,
    "price" numeric NOT NULL,
    "leverage" integer NOT NULL,
    "pnl" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trades_side_check" CHECK (("side" = ANY (ARRAY['buy'::"text", 'sell'::"text"])))
);


ALTER TABLE "public"."trades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "available_balance" numeric DEFAULT 10000,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_login_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_snapshots"
    ADD CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "unique_symbol_idx" ON "public"."price_snapshots" USING "btree" ("symbol");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "allow service role access" ON "public"."users" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_orders_full_access" ON "public"."orders" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_positions_full_access" ON "public"."positions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_users_full_access" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."trades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."positions";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."cancel_limit_order_reserved"("p_user_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_limit_order_reserved"("p_user_id" "uuid", "p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_limit_order_reserved"("p_user_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_limit_order_reserved"("p_user_id" "uuid", "p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_leverage_order"("p_user_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_leverage_order"("p_user_id" "uuid", "p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."close_leverage_order"("p_user_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_leverage_order"("p_user_id" "uuid", "p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_leverage_position"("p_user_id" "uuid", "p_position_id" "uuid", "p_current_price" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_leverage_position"("p_user_id" "uuid", "p_position_id" "uuid", "p_current_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."close_leverage_position"("p_user_id" "uuid", "p_position_id" "uuid", "p_current_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_leverage_position"("p_user_id" "uuid", "p_position_id" "uuid", "p_current_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_limit_order_fill"("p_order_id" "uuid", "p_executed_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."execute_limit_order_fill"("p_order_id" "uuid", "p_executed_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_limit_order_fill"("p_order_id" "uuid", "p_executed_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_balance"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_balance"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_balance"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."perform_leverage_order"("p_user_id" "uuid", "p_symbol" "text", "p_price" numeric, "p_quantity" numeric, "p_side" "text", "p_leverage" integer, "p_margin" numeric, "p_position_size" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."perform_leverage_order"("p_user_id" "uuid", "p_symbol" "text", "p_price" numeric, "p_quantity" numeric, "p_side" "text", "p_leverage" integer, "p_margin" numeric, "p_position_size" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."perform_leverage_order"("p_user_id" "uuid", "p_symbol" "text", "p_price" numeric, "p_quantity" numeric, "p_side" "text", "p_leverage" integer, "p_margin" numeric, "p_position_size" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_leverage_order"("p_user_id" "uuid", "p_symbol" "text", "p_price" numeric, "p_quantity" numeric, "p_side" "text", "p_leverage" integer, "p_margin" numeric, "p_position_size" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."perform_limit_order_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_side" "text", "p_price" numeric, "p_quantity" numeric, "p_order_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."perform_limit_order_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_side" "text", "p_price" numeric, "p_quantity" numeric, "p_order_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."perform_limit_order_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_side" "text", "p_price" numeric, "p_quantity" numeric, "p_order_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_limit_order_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_side" "text", "p_price" numeric, "p_quantity" numeric, "p_order_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."perform_liquidation"("p_position_id" "uuid", "p_current_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."perform_liquidation"("p_position_id" "uuid", "p_current_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_liquidation"("p_position_id" "uuid", "p_current_price" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."perform_market_order"("p_user_id" "uuid", "p_symbol" "text", "p_amount" numeric, "p_price" numeric, "p_quantity" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."perform_market_order"("p_user_id" "uuid", "p_symbol" "text", "p_amount" numeric, "p_price" numeric, "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."perform_market_order"("p_user_id" "uuid", "p_symbol" "text", "p_amount" numeric, "p_price" numeric, "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_market_order"("p_user_id" "uuid", "p_symbol" "text", "p_amount" numeric, "p_price" numeric, "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."perform_market_sell"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."perform_market_sell"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_market_sell"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."perform_market_sell_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric, "p_total_return" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."perform_market_sell_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric, "p_total_return" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."perform_market_sell_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric, "p_total_return" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_market_sell_reserved"("p_user_id" "uuid", "p_symbol" "text", "p_quantity" numeric, "p_price" numeric, "p_total_return" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user"() TO "service_role";


















GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."price_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."price_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."price_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."trades" TO "anon";
GRANT ALL ON TABLE "public"."trades" TO "authenticated";
GRANT ALL ON TABLE "public"."trades" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
