import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { saveProduct } from "@/lib/product-repository";
import { saveStoreSettings, type StoreSettings } from "@/lib/store-settings";
import { saveLogisticsSettings } from "@/lib/logistics-settings";
import { saveShippingSettings } from "@/lib/shipping-settings";
import { savePaymentSettings, type PaymentSettings } from "@/lib/payment-settings";
import type { Product } from "@/lib/product-types";
import type { LogisticsSettings } from "@/lib/logistics-types";
import type { ShippingSettings } from "@/lib/shipping-settings";

import { getSupabaseSetupStatus, REQUIRED_SUPABASE_TABLES } from "@/lib/supabase/status";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "data", file), "utf8")) as T; }
  catch { return fallback; }
}

function localAssetPath(url: string) {
  if (!url.startsWith("/uploads/")) return null;
  const uploadRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads");
  const fileName = path.basename(url);
  const resolved = path.join(uploadRoot, fileName);
  return resolved.startsWith(uploadRoot) ? resolved : null;
}

async function migrateAsset(url: string | undefined, bucket: "product-images" | "brand-assets") {
  if (!url) return url;
  const source = localAssetPath(url);
  if (!source) return url;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado.");
  const buffer = await fs.readFile(source);
  const fileName = `migrated/${path.basename(source)}`;
  const extension = path.extname(source).toLowerCase();
  const contentType = extension === ".webp" ? "image/webp" : extension === ".png" ? "image/png" : extension === ".avif" ? "image/avif" : "image/jpeg";
  const { error } = await supabase.storage.from(bucket).upload(fileName, buffer, { upsert: true, contentType, cacheControl: "31536000" });
  if (error) throw new Error(`Erro ao migrar ${path.basename(source)}: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
}

export async function migrateLocalDataToSupabase() {
  const status = await getSupabaseSetupStatus();
  if (!status.configured || !status.connected) throw new Error("Conecte o Supabase e execute o schema e as migrações antes de migrar.");
  const missing = REQUIRED_SUPABASE_TABLES.filter((table) => !status.tables[table]);
  if (missing.length) throw new Error(`Tabelas ausentes: ${missing.join(", ")}. Execute MIGRACAO-FASE-7.sql ou o schema completo atualizado.`);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado.");

  for (const bucket of ["product-images", "brand-assets"] as const) {
    const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 12 * 1024 * 1024 });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Erro ao preparar ${bucket}: ${error.message}`);
  }

  const products = await readJson<Product[]>("products.json", []);
  let productCount = 0;
  let imageCount = 0;
  for (const product of products) {
    const cache = new Map<string, string>();
    async function asset(url?: string) {
      if (!url) return url;
      if (cache.has(url)) return cache.get(url);
      const migrated = await migrateAsset(url, "product-images");
      if (migrated && migrated !== url) imageCount++;
      if (migrated) cache.set(url, migrated);
      return migrated;
    }
    const images = (await Promise.all((product.images || []).map((url) => asset(url)))).filter((url): url is string => Boolean(url));
    await saveProduct({
      ...product,
      image: await asset(product.image) || images[0] || product.image,
      imageThumbnail: await asset(product.imageThumbnail),
      imageOriginal: await asset(product.imageOriginal),
      images,
      variants: product.variants.map((variant) => ({ ...variant, stock: variant.physicalStock ?? variant.stock })),
    }, product.id);
    productCount++;
  }

  const storeSettings = await readJson<StoreSettings>("store-settings.json", {} as StoreSettings);
  if (storeSettings.logoUrl) storeSettings.logoUrl = await migrateAsset(storeSettings.logoUrl, "brand-assets") || storeSettings.logoUrl;
  await saveStoreSettings(storeSettings);
  await saveLogisticsSettings(await readJson<LogisticsSettings>("logistics-settings.json", {} as LogisticsSettings));
  await saveShippingSettings(await readJson<ShippingSettings>("shipping-settings.json", {} as ShippingSettings));
  await savePaymentSettings(await readJson<PaymentSettings>("payment-settings.json", {} as PaymentSettings));

  return { products: productCount, images: imageCount, settings: 4 };
}
