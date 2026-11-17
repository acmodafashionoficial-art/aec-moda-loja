import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type InventoryUnitStatus = "available" | "sold_store" | "sold_online" | "inactive";
export type InventoryPaymentMethod = "pix" | "dinheiro" | "debito" | "credito" | "outro";

export type InventoryUnitView = {
  id: string;
  code: string;
  status: InventoryUnitStatus;
  soldAt?: string;
  saleId?: string;
  createdAt?: string;
  variantId: string;
  sku: string;
  size: string;
  color: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  productId: string;
  productName: string;
  price: number;
  image?: string;
};

export type InStoreSaleResult = {
  saleId: string;
  salePublicCode: string;
  unitCode: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  unitPrice: number;
};

export type InStoreSaleItemView = {
  id: string;
  inventoryUnitId: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  unitPrice: number;
};

export type InStoreSaleView = {
  id: string;
  publicCode: string;
  status: "paid" | "cancelled";
  paymentMethod: InventoryPaymentMethod;
  total: number;
  soldByEmail?: string;
  cancelledByEmail?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  items: InStoreSaleItemView[];
};

type InventoryUnitRow = {
  id: string;
  variant_id: string;
  code: string;
  status: InventoryUnitStatus;
  in_store_sale_id?: string | null;
  sold_at?: string | null;
  created_at?: string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  size: string;
  color: string;
  stock: number | string;
  reserved_stock?: number | string | null;
  active?: boolean | null;
  products?:
    | {
        id: string;
        name: string;
        price: number | string;
        image_url?: string | null;
        image_thumbnail_url?: string | null;
        active?: boolean | null;
      }
    | Array<{
        id: string;
        name: string;
        price: number | string;
        image_url?: string | null;
        image_thumbnail_url?: string | null;
        active?: boolean | null;
      }>
    | null;
};

type SaleItemRow = {
  id: string;
  inventory_unit_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  size: string;
  color: string;
  unit_price: number | string;
};

type SaleRow = {
  id: string;
  public_code: string;
  status: "paid" | "cancelled";
  payment_method: InventoryPaymentMethod;
  total: number | string;
  sold_by_email?: string | null;
  cancelled_by_email?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  in_store_sale_items?: SaleItemRow[] | null;
};

function adminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("O controle de etiquetas precisa do Supabase configurado.");
  return supabase;
}

function normalizeCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
}

function mapProduct(value: VariantRow["products"]) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

async function loadVariants(variantIds: string[]) {
  const uniqueIds = [...new Set(variantIds)];

  if (!uniqueIds.length) {
    return new Map<string, VariantRow>();
  }

  const supabase = adminClient();
  const variants = new Map<string, VariantRow>();
  const batchSize = 100;

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from("product_variants")
      .select(
        "id, product_id, sku, size, color, stock, reserved_stock, active, products!product_variants_product_id_fkey(id, name, price, image_url, image_thumbnail_url, active)"
      )
      .in("id", batch);

    if (error) {
      const diagnostic = [
        error.code,
        error.message,
        error.details,
        error.hint,
      ]
        .filter(Boolean)
        .join(" | ");

      throw new Error(
        `Erro ao carregar as variações (lote ${Math.floor(i / batchSize) + 1}): ${diagnostic}`
      );
    }

    for (const variant of (data || []) as unknown as VariantRow[]) {
      variants.set(variant.id, variant);
    }
  }

  return variants;
}

function combineUnit(unit: InventoryUnitRow, variant: VariantRow | undefined): InventoryUnitView | null {
  if (!variant) return null;
  const product = mapProduct(variant.products);
  if (!product) return null;
  const physicalStock = Math.max(0, Number(variant.stock) || 0);
  const reservedStock = Math.max(0, Number(variant.reserved_stock) || 0);
  return {
    id: unit.id,
    code: unit.code,
    status: unit.status,
    soldAt: unit.sold_at || undefined,
    saleId: unit.in_store_sale_id || undefined,
    createdAt: unit.created_at || undefined,
    variantId: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    physicalStock,
    reservedStock,
    availableStock: Math.max(0, physicalStock - reservedStock),
    productId: product.id,
    productName: product.name,
    price: Number(product.price) || 0,
    image: product.image_thumbnail_url || product.image_url || undefined,
  };
}

