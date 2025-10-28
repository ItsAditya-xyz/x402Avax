// app/api/402/apis/route.ts
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY   // anon is fine for open product
);

export async function POST(req) {
  const body = await req.json();
  const { data, error } = await supabase.rpc('create_api_402_open', body);
  if (error) return new Response(error.message, { status: 400 });
  return Response.json({ apiId: data });
}
