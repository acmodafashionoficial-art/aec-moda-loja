import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/product-types";
import { formatBRL } from "@/lib/currency";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link href={`/produto/${product.slug}`} className="product-image-wrap">
        {product.compareAtPrice && <span className="sale-badge">OFERTA</span>}
        <Image src={product.image} alt={product.name} fill sizes="(max-width: 700px) 50vw, 25vw" />
      </Link>
      <div className="product-card-content">
        <span className="eyebrow">{product.category}</span>
        <Link href={`/produto/${product.slug}`} className="product-name">{product.name}</Link>
        <div className="price-row">
          <strong>{formatBRL(product.price)}</strong>
          {product.compareAtPrice && <s>{formatBRL(product.compareAtPrice)}</s>}
        </div>
        <span className="installments">ou 3x de {formatBRL(product.price / 3)} sem juros</span>
      </div>
    </article>
  );
}
