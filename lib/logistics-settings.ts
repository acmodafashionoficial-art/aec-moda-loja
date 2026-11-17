import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { LogisticsProfile, LogisticsSettings, PackageTemplate } from "@/lib/logistics-types";
import { profileUnitVolume } from "@/lib/packing";

export const DEFAULT_LOGISTICS_SETTINGS: LogisticsSettings = {
  weightSafetyPercent: 10,
  volumeSafetyPercent: 12,
  maxAutomaticItems: 12,
  fallbackProfileId: "peca-leve",
  profiles: [
    { id: "body-cropped", name: "Body / Cropped", description: "Peças leves e compactas.", unitWeightKg: 0.30, unitWidthCm: 22, unitHeightCm: 3, unitLengthCm: 18, unitVolumeCm3: 1188, enabled: true },
    { id: "peca-leve", name: "Blusa / Camiseta", description: "Padrão para peças leves.", unitWeightKg: 0.35, unitWidthCm: 24, unitHeightCm: 4, unitLengthCm: 20, unitVolumeCm3: 1920, enabled: true },
    { id: "short-saia", name: "Short / Saia", description: "Peças de volume médio.", unitWeightKg: 0.45, unitWidthCm: 25, unitHeightCm: 5, unitLengthCm: 21, unitVolumeCm3: 2625, enabled: true },
    { id: "vestido", name: "Vestido", description: "Vestidos leves ou médios dobrados.", unitWeightKg: 0.55, unitWidthCm: 28, unitHeightCm: 6, unitLengthCm: 22, unitVolumeCm3: 3696, enabled: true },
    { id: "calca", name: "Calça comum", description: "Calças de tecido e alfaiataria.", unitWeightKg: 0.65, unitWidthCm: 30, unitHeightCm: 7, unitLengthCm: 24, unitVolumeCm3: 5040, enabled: true },
    { id: "jeans", name: "Calça jeans", description: "Jeans e peças mais pesadas.", unitWeightKg: 0.85, unitWidthCm: 32, unitHeightCm: 8, unitLengthCm: 25, unitVolumeCm3: 6400, enabled: true },
    { id: "conjunto", name: "Conjunto", description: "Duas ou mais peças vendidas juntas.", unitWeightKg: 0.90, unitWidthCm: 32, unitHeightCm: 10, unitLengthCm: 25, unitVolumeCm3: 8000, enabled: true },
    { id: "jaqueta", name: "Jaqueta / Peça pesada", description: "Peças volumosas ou pesadas.", unitWeightKg: 1.20, unitWidthCm: 35, unitHeightCm: 12, unitLengthCm: 28, unitVolumeCm3: 11760, enabled: true },
    { id: "infantil", name: "Roupa infantil", description: "Peças infantis leves.", unitWeightKg: 0.25, unitWidthCm: 22, unitHeightCm: 4, unitLengthCm: 18, unitVolumeCm3: 1584, enabled: true },
    { id: "acessorio", name: "Acessório pequeno", description: "Cintos, bijuterias e acessórios compactos.", unitWeightKg: 0.20, unitWidthCm: 18, unitHeightCm: 4, unitLengthCm: 15, unitVolumeCm3: 1080, enabled: true },
  ],
  packages: [
    { id: "embalagem-p", name: "Embalagem pequena", widthCm: 30, heightCm: 8, lengthCm: 22, tareWeightKg: 0.12, maxWeightKg: 2, usableVolumePercent: 75, enabled: true },
    { id: "embalagem-m", name: "Embalagem média", widthCm: 35, heightCm: 12, lengthCm: 27, tareWeightKg: 0.20, maxWeightKg: 5, usableVolumePercent: 78, enabled: true },
    { id: "embalagem-g", name: "Embalagem grande", widthCm: 40, heightCm: 18, lengthCm: 32, tareWeightKg: 0.35, maxWeightKg: 10, usableVolumePercent: 80, enabled: true },
  ],
};

const localFile = path.join(process.cwd(), "data", "logistics-settings.json");

function cleanNumber(value: unknown, fallback: number, min: number, max: number, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const bounded = Math.min(max, Math.max(min, number));
  const factor = 10 ** decimals;
  return Math.round(bounded * factor) / factor;
}

