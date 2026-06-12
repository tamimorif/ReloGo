import { createClient } from "@supabase/supabase-js";

// Placeholder fallbacks keep `next build` (static export) from crashing when
// env vars are absent; real values are required at runtime for the RPC to work.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
