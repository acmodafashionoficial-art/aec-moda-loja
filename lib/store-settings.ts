import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeAssetUrl, safeSocialUrl } from "@/lib/security/validation";

export type StoreSettings = {
  storeName: string;
  logoUrl: string;
  logoText: string;
  tagline: string;
  domain: string;
  city: string;
  description: string;
  supportHours: string;
  whatsappNumber: string;
  instagramUrl: string;
  announcement: string;
  heroEyebrow: string;
  heroTitle: string;
  heroText: string;
  heroButtonText: string;
  heroImageUrl: string;
  categoryFemininoImageUrl: string;
  categoryMasculinoImageUrl: string;
  categoryInfantilImageUrl: string;
  categoryPlusImageUrl: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  pickupEnabled: boolean;
  pickupName: string;
  pickupAddress: string;
  pickupInstructions: string;
  localDeliveryEnabled: boolean;
  localDeliveryName: string;
  localDeliveryCity: string;
  localDeliveryState: string;
  localDeliveryInstructions: string;
  senderPostalCode: string;
  freeShippingFrom: number;
};

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: "A&C Moda",
  logoUrl: "/brand/aec-logo.svg",
  logoText: "A&C",
  tagline: "MODA PARA TODOS",
  domain: "aecmoda.com.br",
  city: "Jataúba - PE",
  description: "Moda feminina, masculina, infantil e plus size com peças modernas, versáteis e preço justo.",
  supportHours: "Segunda a sábado, em horário comercial",
  whatsappNumber: "",
  instagramUrl: "https://instagram.com/aec_moda_",
  announcement: "Enviamos para todo o Brasil • Retire grátis em nossa loja • Pix e cartão em até 12x",
  heroEyebrow: "NOVIDADES A&C MODA",
  heroTitle: "Moda que combina com você.",
  heroText: "Peças escolhidas com carinho em Jataúba para vestir diferentes estilos, corpos e momentos.",
  heroButtonText: "Conhecer a coleção",
  heroImageUrl: "",
  categoryFemininoImageUrl: "",
  categoryMasculinoImageUrl: "",
  categoryInfantilImageUrl: "",
  categoryPlusImageUrl: "",
  primaryColor: "#171614",
  accentColor: "#A46B45",
  backgroundColor: "#F8F7F4",
  pickupEnabled: true,
  pickupName: "Retirada na loja A&C Moda",
  pickupAddress: "Jataúba - PE",
  pickupInstructions: "Após a confirmação do pagamento, avisaremos pelo WhatsApp quando o pedido estiver pronto para retirada.",
  localDeliveryEnabled: true,
  localDeliveryName: "Entrega local grátis em Jataúba",
  localDeliveryCity: "Jataúba",
  localDeliveryState: "PE",
  localDeliveryInstructions: "Entrega gratuita em horário comercial, após confirmação da loja pelo WhatsApp.",
  senderPostalCode: "",
  freeShippingFrom: 0,
};

const localFile = path.join(process.cwd(), "data", "store-settings.json");

function cleanColor(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : fallback;
}

