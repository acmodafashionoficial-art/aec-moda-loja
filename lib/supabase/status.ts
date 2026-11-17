import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const REQUIRED_SUPABASE_TABLES = ["products", "product_variants", "orders", "store_settings", "order_events", "order_reservations", "payment_settings"] as const;

export type SupabaseSetupStatus = {
  configured: boolean;
  connected: boolean;
  url?: string;
  tables: Record<string, boolean>;
  buckets: Record<string, boolean>;
  error?: string;
};

export async function getSupabaseSetupStatus(): Promise<SupabaseSetupStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configured = Boolean(url && key);
  const base: SupabaseSetupStatus = { configured, connected: false, url: url || undefined, tables: {}, buckets: {} };
  if (!configured) return base;
  const supabase = getSupabaseAdmin();
  if (!supabase) return base;
  try {
    for (const table of REQUIRED_SUPABASE_TABLES) {
      const { error } = await supabase.from(table).select("*", { head: true, count: "exact" }).limit(1);
      base.tables[table] = !error;
    }
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (!bucketError) {
      base.buckets["product-images"] = Boolean(buckets?.some((bucket) => bucket.name === "product-images"));
      base.buckets["brand-assets"] = Boolean(buckets?.some((bucket) => bucket.name === "brand-assets"));
    }
    base.connected = Object.values(base.tables).some(Boolean);
    return base;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : "Erro de conexão." };
  }
}
