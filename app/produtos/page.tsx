import type { Metadata } from "next";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/catalog";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_SUBCATEGORIES,
  type ProductCategory,
} from "@/lib/product-types";

export const metadata: Metadata = { title: "Produtos" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    categoria?: string;
    subcategoria?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const { categoria, subcategoria } = await searchParams;
  const products = await getProducts();

  const activeCategory = PRODUCT_CATEGORIES.includes(
    categoria as ProductCategory,
  )
    ? (categoria as ProductCategory)
    : undefined;

  const activeSubcategory = String(subcategoria || "").trim();

  const filtered = products.filter((product) => {
    const matchesCategory =
      !activeCategory || product.category === activeCategory;
    const matchesSubcategory =
      !activeSubcategory ||
      String(product.subcategory || "Outros") === activeSubcategory;

    return matchesCategory && matchesSubcategory;
  });

  const subcategories = activeCategory
    ? Array.from(
        new Set([
          ...PRODUCT_SUBCATEGORIES[activeCategory],
          ...products
            .filter((product) => product.category === activeCategory)
            .map((product) => String(product.subcategory || "Outros"))
            .filter(Boolean),
        ]),
      )
    : [];

  const pageTitle =
    activeSubcategory || activeCategory || "Todos os produtos";

  return (
    <div className="container page-space">
      <div className="catalog-heading">
        <div>
          <span className="eyebrow">A&C MODA</span>
          <h1>{pageTitle}</h1>
        </div>
        <span>{filtered.length} produtos</span>
      </div>

      <div className="filter-pills">
        <a
          className={!activeCategory ? "active" : ""}
          href="/produtos"
        >
          Todos
        </a>

        {PRODUCT_CATEGORIES.map((item) => (
          <a
            className={activeCategory === item ? "active" : ""}
            href={`/produtos?categoria=${encodeURIComponent(item)}`}
            key={item}
          >
            {item}
          </a>
        ))}
      </div>

      {activeCategory && (
        <>
          <span className="eyebrow">SUBCATEGORIAS</span>
          <div className="filter-pills">
            <a
              className={!activeSubcategory ? "active" : ""}
              href={`/produtos?categoria=${encodeURIComponent(activeCategory)}`}
            >
              Todas
            </a>

            {subcategories.map((item) => (
              <a
                className={activeSubcategory === item ? "active" : ""}
                href={`/produtos?categoria=${encodeURIComponent(activeCategory)}&subcategoria=${encodeURIComponent(item)}`}
                key={item}
              >
                {item}
              </a>
            ))}
          </div>
        </>
      )}

      {filtered.length ? (
        <div className="product-grid">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Produtos em preparação</h2>
          <p>
            Ainda não existem produtos cadastrados neste filtro.
          </p>
        </div>
      )}
    </div>
  );
}
