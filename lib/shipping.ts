import "server-only";

import { getProductById } from "@/lib/catalog";
import { getLogisticsSettings } from "@/lib/logistics-settings";
import { melhorEnvioFetch } from "@/lib/melhor-envio";
import { createShipmentPlan, profileUnitVolume } from "@/lib/packing";
import { getShippingSettings, type ShippingSettings } from "@/lib/shipping-settings";
import { getStoreSettings } from "@/lib/store-settings";
import type { ShipmentPlan, ShipmentUnit } from "@/lib/logistics-types";

export type ShippingCartItem = { productId: string; quantity: number };

export type ShippingQuote = {
  id: string;
  serviceId: string;
  name: string;
  company: string;
  companyId: string;
  companyPicture?: string;
  providerPrice: number;
  packagingFee: number;
  price: number;
  providerDeliveryTime: number;
  preparationDays: number;
  deliveryTime: number;
  deliveryLabel: string;
  packageLabel: string;
  volumeCount: number;
  isCorreios: boolean;
  badges: string[];
  warning?: string;
  quotedAt: string;
  expiresAt: string;
};

export type ShippingProviderRejection = {
  serviceId: string;
  name: string;
  company: string;
  error: string;
  attempt: "volumes" | "volumes-explicit" | "products";
};

export type ShippingQuoteDiagnostics = {
  quotes: ShippingQuote[];
  rejectedServices: ShippingProviderRejection[];
  packageSummary: string;
};

type QuoteProduct = {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
};

type ProviderRow = {
  id?: unknown;
  name?: unknown;
  price?: unknown;
  custom_price?: unknown;
  delivery_time?: unknown;
  custom_delivery_time?: unknown;
  error?: unknown;
  message?: unknown;
  company?: { id?: unknown; name?: unknown; picture?: unknown };
};

type ResolvedShipment = {
  plan: ShipmentPlan;
  products: QuoteProduct[];
};

const CORREIOS_SERVICE_IDS = ["1", "2", "17"];

function digits(value: unknown, max = 8) {
  return String(value || "").replace(/\D/g, "").slice(0, max);
}

function money(value: unknown) {
  const number = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function isCorreios(serviceId: string, companyName: string) {
  return CORREIOS_SERVICE_IDS.includes(serviceId) || companyName.toLowerCase().includes("correios");
}

function cleanProviderError(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 500);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.message || record.error || record.description;
    if (candidate) return cleanProviderError(candidate);
    try {
      return JSON.stringify(value).slice(0, 500);
    } catch {
      return "Serviço indisponível para os dados informados.";
    }
  }
  return "Serviço indisponível para os dados informados.";
}

function rowServiceId(row: ProviderRow) {
  return String(row.id || "").trim();
}

function rowCompany(row: ProviderRow) {
  return String(row.company?.name || (CORREIOS_SERVICE_IDS.includes(rowServiceId(row)) ? "Correios" : "Transportadora"));
}

function rowName(row: ProviderRow) {
  const serviceId = rowServiceId(row);
  if (row.name) return String(row.name);
  if (serviceId === "1") return "PAC";
  if (serviceId === "2") return "SEDEX";
  if (serviceId === "17") return "Mini Envios";
  return "Frete";
}

