import pairs from "./constants/pairs";
import supabaseAdmin from "./supabaseAdmin";

export async function fetchMarketPrice(symbol) {
  const mapping = pairs[symbol];

  if (!mapping) {
    throw new Error(`${symbol} not supported`);
  }

  // Fetch price from Supabase table
  const { data, error } = await supabaseAdmin
    .from("price_snapshots")
    .select("price")
    .eq("symbol", symbol)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch price for ${symbol} from Supabase`);
  }

  return parseFloat(data.price);
}
