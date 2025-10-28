import pairs from "./constants/pairs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function fetchSafePrice(symbol) {
  const mapping = pairs[symbol];

  if (!mapping) {
    throw new Error(`${symbol} not supported`);
  }

  // Fetch price from your Supabase DB
  const { data, error } = await supabase
    .from("price_snapshots")
    .select("price")
    .eq("symbol", symbol)
    .single();

  if (error) {
    console.error(error);
    throw new Error("Failed to fetch price from DB");
  }

  return data.price;
}
