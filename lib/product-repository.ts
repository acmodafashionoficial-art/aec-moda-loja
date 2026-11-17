import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  GarmentShape,
  Product,
  ProductCategory,
  ProductInput,
  ProductVariant,
} from "@/lib/product-types";
import {
  PRODUCT_CATEGORIES,
  defaultColorHex,
  isGarmentShape,
  suggestGarmentShape,
} from "@/lib/product-types";
import { makeSlug, makeSku } from "@/lib/slug";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeAssetUrl } from "@/lib/security/validation";

const localFile = path.join(process.cwd(), "data", "products.json");

type ProductQueryOptions = { includeInactive?: boolean };

type DatabaseProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  subcategory: string | null;
  garment_shape?: GarmentShape | null;
  color_hexes?: unknown;
  price: number | string;
  compare_at_price: number | string | null;
  active: boolean;
  featured: boolean;
  image_url: string | null;
  image_thumbnail_url: string | null;
  image_original_url: string | null;
  images: unknown;
  weight_kg?: number | string | null;
  width_cm?: number | string | null;
  height_cm?: number | string | null;
  length_cm?: number | string | null;
  logistics_mode?: "profile" | "manual" | null;
  logistics_profile_id?: string | null;
  created_at?: string;
  updated_at?: string;
  product_variants?: Array<{
    id: string;
    sku: string;
    size: string;
    color: string;
    stock: number;
    reserved_stock?: number | null;
    active?: boolean | null;
  }>;
};

function unique(values: string[], maxItems = 30, maxLength = 80) {
  return [
    ...new Set(
      values
        .map((value) =>
          value
            .trim()
            .replace(/[\u0000-\u001F\u007F]/g, "")
            .slice(0, maxLength),
        )
        .filter(Boolean),
    ),
  ].slice(0, maxItems);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function cleanHexColor(value: unknown, fallback: string) {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : fallback;
}

function normalizeColorHexes(value: unknown, colors: string[]) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    colors.map((color) => [
      color,
      cleanHexColor(source[color], defaultColorHex(color)),
    ]),
  );
}

