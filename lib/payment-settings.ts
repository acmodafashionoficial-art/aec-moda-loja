import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PaymentSettings = {
  provider: "infinitepay";
  checkoutEnabled: boolean;
  infinitePayHandle: string;
  displayName: string;
  showPix: boolean;
  showCreditCard: boolean;
  maxInstallments: number;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  provider: "infinitepay",
  checkoutEnabled: false,
  infinitePayHandle: "",
  displayName: "InfinitePay",
  showPix: true,
  showCreditCard: true,
  maxInstallments: 12,
};

const localFile = path.join(process.cwd(), "data", "payment-settings.json");

export function normalizeInfinitePayHandle(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80);
}

function normalize(raw: Partial<PaymentSettings>): PaymentSettings {
  return {
    provider: "infinitepay",
    checkoutEnabled: raw.checkoutEnabled === true,
    infinitePayHandle: normalizeInfinitePayHandle(raw.infinitePayHandle || process.env.INFINITEPAY_HANDLE || ""),
    displayName: String(raw.displayName || DEFAULT_PAYMENT_SETTINGS.displayName).trim().slice(0, 80),
    showPix: raw.showPix !== false,
    showCreditCard: raw.showCreditCard !== false,
    maxInstallments: Math.min(12, Math.max(1, Math.floor(Number(raw.maxInstallments) || 12))),
  };
}

async function readLocal(): Promise<PaymentSettings> {
  try {
    return normalize(JSON.parse(await fs.readFile(localFile, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(DEFAULT_PAYMENT_SETTINGS, null, 2), "utf8");
    return normalize(DEFAULT_PAYMENT_SETTINGS);
  }
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return readLocal();
  const { data, error } = await supabase.from("payment_settings").select("settings").eq("id", "main").maybeSingle();
  if (error) {
    if (error.code !== "42P01") console.error("Erro ao carregar pagamentos:", error.message);
    return readLocal();
  }
  return normalize((data?.settings || {}) as Partial<PaymentSettings>);
}

export async function savePaymentSettings(raw: Partial<PaymentSettings>): Promise<PaymentSettings> {
  const settings = normalize(raw);
  if (settings.checkoutEnabled && !settings.infinitePayHandle) {
    throw new Error("Informe a InfiniteTag antes de ativar o checkout.");
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }
  const { error } = await supabase.from("payment_settings").upsert({
    id: "main",
    settings,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Erro ao salvar pagamentos: ${error.message}`);
  return settings;
}
