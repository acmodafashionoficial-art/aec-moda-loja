import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function authConfig() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseAuthClient(): SupabaseClient | null {
  const config = authConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function supabaseAuthConfigured() {
  return Boolean(authConfig());
}
