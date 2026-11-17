"use client";

import { useState, type ChangeEvent } from "react";
import { AddToCart } from "@/components/add-to-cart";
import { GarmentSilhouette } from "@/components/garment-silhouette";
import { defaultColorHex, type Product } from "@/lib/product-types";

export function ProductPurchaseArea({ product }: { product: Product }) {
  const [selectedColor, setSelectedColor] = useState(
    product.colors[0] || "Padrão",
  );

  const selectedHex =
    product.colorHexes?.[selectedColor] || defaultColorHex(selectedColor);

  function handleChange(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;

    if (
      target instanceof HTMLSelectElement &&
      product.colors.includes(target.value)
    ) {
      setSelectedColor(target.value);
    }
  }

  return (
    <div className="product-purchase-area" onChangeCapture={handleChange}>
      <div className="product-purchase-cart">
        <AddToCart product={product} />
      </div>

      <div className="garment-store-preview" aria-live="polite">
        <GarmentSilhouette
          color={selectedHex}
          title={`Referência da cor ${selectedColor}`}
        />

        <span className="garment-store-color-text">
          <small>Cor selecionada</small>
          <strong>{selectedColor}</strong>
        </span>
      </div>
    </div>
  );
}