function cleanPostalCode(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function normalize(raw: Partial<StoreSettings>): StoreSettings {
  return {
    ...DEFAULT_STORE_SETTINGS,
    storeName: String(raw.storeName || DEFAULT_STORE_SETTINGS.storeName).trim().slice(0, 80),
    logoUrl: safeAssetUrl(raw.logoUrl, 600) || DEFAULT_STORE_SETTINGS.logoUrl,
    logoText: String(raw.logoText || DEFAULT_STORE_SETTINGS.logoText).trim().slice(0, 20),
    tagline: String(raw.tagline || DEFAULT_STORE_SETTINGS.tagline).trim().slice(0, 80),
    domain: String(raw.domain || DEFAULT_STORE_SETTINGS.domain).trim().slice(0, 120),
    city: String(raw.city || DEFAULT_STORE_SETTINGS.city).trim().slice(0, 100),
    description: String(raw.description || DEFAULT_STORE_SETTINGS.description).trim().slice(0, 600),
    supportHours: String(raw.supportHours || DEFAULT_STORE_SETTINGS.supportHours).trim().slice(0, 180),
    whatsappNumber: String(raw.whatsappNumber || "").replace(/\D/g, "").slice(0, 15),
    instagramUrl: safeSocialUrl(raw.instagramUrl || DEFAULT_STORE_SETTINGS.instagramUrl, "instagram.com", 400) || DEFAULT_STORE_SETTINGS.instagramUrl,
    announcement: String(raw.announcement || DEFAULT_STORE_SETTINGS.announcement).trim().slice(0, 220),
    heroEyebrow: String(raw.heroEyebrow || DEFAULT_STORE_SETTINGS.heroEyebrow).trim().slice(0, 80),
    heroTitle: String(raw.heroTitle || DEFAULT_STORE_SETTINGS.heroTitle).trim().slice(0, 180),
    heroText: String(raw.heroText || DEFAULT_STORE_SETTINGS.heroText).trim().slice(0, 450),
    heroButtonText: String(raw.heroButtonText || DEFAULT_STORE_SETTINGS.heroButtonText).trim().slice(0, 60),
    heroImageUrl: safeAssetUrl(raw.heroImageUrl, 600) || "",
    categoryFemininoImageUrl: safeAssetUrl(raw.categoryFemininoImageUrl, 600) || "",
    categoryMasculinoImageUrl: safeAssetUrl(raw.categoryMasculinoImageUrl, 600) || "",
    categoryInfantilImageUrl: safeAssetUrl(raw.categoryInfantilImageUrl, 600) || "",
    categoryPlusImageUrl: safeAssetUrl(raw.categoryPlusImageUrl, 600) || "",
    primaryColor: cleanColor(raw.primaryColor, DEFAULT_STORE_SETTINGS.primaryColor),
    accentColor: cleanColor(raw.accentColor, DEFAULT_STORE_SETTINGS.accentColor),
    backgroundColor: cleanColor(raw.backgroundColor, DEFAULT_STORE_SETTINGS.backgroundColor),
    pickupEnabled: raw.pickupEnabled !== false,
    pickupName: String(raw.pickupName || DEFAULT_STORE_SETTINGS.pickupName).trim().slice(0, 140),
    pickupAddress: String(raw.pickupAddress || DEFAULT_STORE_SETTINGS.pickupAddress).trim().slice(0, 300),
    pickupInstructions: String(raw.pickupInstructions || DEFAULT_STORE_SETTINGS.pickupInstructions).trim().slice(0, 600),
    localDeliveryEnabled: raw.localDeliveryEnabled !== false,
    localDeliveryName: String(raw.localDeliveryName || DEFAULT_STORE_SETTINGS.localDeliveryName).trim().slice(0, 140),
    localDeliveryCity: String(raw.localDeliveryCity || DEFAULT_STORE_SETTINGS.localDeliveryCity).trim().slice(0, 100),
    localDeliveryState: String(raw.localDeliveryState || DEFAULT_STORE_SETTINGS.localDeliveryState).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || DEFAULT_STORE_SETTINGS.localDeliveryState,
    localDeliveryInstructions: String(raw.localDeliveryInstructions || DEFAULT_STORE_SETTINGS.localDeliveryInstructions).trim().slice(0, 600),
    senderPostalCode: cleanPostalCode(raw.senderPostalCode || process.env.MELHOR_ENVIO_FROM_POSTAL_CODE || ""),
    freeShippingFrom: Math.max(0, Number(raw.freeShippingFrom) || 0),
  };
}

async function readLocal(): Promise<StoreSettings> {
  try {
    const content = await fs.readFile(localFile, "utf8");
    return normalize(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(DEFAULT_STORE_SETTINGS, null, 2), "utf8");
    return DEFAULT_STORE_SETTINGS;
  }
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return readLocal();
  const { data, error } = await supabase.from("store_settings").select("settings").eq("id", "main").maybeSingle();
  if (error) {
    console.error("Erro ao carregar configurações da loja:", error.message);
    return readLocal();
  }
  return normalize((data?.settings || {}) as Partial<StoreSettings>);
}

export async function saveStoreSettings(raw: Partial<StoreSettings>): Promise<StoreSettings> {
  const settings = normalize(raw);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }
  const { error } = await supabase.from("store_settings").upsert({ id: "main", settings, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Erro ao salvar configurações: ${error.message}`);
  return settings;
}