async function resolveShipment(items: ShippingCartItem[]): Promise<ResolvedShipment> {
  const logistics = await getLogisticsSettings();
  const units: ShipmentUnit[] = [];
  const products: QuoteProduct[] = [];

  for (const item of items) {
    const product = await getProductById(item.productId);
    if (!product) throw new Error("Um produto da sacola não está mais disponível.");

    const quantity = Math.min(Math.max(Math.floor(Number(item.quantity) || 1), 1), 50);
    const profile = logistics.profiles.find((entry) => entry.enabled && entry.id === product.logisticsProfileId)
      || logistics.profiles.find((entry) => entry.enabled && entry.id === logistics.fallbackProfileId)
      || logistics.profiles.find((entry) => entry.enabled);
    const manual = product.logisticsMode === "manual" || !profile;

    const width = manual ? (product.widthCm || 20) : profile.unitWidthCm;
    const height = manual ? (product.heightCm || 5) : profile.unitHeightCm;
    const length = manual ? (product.lengthCm || 28) : profile.unitLengthCm;
    const unitWeightKg = manual ? (product.weightKg || 0.35) : profile.unitWeightKg;
    const unitVolumeCm3 = manual
      ? profileUnitVolume(width, height, length)
      : profile.unitVolumeCm3;

    units.push({
      quantity,
      unitWeightKg,
      unitVolumeCm3,
      insuranceValue: product.price,
    });

    products.push({
      id: product.id.slice(0, 120),
      width,
      height,
      length,
      weight: unitWeightKg,
      insurance_value: money(product.price),
      quantity,
    });
  }

  return {
    plan: createShipmentPlan(units, logistics),
    products,
  };
}

export async function resolveShipmentPlan(items: ShippingCartItem[]): Promise<ShipmentPlan> {
  return (await resolveShipment(items)).plan;
}

function recommended(quotes: ShippingQuote[], max: number, preferences: string[]) {
  const output: ShippingQuote[] = [];
  const add = (quote?: ShippingQuote) => {
    if (quote && !output.some((entry) => entry.id === quote.id)) output.push(quote);
  };

  add([...quotes].sort((a, b) => a.price - b.price)[0]);
  add([...quotes].sort((a, b) => a.deliveryTime - b.deliveryTime || a.price - b.price)[0]);
  preferences.forEach((serviceId) => add(quotes.find((quote) => quote.serviceId === serviceId)));
  [...quotes].sort((a, b) => a.price - b.price).forEach(add);
  return output.slice(0, max);
}

function enabledCorreiosIds(settings: ShippingSettings) {
  if (!settings.includeCorreios) return [];
  const configured = settings.enabledServiceIds.filter((id) => CORREIOS_SERVICE_IDS.includes(id));
  const selected = configured.length ? configured : ["1", "2"];
  return selected.filter((id) => !settings.disabledServiceIds.includes(id));
}

function calculateOptions(settings: ShippingSettings) {
  return {
    receipt: settings.receiptEnabled,
    own_hand: settings.ownHandEnabled,
  };
}

async function requestCalculation(payload: Record<string, unknown>) {
  const response = await melhorEnvioFetch("/api/v2/me/shipment/calculate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Melhor Envio calculate error:", response.status, data);
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    throw new Error(cleanProviderError(record.message || record.error || "Não foi possível consultar as transportadoras agora."));
  }
  return Array.isArray(data) ? data as ProviderRow[] : [];
}

function mergeProviderRows(current: Map<string, ProviderRow>, rows: ProviderRow[]) {
  for (const row of rows) {
    const serviceId = rowServiceId(row);
    if (!serviceId) continue;
    const previous = current.get(serviceId);
    const rowSucceeded = !row.error && Boolean(row.custom_price || row.price);
    const previousSucceeded = previous && !previous.error && Boolean(previous.custom_price || previous.price);
    if (!previous || rowSucceeded || !previousSucceeded) current.set(serviceId, row);
  }
}

function rejectedFromRows(rows: Map<string, ProviderRow>, attempts: Map<string, ShippingProviderRejection["attempt"]>) {
  const rejected: ShippingProviderRejection[] = [];
  for (const [serviceId, row] of rows) {
    if (!row.error && (row.custom_price || row.price)) continue;
    rejected.push({
      serviceId,
      name: rowName(row),
      company: rowCompany(row),
      error: cleanProviderError(row.error || row.message),
      attempt: attempts.get(serviceId) || "volumes",
    });
  }
  return rejected;
}