function cleanId(value: unknown, fallback: string) {
  const clean = String(value || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return clean || fallback;
}

function normalizeProfile(raw: Partial<LogisticsProfile>, index: number): LogisticsProfile {
  const width = cleanNumber(raw.unitWidthCm, 24, 1, 100, 1);
  const height = cleanNumber(raw.unitHeightCm, 4, 0.5, 100, 1);
  const length = cleanNumber(raw.unitLengthCm, 20, 1, 100, 1);
  return {
    id: cleanId(raw.id, `perfil-${index + 1}`),
    name: String(raw.name || `Tipo de peça ${index + 1}`).trim().slice(0, 80),
    description: String(raw.description || "").trim().slice(0, 240),
    unitWeightKg: cleanNumber(raw.unitWeightKg, 0.35, 0.02, 30, 3),
    unitWidthCm: width,
    unitHeightCm: height,
    unitLengthCm: length,
    unitVolumeCm3: cleanNumber(raw.unitVolumeCm3, profileUnitVolume(width, height, length), 1, 1_000_000, 0),
    enabled: raw.enabled !== false,
    calibratedAt: raw.calibratedAt ? String(raw.calibratedAt).slice(0, 40) : undefined,
    calibrationQuantity: raw.calibrationQuantity ? Math.max(1, Math.min(100, Math.floor(Number(raw.calibrationQuantity)))) : undefined,
  };
}

function normalizePackage(raw: Partial<PackageTemplate>, index: number): PackageTemplate {
  return {
    id: cleanId(raw.id, `embalagem-${index + 1}`),
    name: String(raw.name || `Embalagem ${index + 1}`).trim().slice(0, 80),
    widthCm: cleanNumber(raw.widthCm, 30, 11, 200, 1),
    heightCm: cleanNumber(raw.heightCm, 8, 2, 200, 1),
    lengthCm: cleanNumber(raw.lengthCm, 22, 16, 200, 1),
    tareWeightKg: cleanNumber(raw.tareWeightKg, 0.12, 0, 20, 3),
    maxWeightKg: cleanNumber(raw.maxWeightKg, 2, 0.1, 100, 2),
    usableVolumePercent: cleanNumber(raw.usableVolumePercent, 75, 35, 100, 0),
    enabled: raw.enabled !== false,
  };
}

function normalize(raw: Partial<LogisticsSettings>): LogisticsSettings {
  const profiles = Array.isArray(raw.profiles) && raw.profiles.length
    ? raw.profiles.slice(0, 30).map(normalizeProfile)
    : DEFAULT_LOGISTICS_SETTINGS.profiles;
  const packages = Array.isArray(raw.packages) && raw.packages.length
    ? raw.packages.slice(0, 12).map(normalizePackage)
    : DEFAULT_LOGISTICS_SETTINGS.packages;
  const fallback = cleanId(raw.fallbackProfileId, DEFAULT_LOGISTICS_SETTINGS.fallbackProfileId);
  return {
    weightSafetyPercent: cleanNumber(raw.weightSafetyPercent, 10, 0, 50, 0),
    volumeSafetyPercent: cleanNumber(raw.volumeSafetyPercent, 12, 0, 60, 0),
    maxAutomaticItems: cleanNumber(raw.maxAutomaticItems, 12, 1, 100, 0),
    fallbackProfileId: profiles.some((profile) => profile.id === fallback) ? fallback : profiles[0].id,
    profiles,
    packages,
  };
}

async function readLocal() {
  try {
    const content = await fs.readFile(localFile, "utf8");
    return normalize(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(DEFAULT_LOGISTICS_SETTINGS, null, 2), "utf8");
    return DEFAULT_LOGISTICS_SETTINGS;
  }
}

export async function getLogisticsSettings(): Promise<LogisticsSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return readLocal();
  const { data, error } = await supabase.from("store_settings").select("settings").eq("id", "logistics").maybeSingle();
  if (error) {
    console.error("Erro ao carregar logística:", error.message);
    return readLocal();
  }
  return normalize((data?.settings || {}) as Partial<LogisticsSettings>);
}

export async function saveLogisticsSettings(raw: Partial<LogisticsSettings>): Promise<LogisticsSettings> {
  const settings = normalize(raw);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }
  const { error } = await supabase.from("store_settings").upsert({ id: "logistics", settings, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Erro ao salvar logística: ${error.message}`);
  return settings;
}
