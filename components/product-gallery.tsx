"use client";

import Image from "next/image";
import { useState } from "react";

type ProductGalleryProps = {
  images: string[];
  productName: string;
};

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const safeImages = images.filter(Boolean);
  const [selectedImage, setSelectedImage] = useState(safeImages[0] || "");

  if (!selectedImage) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        alignSelf: "start",
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 5",
          overflow: "hidden",
          borderRadius: 18,
          background: "#f5f3f0",
        }}
      >
        <Image
          src={selectedImage}
          alt={productName}
          fill
          priority
          sizes="(max-width: 800px) 100vw, 55vw"
          style={{ objectFit: "contain" }}
        />
      </div>

      {safeImages.length > 1 && (
        <div
          aria-label="Outras fotos do produto"
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {safeImages.map((image, index) => {
            const selected = image === selectedImage;

            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setSelectedImage(image)}
                aria-label={`Ver foto ${index + 1} de ${productName}`}
                aria-pressed={selected}
                style={{
                  position: "relative",
                  flex: "0 0 76px",
                  width: 76,
                  height: 95,
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: 10,
                  border: selected
                    ? "2px solid #111"
                    : "1px solid rgba(0, 0, 0, 0.14)",
                  background: "#f5f3f0",
                  cursor: "pointer",
                }}
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="76px"
                  style={{ objectFit: "cover" }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