function quoteFromRow(
  row: ProviderRow,
  plan: ShipmentPlan,
  settings: ShippingSettings,
  quotedAt: Date,
  expiresAt: Date,
  fallbackByProducts: boolean,
): ShippingQuote {
  const serviceId = rowServiceId(row);
  const company = rowCompany(row);
  const correios = isCorreios(serviceId, company);
  const providerPrice = money(row.custom_price || row.price);
  const packagingFee = Math.round((settings.packagingFee + providerPrice * (settings.priceAdjustmentPercent / 100)) * 100) / 100;
  const price = Math.round((providerPrice + packagingFee) * 100) / 100;
  const providerDeliveryTime = Math.max(1, Number(row.custom_delivery_time || row.delivery_time) || 1);
  const deliveryTime = providerDeliveryTime + settings.preparationDays;
  const multiVolumeWarning = plan.volumes.length > 1 && (correios || /j&t|loggi/i.test(company))
    ? "Este pedido usa mais de um volume; as etiquetas poderão ser geradas separadamente."
    : undefined;
  const fallbackWarning = fallbackByProducts && correios
    ? "Cotação dos Correios calculada pelos produtos porque a simulação por embalagem não retornou esse serviço. Confira a embalagem antes de gerar a etiqueta."
    : undefined;

  return {
    id: serviceId,
    serviceId,
    name: rowName(row),
    company,
    companyId: String(row.company?.id || ""),
    companyPicture: row.company?.picture ? String(row.company.picture) : undefined,
    providerPrice,
    packagingFee,
    price,
    providerDeliveryTime,
    preparationDays: settings.preparationDays,
    deliveryTime,
    deliveryLabel: `até ${deliveryTime} dias úteis (${settings.preparationDays} de preparação + até ${providerDeliveryTime} de transporte)`,
    packageLabel: plan.volumes.length === 1 ? plan.volumes[0].packageName : `${plan.volumes.length} volumes`,
    volumeCount: plan.volumes.length,
    isCorreios: correios,
    badges: [],
    warning: plan.warning || multiVolumeWarning || fallbackWarning,
    quotedAt: quotedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function providerSummary(rejected: ShippingProviderRejection[]) {
  const relevant = rejected
    .filter((item) => CORREIOS_SERVICE_IDS.includes(item.serviceId))
    .slice(0, 3)
    .map((item) => `${item.name}: ${item.error}`);
  return relevant.length ? relevant.join(" | ") : "Nenhuma opção de entrega habilitada foi encontrada para esse CEP.";
}

export async function getShippingQuoteDiagnostics(
  destinationPostalCode: string,
  items: ShippingCartItem[],
): Promise<ShippingQuoteDiagnostics> {
  const postalCode = digits(destinationPostalCode);
  if (postalCode.length !== 8) throw new Error("Informe um CEP válido.");
  if (!items.length) throw new Error("A sacola está vazia.");

  const [{ plan, products }, store, settings] = await Promise.all([
    resolveShipment(items),
    getStoreSettings(),
    getShippingSettings(),
  ]);
  if (!settings.enabled) throw new Error("A entrega em domicílio está temporariamente desativada.");

  const from = digits(settings.senderPostalCode || store.senderPostalCode || process.env.MELHOR_ENVIO_FROM_POSTAL_CODE);
  if (from.length !== 8) throw new Error("O CEP de origem da loja ainda não foi configurado no painel de fretes.");

  const common = {
    from: { postal_code: from },
    to: { postal_code: postalCode },
    options: calculateOptions(settings),
  };
  const volumes = plan.volumes.map((volume) => ({
    width: volume.widthCm,
    height: volume.heightCm,
    length: volume.lengthCm,
    weight: volume.weightKg,
    insurance: settings.insuranceEnabled ? volume.insuranceValue : 0,
  }));

  const rows = new Map<string, ProviderRow>();
  const attempts = new Map<string, ShippingProviderRejection["attempt"]>();
  const productFallbackSuccess = new Set<string>();

  const initialRows = await requestCalculation({ ...common, volumes });
  initialRows.forEach((row) => attempts.set(rowServiceId(row), "volumes"));
  mergeProviderRows(rows, initialRows);

  const selectedCorreios = enabledCorreiosIds(settings);
  let missingCorreios = selectedCorreios.filter((id) => {
    const row = rows.get(id);
    return !row || Boolean(row.error) || !Boolean(row.custom_price || row.price);
  });

  if (missingCorreios.length) {
    const explicitRows = await requestCalculation({
      ...common,
      volumes,
      services: missingCorreios.join(","),
    });
    explicitRows.forEach((row) => attempts.set(rowServiceId(row), "volumes-explicit"));
    mergeProviderRows(rows, explicitRows);

    missingCorreios = selectedCorreios.filter((id) => {
      const row = rows.get(id);
      return !row || Boolean(row.error) || !Boolean(row.custom_price || row.price);
    });
  }

  if (missingCorreios.length) {
    const productRows = await requestCalculation({
      ...common,
      products: products.map((product) => ({
        ...product,
        insurance_value: settings.insuranceEnabled ? product.insurance_value : 0,
      })),
      services: missingCorreios.join(","),
    });
    productRows.forEach((row) => {
      const serviceId = rowServiceId(row);
      attempts.set(serviceId, "products");
      if (!row.error && (row.custom_price || row.price)) productFallbackSuccess.add(serviceId);
    });
    mergeProviderRows(rows, productRows);
  }

  const quotedAt = new Date();
  const expiresAt = new Date(quotedAt.getTime() + settings.quoteValidityMinutes * 60_000);

  let quotes = [...rows.values()]
    .filter((row) => !row.error && Boolean(row.custom_price || row.price))
    .map((row) => quoteFromRow(row, plan, settings, quotedAt, expiresAt, productFallbackSuccess.has(rowServiceId(row))))
    .filter((quote) => {
      if (settings.disabledServiceIds.includes(quote.serviceId)) return false;
      if (quote.isCorreios) return settings.includeCorreios && selectedCorreios.includes(quote.serviceId);
      return settings.includePrivateCarriers;
    });

  const rejectedServices = rejectedFromRows(rows, attempts);
  if (!quotes.length) throw new Error(providerSummary(rejectedServices));

  const cheapest = [...quotes].sort((a, b) => a.price - b.price)[0];
  const fastest = [...quotes].sort((a, b) => a.deliveryTime - b.deliveryTime || a.price - b.price)[0];
  quotes = quotes.map((quote) => ({
    ...quote,
    badges: [
      settings.showCheapestBadge && quote.id === cheapest.id ? "Mais barato" : "",
      settings.showFastestBadge && quote.id === fastest.id ? "Mais rápido" : "",
      quote.isCorreios ? "Correios" : "",
    ].filter(Boolean),
  }));

  if (settings.sortBy === "price") quotes.sort((a, b) => a.price - b.price);
  else if (settings.sortBy === "time") quotes.sort((a, b) => a.deliveryTime - b.deliveryTime || a.price - b.price);
  else quotes = recommended(quotes, settings.maxOptions, settings.enabledServiceIds);

  return {
    quotes: quotes.slice(0, settings.maxOptions),
    rejectedServices,
    packageSummary: plan.volumes.length === 1
      ? `${plan.volumes[0].packageName}: ${plan.volumes[0].widthCm} × ${plan.volumes[0].heightCm} × ${plan.volumes[0].lengthCm} cm, ${plan.volumes[0].weightKg} kg`
      : `${plan.volumes.length} volumes, ${plan.quotedWeightKg} kg no total`,
  };
}

export async function getShippingQuotes(destinationPostalCode: string, items: ShippingCartItem[]): Promise<ShippingQuote[]> {
  return (await getShippingQuoteDiagnostics(destinationPostalCode, items)).quotes;
}
