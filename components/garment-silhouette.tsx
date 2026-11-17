"use client";

import type { CSSProperties } from "react";
import type { GarmentShape } from "@/lib/product-types";

type Props = {
  shape?: GarmentShape;
  color?: string;
  className?: string;
  title?: string;
};

type ColorOrbStyle = CSSProperties & {
  "--orb-base": string;
  "--orb-light": string;
  "--orb-soft-light": string;
  "--orb-shadow": string;
  "--orb-deep": string;
};

function normalizeHex(value: string) {
  const clean = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(clean)) {
    return clean.toUpperCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(clean)) {
    const [r, g, b] = clean.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return "#A46B45";
}

function mixHex(base: string, target: string, amount: number) {
  const safeBase = normalizeHex(base).slice(1);
  const safeTarget = normalizeHex(target).slice(1);
  const ratio = Math.min(1, Math.max(0, amount));

  const mixed = [0, 2, 4]
    .map((index) => {
      const from = Number.parseInt(safeBase.slice(index, index + 2), 16);
      const to = Number.parseInt(safeTarget.slice(index, index + 2), 16);

      return Math.round(from + (to - from) * ratio)
        .toString(16)
        .padStart(2, "0");
    })
    .join("");

  return `#${mixed}`.toUpperCase();
}

export function GarmentSilhouette({
  color = "#A46B45",
  className,
  title = "Referência aproximada da cor",
}: Props) {
  const base = normalizeHex(color);

  const style: ColorOrbStyle = {
    "--orb-base": base,
    "--orb-light": mixHex(base, "#FFFFFF", 0.42),
    "--orb-soft-light": mixHex(base, "#FFFFFF", 0.16),
    "--orb-shadow": mixHex(base, "#000000", 0.24),
    "--orb-deep": mixHex(base, "#000000", 0.42),
  };

  return (
    <span
      className={["garment-color-orb", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={title}
      title={title}
      style={style}
    >
      <span className="garment-color-orb-shine" aria-hidden="true" />
    </span>
  );
}