export async function listAvailableInventoryUnits() {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("inventory_units")
    .select("id, variant_id, code, status, in_store_sale_id, sold_at, created_at")
    .eq("status", "available")
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`Erro ao carregar as etiquetas: ${error.message}`);
  const units = (data || []) as InventoryUnitRow[];
  const variants = await loadVariants(units.map((unit) => unit.variant_id));
  return units
    .map((unit) => combineUnit(unit, variants.get(unit.variant_id)))
    .filter((unit): unit is InventoryUnitView => Boolean(unit))
    .sort((a, b) =>
      a.productName.localeCompare(b.productName, "pt-BR") ||
      a.size.localeCompare(b.size, "pt-BR") ||
      a.color.localeCompare(b.color, "pt-BR") ||
      a.code.localeCompare(b.code, "pt-BR")
    );
}

export async function getInventoryUnitByCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("inventory_units")
    .select("id, variant_id, code, status, in_store_sale_id, sold_at, created_at")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`Erro ao consultar a etiqueta: ${error.message}`);
  if (!data) return null;
  const unit = data as InventoryUnitRow;
  const variants = await loadVariants([unit.variant_id]);
  return combineUnit(unit, variants.get(unit.variant_id));
}

export async function registerInStoreSale(input: {
  code: string;
  paymentMethod: InventoryPaymentMethod;
  actorId: string;
  actorEmail: string;
}) {
  const code = normalizeCode(input.code);
  if (!code) throw new Error("Código da etiqueta inválido.");
  const allowedMethods: InventoryPaymentMethod[] = ["pix", "dinheiro", "debito", "credito", "outro"];
  if (!allowedMethods.includes(input.paymentMethod)) throw new Error("Forma de pagamento inválida.");
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("register_in_store_sale", {
    p_unit_code: code,
    p_payment_method: input.paymentMethod,
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw new Error(error.message || "Não foi possível registrar a venda.");
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw) throw new Error("A venda não retornou confirmação.");
  return {
    saleId: String(raw.sale_id),
    salePublicCode: String(raw.sale_public_code),
    unitCode: String(raw.unit_code),
    productName: String(raw.product_name),
    sku: String(raw.sku),
    size: String(raw.size),
    color: String(raw.color),
    unitPrice: Number(raw.unit_price) || 0,
  } satisfies InStoreSaleResult;
}

export async function listInStoreSales(limit = 200) {
  const supabase = adminClient();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  const { data, error } = await supabase
    .from("in_store_sales")
    .select("id, public_code, status, payment_method, total, sold_by_email, cancelled_by_email, cancelled_at, cancellation_reason, created_at, in_store_sale_items(id, inventory_unit_id, product_id, variant_id, product_name, sku, size, color, unit_price)")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`Erro ao carregar vendas presenciais: ${error.message}`);
  return ((data || []) as unknown as SaleRow[]).map((sale) => ({
    id: sale.id,
    publicCode: sale.public_code,
    status: sale.status,
    paymentMethod: sale.payment_method,
    total: Number(sale.total) || 0,
    soldByEmail: sale.sold_by_email || undefined,
    cancelledByEmail: sale.cancelled_by_email || undefined,
    cancelledAt: sale.cancelled_at || undefined,
    cancellationReason: sale.cancellation_reason || undefined,
    createdAt: sale.created_at,
    items: (sale.in_store_sale_items || []).map((item) => ({
      id: item.id,
      inventoryUnitId: item.inventory_unit_id,
      productId: item.product_id,
      variantId: item.variant_id,
      productName: item.product_name,
      sku: item.sku,
      size: item.size,
      color: item.color,
      unitPrice: Number(item.unit_price) || 0,
    })),
  })) satisfies InStoreSaleView[];
}

export async function cancelInStoreSale(input: {
  saleId: string;
  reason?: string;
  actorId: string;
  actorEmail: string;
}) {
  const reason = String(input.reason || "").trim().slice(0, 500);
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("cancel_in_store_sale", {
    p_sale_id: input.saleId,
    p_reason: reason || null,
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw new Error(error.message || "Não foi possível cancelar a venda.");
  return Boolean(data);
}
