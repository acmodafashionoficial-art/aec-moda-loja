import type { Product } from "@/lib/product-types";
import { findProductById, findProductBySlug, listProducts } from "@/lib/product-repository";

export type { Product } from "@/lib/product-types";

export async function getProducts(includeInactive = false): Promise<Product[]> {
  return listProducts({ includeInactive });
}

export async function getProductBySlug(slug: string) {
  return findProductBySlug(slug);
}

export async function getProductById(id: string, includeInactive = false) {
  return findProductById(id, includeInactive);
}
