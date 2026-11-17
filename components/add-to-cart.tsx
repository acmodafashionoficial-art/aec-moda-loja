"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/product-types";
import { useCart } from "@/components/cart-provider";
import { trackAnalyticsEvent } from "@/lib/analytics-client";

export function AddToCart({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [size, setSize] = useState(product.sizes[0]);
  const [color, setColor] = useState(product.colors[0]);
  const [added, setAdded] = useState(false);

  const selectedVariant = useMemo(
    () => product.variants.find((variant) => variant.size === size && variant.color === color),
    [product.variants, size, color],
  );
  const available = Boolean(selectedVariant && selectedVariant.stock > 0);

  return (
    <div className="buy-box">
      <label>
        Tamanho
        <select value={size} onChange={(event) => setSize(event.target.value)}>
          {product.sizes.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <label>
        Cor
        <select value={color} onChange={(event) => setColor(event.target.value)}>
          {product.colors.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <button
        className="button button-dark button-full"
        disabled={!available}
        onClick={() => {
          if (!available) return;
          addItem(product, size, color);
          trackAnalyticsEvent("add_to_cart", {
            path: window.location.pathname,
            productSlug: product.slug,
          });
          setAdded(true);
          setTimeout(() => setAdded(false), 1800);
        }}
      >
        {added ? "Adicionado à sacola ✓" : available ? "Adicionar à sacola" : "Variação sem estoque"}
      </button>
      <p className="secure-note">
        {available ? `${selectedVariant?.stock} unidade(s) disponível(is) • Pagamento seguro` : "Escolha outra combinação de tamanho e cor"}
      </p>
    </div>
  );
}