function mapDatabaseProduct(row: DatabaseProductRow): Product {
  const variants: ProductVariant[] = (row.product_variants || [])
    .filter((variant) => variant.active !== false)
    .map((variant) => {
      const physicalStock = Number(variant.stock) || 0;
      const reservedStock = Number(variant.reserved_stock) || 0;
      return {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        stock: Math.max(0, physicalStock - reservedStock),
        physicalStock,
        reservedStock,
      };
    });
  const savedImages = Array.isArray(row.images)
    ? row.images.filter((value): value is string => typeof value === "string")
    : [];
  const image = row.image_url || savedImages[0] || "/products/body-vinho.svg";

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    category: row.category,
    subcategory:
      String(row.subcategory || "Outros")
        .trim()
        .slice(0, 80) || "Outros",
    garmentShape: isGarmentShape(row.garment_shape)
      ? row.garment_shape
      : suggestGarmentShape(row.subcategory || "", row.name, row.category),
    colorHexes: normalizeColorHexes(
      row.color_hexes,
      unique(variants.map((variant) => variant.color)),
    ),
    price: Number(row.price),
    compareAtPrice:
      row.compare_at_price == null ? undefined : Number(row.compare_at_price),
    active: row.active,
    featured: row.featured,
    image,
    imageThumbnail: row.image_thumbnail_url || undefined,
    imageOriginal: row.image_original_url || undefined,
    images: savedImages.length ? savedImages : [image],
    variants,
    sizes: unique(variants.map((variant) => variant.size)),
    colors: unique(variants.map((variant) => variant.color)),
    stock: variants.reduce((total, variant) => total + variant.stock, 0),
    weightKg: Number(row.weight_kg) || 0.35,
    widthCm: Number(row.width_cm) || 20,
    heightCm: Number(row.height_cm) || 5,
    lengthCm: Number(row.length_cm) || 28,
    logisticsMode: row.logistics_mode === "manual" ? "manual" : "profile",
    logisticsProfileId: row.logistics_profile_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readLocalProducts(): Promise<Product[]> {
  try {
    const content = await fs.readFile(localFile, "utf8");
    return (JSON.parse(content) as Product[]).map((product) => {
      const colors = unique((product.colors || []).map(String));
      return {
        ...product,
        subcategory:
          String(product.subcategory || "Outros")
            .trim()
            .slice(0, 80) || "Outros",
        garmentShape: isGarmentShape(product.garmentShape)
          ? product.garmentShape
          : suggestGarmentShape(
              product.subcategory || "",
              product.name,
              product.category,
            ),
        colorHexes: normalizeColorHexes(product.colorHexes, colors),
      };
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, "[]", "utf8");
    return [];
  }
}

async function writeLocalProducts(products: Product[]) {
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await fs.writeFile(localFile, JSON.stringify(products, null, 2), "utf8");
}

export function usingSupabase() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

export function normalizeProductInput(
  raw: Partial<ProductInput>,
  existingId?: string,
): Product {
  const name = String(raw.name || "")
    .trim()
    .slice(0, 120);
  if (name.length < 3)
    throw new Error("Informe um nome com pelo menos 3 caracteres.");

  const category = PRODUCT_CATEGORIES.includes(raw.category as ProductCategory)
    ? (raw.category as ProductCategory)
    : "Feminino";
  const subcategory =
    String(raw.subcategory || "Outros")
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .slice(0, 80) || "Outros";
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0)
    throw new Error("Informe um preço válido.");
  const compareAtPrice =
    raw.compareAtPrice == null || raw.compareAtPrice === 0
      ? undefined
      : Number(raw.compareAtPrice);
  if (
    compareAtPrice != null &&
    (!Number.isFinite(compareAtPrice) || compareAtPrice <= price)
  ) {
    throw new Error("O preço anterior precisa ser maior que o preço atual.");
  }

  const sizes = unique((raw.sizes || []).map(String), 20, 40);
  const colors = unique((raw.colors || []).map(String), 20, 40);
  if (!sizes.length) sizes.push("Único");
  if (!colors.length) colors.push("Padrão");

  const garmentShape = isGarmentShape(raw.garmentShape)
    ? raw.garmentShape
    : suggestGarmentShape(subcategory, name, category);
  const colorHexes = normalizeColorHexes(raw.colorHexes, colors);

  const slug = makeSlug(String(raw.slug || name));
  if (!slug) throw new Error("Não foi possível criar o endereço do produto.");

  const variantsByKey = new Map(
    (raw.variants || []).map((variant) => [
      `${variant.size}|||${variant.color}`,
      Math.max(0, Math.floor(Number(variant.stock) || 0)),
    ]),
  );
  if (sizes.length * colors.length > 100)
    throw new Error(
      "O produto pode ter no máximo 100 combinações de tamanho e cor.",
    );
  const variants = sizes.flatMap((size) =>
    colors.map((color) => ({
      sku: makeSku(slug, size, color),
      size,
      color,
      stock: variantsByKey.get(`${size}|||${color}`) || 0,
      physicalStock: variantsByKey.get(`${size}|||${color}`) || 0,
      reservedStock: 0,
    })),
  );

  const images = unique(
    (raw.images || []).map((value) => safeAssetUrl(value)).filter(Boolean),
    8,
    1000,
  );
  const image =
    safeAssetUrl(raw.image || images[0], 1000) || "/products/body-vinho.svg";
  if (!images.length) images.push(image);

  return {
    id: existingId || raw.id || randomUUID(),
    slug,
    name,
    category,
    subcategory,
    garmentShape,
    colorHexes,
    price: Math.round(price * 100) / 100,
    compareAtPrice:
      compareAtPrice == null
        ? undefined
        : Math.round(compareAtPrice * 100) / 100,
    description: String(raw.description || "")
      .trim()
      .slice(0, 5000),
    image,
    imageThumbnail: safeAssetUrl(raw.imageThumbnail, 1000) || undefined,
    imageOriginal: safeAssetUrl(raw.imageOriginal, 1000) || undefined,
    images,
    sizes,
    colors,
    variants,
    featured: Boolean(raw.featured),
    active: raw.active !== false,
    stock: variants.reduce((total, variant) => total + variant.stock, 0),
    weightKg: Math.min(30, Math.max(0.05, Number(raw.weightKg) || 0.35)),
    widthCm: Math.min(100, Math.max(11, Number(raw.widthCm) || 20)),
    heightCm: Math.min(100, Math.max(2, Number(raw.heightCm) || 5)),
    lengthCm: Math.min(100, Math.max(16, Number(raw.lengthCm) || 28)),
    logisticsMode: raw.logisticsMode === "manual" ? "manual" : "profile",
    logisticsProfileId: raw.logisticsProfileId
      ? String(raw.logisticsProfileId).trim().slice(0, 60)
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function listProducts(
  options: ProductQueryOptions = {},
): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const products = await readLocalProducts();
    return products
      .filter((product) => options.includeInactive || product.active)
      .sort((a, b) =>
        (b.updatedAt || b.createdAt || "").localeCompare(
          a.updatedAt || a.createdAt || "",
        ),
      );
  }

  let query = supabase
    .from("products")
    .select(
      "*, product_variants(id, sku, size, color, stock, reserved_stock, active)",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (!options.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar produtos: ${error.message}`);
  return ((data || []) as DatabaseProductRow[]).map(mapDatabaseProduct);
}

export async function findProductById(id: string, includeInactive = false) {
  const products = await listProducts({ includeInactive });
  return products.find((product) => product.id === id);
}

export async function findProductBySlug(slug: string) {
  const products = await listProducts();
  return products.find((product) => product.slug === slug);
}

export async function saveProduct(raw: Partial<ProductInput>, id?: string) {
  const normalized = normalizeProductInput(raw, id);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const products = await readLocalProducts();
    const duplicate = products.find(
      (product) =>
        product.slug === normalized.slug && product.id !== normalized.id,
    );
    if (duplicate)
      normalized.slug = `${normalized.slug}-${normalized.id.slice(0, 5)}`;
    const index = products.findIndex((product) => product.id === normalized.id);
    const saved: Product = {
      ...normalized,
      createdAt: index >= 0 ? products[index].createdAt : now,
      updatedAt: now,
    };
    if (index >= 0) products[index] = saved;
    else products.unshift(saved);
    await writeLocalProducts(products);
    return saved;
  }

  // Produtos criados nas versões locais antigas usavam IDs legíveis, como
  // "body-vinho". No Supabase a coluna products.id é UUID. Para esses
  // produtos legados, deixamos o banco gerar um UUID e usamos o slug como
  // chave de conflito, tornando a migração segura e repetível.
  const hasDatabaseId = isUuid(normalized.id);
  const productRow = {
    ...(hasDatabaseId ? { id: normalized.id } : {}),
    slug: normalized.slug,
    name: normalized.name,
    description: normalized.description,
    category: normalized.category,
    subcategory: normalized.subcategory || "Outros",
    garment_shape: normalized.garmentShape || "blusa",
    color_hexes: normalized.colorHexes || {},
    price: normalized.price,
    compare_at_price: normalized.compareAtPrice || null,
    active: normalized.active,
    featured: normalized.featured,
    image_url: normalized.image,
    image_thumbnail_url: normalized.imageThumbnail || null,
    image_original_url: normalized.imageOriginal || null,
    images: normalized.images,
    weight_kg: normalized.weightKg,
    width_cm: normalized.widthCm,
    height_cm: normalized.heightCm,
    length_cm: normalized.lengthCm,
    logistics_mode: normalized.logisticsMode || "profile",
    logistics_profile_id: normalized.logisticsProfileId || null,
    updated_at: now,
  };

  const { data: savedRow, error: productError } = await supabase
    .from("products")
    .upsert(productRow, { onConflict: hasDatabaseId ? "id" : "slug" })
    .select("*")
    .single();
  if (productError) {
    if (productError.code === "23505")
      throw new Error("Já existe um produto com esse nome/endereço.");
    throw new Error(`Erro ao salvar produto: ${productError.message}`);
  }

  const productId = savedRow.id as string;
  const { data: existingVariants, error: existingVariantsError } =
    await supabase
      .from("product_variants")
      .select("id, sku, reserved_stock")
      .eq("product_id", productId);
  if (existingVariantsError)
    throw new Error(
      `Erro ao conferir estoque atual: ${existingVariantsError.message}`,
    );
  const existingBySku = new Map(
    (existingVariants || []).map((variant) => [String(variant.sku), variant]),
  );

  const variantRows = normalized.variants.map((variant) => ({
    product_id: productId,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    stock: variant.physicalStock ?? variant.stock,
    active: true,
  }));
  for (const variant of variantRows) {
    const reserved = Number(
      existingBySku.get(variant.sku)?.reserved_stock || 0,
    );
    if (variant.stock < reserved) {
      throw new Error(
        `A variação ${variant.size} / ${variant.color} possui ${reserved} unidade(s) reservada(s). O estoque físico não pode ficar abaixo desse valor.`,
      );
    }
  }
  if (variantRows.length) {
    const { error: variantsError } = await supabase
      .from("product_variants")
      .upsert(variantRows, { onConflict: "sku" });
    if (variantsError)
      throw new Error(`Erro ao salvar estoque: ${variantsError.message}`);
  }

  const activeSkus = new Set(variantRows.map((variant) => variant.sku));
  const inactiveIds = (existingVariants || [])
    .filter((variant) => !activeSkus.has(String(variant.sku)))
    .map((variant) => String(variant.id));
  if (inactiveIds.length) {
    const { error: deactivateError } = await supabase
      .from("product_variants")
      .update({ active: false })
      .in("id", inactiveIds);
    if (deactivateError)
      throw new Error(
        `Erro ao desativar variações antigas: ${deactivateError.message}`,
      );
  }

  const saved = await findProductById(productId, true);
  if (!saved) throw new Error("O produto foi salvo, mas não pôde ser relido.");
  return saved;
}

export async function deleteProduct(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const products = await readLocalProducts();
    const next = products.filter((product) => product.id !== id);
    if (next.length === products.length)
      throw new Error("Produto não encontrado.");
    await writeLocalProducts(next);
    return;
  }
  const { data, error } = await supabase.rpc("archive_product", {
    p_product_id: id,
  });
  if (error) throw new Error(`Erro ao excluir produto: ${error.message}`);
  if (!data) throw new Error("Produto não encontrado.");
}
