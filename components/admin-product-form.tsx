"use client";

import Image from "next/image";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  GarmentShape,
  Product,
  ProductCategory,
  ProductVariant,
} from "@/lib/product-types";
import type { LogisticsSettings } from "@/lib/logistics-types";
import { createShipmentPlan, profileUnitVolume } from "@/lib/packing";
import {
  GARMENT_SHAPES,
  PRODUCT_CATEGORIES,
  PRODUCT_COLOR_OPTIONS,
  PRODUCT_SUBCATEGORIES,
  defaultColorHex,
  suggestGarmentShape,
} from "@/lib/product-types";
import { makeSlug } from "@/lib/slug";
import { ProductImageCropper } from "@/components/product-image-cropper";
import { GarmentSilhouette } from "@/components/garment-silhouette";

const STANDARD_SIZES = ["PP", "P", "M", "G", "GG", "XGG", "Único"];

type UploadResult = {
  imageUrl: string;
  thumbnailUrl: string;
  originalUrl: string;
  width?: number;
  height?: number;
  warning?: string;
};

function variantKey(size: string, color: string) {
  return `${size}|||${color}`;
}

function suggestLogisticsProfile(
  name: string,
  category: ProductCategory,
  settings: LogisticsSettings,
) {
  const text = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const candidates: Array<[string[], string]> = [
    [["body", "cropped"], "body-cropped"],
    [["jeans", "jean"], "jeans"],
    [["calca"], "calca"],
    [["vestido"], "vestido"],
    [["conjunto", "kit"], "conjunto"],
    [["jaqueta", "casaco", "moletom"], "jaqueta"],
    [["short", "saia"], "short-saia"],
    [["cinto", "bolsa", "colar", "brinco", "acessorio"], "acessorio"],
  ];
  const suggested =
    category === "Infantil"
      ? "infantil"
      : category === "Acessórios"
        ? "acessorio"
        : candidates.find(([words]) =>
            words.some((word) => text.includes(word)),
          )?.[1];
  return (
    settings.profiles.find(
      (profile) => profile.enabled && profile.id === suggested,
    )?.id || settings.fallbackProfileId
  );
}

function defaultDescription(
  name: string,
  category: string,
  colors: string[],
  sizes: string[],
) {
  const colorText = colors.length
    ? ` Disponível nas cores ${colors.join(", ")}.`
    : "";
  const sizeText = sizes.length ? ` Tamanhos: ${sizes.join(", ")}.` : "";
  return `${name || "Esta peça"} foi selecionada pela A&C Moda pensando em conforto, versatilidade e ótimo caimento. Uma opção prática para diferentes momentos do dia.${colorText}${sizeText}`;
}

export function AdminProductForm({
  product,
  logisticsSettings,
}: {
  product?: Product;
  logisticsSettings: LogisticsSettings;
}) {
  const router = useRouter();
  const initialCategory: ProductCategory = product?.category || "Feminino";
  const initialSubcategory = product?.subcategory || "";
  const initialCustomSubcategory = Boolean(
    initialSubcategory &&
    !PRODUCT_SUBCATEGORIES[initialCategory].some(
      (item) => item === initialSubcategory,
    ),
  );
  const initialColors = product?.colors?.length ? product.colors : ["Preto"];
  const initialGarmentShape =
    product?.garmentShape ||
    suggestGarmentShape(
      initialSubcategory,
      product?.name || "",
      initialCategory,
    );

  const [name, setName] = useState(product?.name || "");
  const [slug, setSlug] = useState(product?.slug || "");
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [category, setCategory] = useState<ProductCategory>(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const [customSubcategoryMode, setCustomSubcategoryMode] = useState(
    initialCustomSubcategory,
  );
  const [price, setPrice] = useState(
    product?.price ? String(product.price) : "",
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    product?.compareAtPrice ? String(product.compareAtPrice) : "",
  );
  const [description, setDescription] = useState(product?.description || "");
  const [sizes, setSizes] = useState<string[]>(product?.sizes || ["M"]);
  const [colors, setColors] = useState<string[]>(initialColors);
  const [colorHexes, setColorHexes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialColors.map((color) => [
        color,
        product?.colorHexes?.[color] || defaultColorHex(color),
      ]),
    ),
  );
  const [garmentShape, setGarmentShape] =
    useState<GarmentShape>(initialGarmentShape);
  const [garmentShapeEdited, setGarmentShapeEdited] = useState(
    Boolean(product?.garmentShape),
  );
  const [customSize, setCustomSize] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [customColorHex, setCustomColorHex] = useState("#A46B45");
  const [stocks, setStocks] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (product?.variants || []).map((variant) => [
        variantKey(variant.size, variant.color),
        variant.physicalStock ?? variant.stock,
      ]),
    ),
  );
  const [images, setImages] = useState<string[]>(
    product?.images || (product?.image ? [product.image] : []),
  );
  const [thumbnail, setThumbnail] = useState(product?.imageThumbnail || "");
  const [original, setOriginal] = useState(product?.imageOriginal || "");
  const [active, setActive] = useState(product?.active ?? true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [weightKg, setWeightKg] = useState(String(product?.weightKg || 0.35));
  const [widthCm, setWidthCm] = useState(String(product?.widthCm || 20));
  const [heightCm, setHeightCm] = useState(String(product?.heightCm || 5));
  const [lengthCm, setLengthCm] = useState(String(product?.lengthCm || 28));
  const [logisticsMode, setLogisticsMode] = useState<"profile" | "manual">(
    product?.logisticsMode === "manual" ? "manual" : "profile",
  );
  const [logisticsProfileId, setLogisticsProfileId] = useState(
    product?.logisticsProfileId || logisticsSettings.fallbackProfileId,
  );
  const [logisticsProfileEdited, setLogisticsProfileEdited] = useState(
    Boolean(product?.logisticsProfileId),
  );
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const cropQueueRef = useRef<File[]>([]);

  const activeLogisticsProfiles = logisticsSettings.profiles.filter(
    (profile) => profile.enabled,
  );
  const selectedLogisticsProfile =
    activeLogisticsProfiles.find(
      (profile) => profile.id === logisticsProfileId,
    ) || activeLogisticsProfiles[0];
  const logisticsPreview = (() => {
    try {
      const unitWeightKg =
        logisticsMode === "manual"
          ? Number(weightKg.replace(",", ".")) || 0.35
          : selectedLogisticsProfile?.unitWeightKg || 0.35;
      const unitVolumeCm3 =
        logisticsMode === "manual"
          ? profileUnitVolume(
              Number(widthCm) || 20,
              Number(heightCm) || 5,
              Number(lengthCm) || 28,
            )
          : selectedLogisticsProfile?.unitVolumeCm3 || 1920;
      return createShipmentPlan(
        [
          {
            quantity: 3,
            unitWeightKg,
            unitVolumeCm3,
            insuranceValue: Number(price.replace(",", ".")) || 0,
          },
        ],
        logisticsSettings,
      );
    } catch {
      return null;
    }
  })();

  const variants: ProductVariant[] = useMemo(
    () =>
      sizes.flatMap((size) =>
        colors.map((color) => ({
          sku: "",
          size,
          color,
          stock: stocks[variantKey(size, color)] || 0,
        })),
      ),
    [sizes, colors, stocks],
  );

  function toggleItem(
    value: string,
    current: string[],
    setter: (values: string[]) => void,
  ) {
    if (current.includes(value)) {
      if (current.length === 1) return;
      setter(current.filter((item) => item !== value));
    } else setter([...current, value]);
  }

  function addCustom(
    value: string,
    current: string[],
    setter: (values: string[]) => void,
    clear: () => void,
  ) {
    const clean = value.trim().slice(0, 40);
    if (clean && !current.includes(clean)) setter([...current, clean]);
    clear();
  }

  function toggleColor(color: string, hex: string) {
    if (colors.includes(color)) {
      if (colors.length === 1) return;

      setColors((current) => current.filter((item) => item !== color));
      setColorHexes((current) => {
        const next = { ...current };
        delete next[color];
        return next;
      });
      return;
    }

    setColors((current) => [...current, color]);
    setColorHexes((current) => ({
      ...current,
      [color]: current[color] || hex,
    }));
  }

  function addCustomProductColor() {
    const clean = customColor.trim().slice(0, 40);
    if (!clean) return;

    if (!colors.includes(clean)) {
      setColors((current) => [...current, clean]);
    }

    setColorHexes((current) => ({
      ...current,
      [clean]: customColorHex,
    }));
    setCustomColor("");
  }

  function updateColorHex(color: string, value: string) {
    setColorHexes((current) => ({
      ...current,
      [color]: value.toUpperCase(),
    }));
  }

  function suggestShape(
    nextSubcategory: string,
    nextName = name,
    nextCategory = category,
  ) {
    if (!garmentShapeEdited) {
      setGarmentShape(
        suggestGarmentShape(nextSubcategory, nextName, nextCategory),
      );
    }
  }

  function openNextCropFile() {
    const [next, ...remaining] = cropQueueRef.current;
    cropQueueRef.current = remaining;
    setCropFile(next || null);

    if (!next) {
      setUploadMessage("Fotos ajustadas e prontas para salvar no produto.");
    }
  }

  function uploadFiles(files: FileList | File[]) {
    const selected = Array.from(files).slice(0, Math.max(0, 6 - images.length));

    if (!selected.length) return;

    setError("");
    setUploadMessage(
      "Posicione a primeira foto, ajuste o zoom e clique em Aplicar ajuste.",
    );
    cropQueueRef.current = selected.slice(1);
    setCropFile(selected[0]);
  }

  async function uploadCroppedFile(file: File) {
    setUploading(true);
    setError("");
    setUploadMessage("Enviando a foto ajustada…");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as UploadResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || `Não foi possível enviar ${file.name}.`,
        );
      }

      setImages((current) => [...current, result.imageUrl]);
      setThumbnail((current) => current || result.thumbnailUrl);
      setOriginal((current) => current || result.originalUrl);
      setUploadMessage(
        result.warning ||
          "Foto enquadrada manualmente, comprimida e pronta para a loja.",
      );
      openNextCropFile();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Erro ao enviar foto.";
      setError(message);
      throw new Error(message);
    } finally {
      setUploading(false);
    }
  }

  function cancelCurrentCrop() {
    openNextCropFile();
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!subcategory.trim()) {
        throw new Error("Escolha uma subcategoria ou digite uma nova.");
      }
      if (!images.length)
        throw new Error("Adicione pelo menos uma foto do produto.");
      const payload = {
        name,
        slug: slug || makeSlug(name),
        category,
        subcategory: subcategory.trim() || "Outros",
        price: Number(price.replace(",", ".")),
        compareAtPrice: compareAtPrice
          ? Number(compareAtPrice.replace(",", "."))
          : undefined,
        description,
        sizes,
        colors,
        garmentShape,
        colorHexes: Object.fromEntries(
          colors.map((color) => [
            color,
            /^#[0-9A-F]{6}$/i.test(colorHexes[color] || "")
              ? colorHexes[color].toUpperCase()
              : defaultColorHex(color),
          ]),
        ),
        variants,
        image: images[0],
        imageThumbnail: thumbnail || images[0],
        imageOriginal: original || images[0],
        images,
        active,
        featured,
        weightKg: Number(weightKg.replace(",", ".")),
        widthCm: Number(widthCm),
        heightCm: Number(heightCm),
        lengthCm: Number(lengthCm),
        logisticsMode,
        logisticsProfileId:
          logisticsMode === "profile" ? logisticsProfileId : undefined,
      };
      const response = await fetch(
        product ? `/api/admin/products/${product.id}` : "/api/admin/products",
        {
          method: product ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar o produto.");
      router.push("/admin");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-product-form" onSubmit={submit}>
      <div className="admin-form-main">
        <section className="admin-form-card">
          <div className="admin-form-card-title">
            <span>1</span>
            <div>
              <h2>Informações principais</h2>
              <p>
                Preencha apenas o essencial. O endereço é criado
                automaticamente.
              </p>
            </div>
          </div>
          <div className="admin-form-grid two">
            <label className="span-two">
              Nome do produto
              <input
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  if (!slugEdited) setSlug(makeSlug(value));
                  if (!logisticsProfileEdited) {
                    setLogisticsProfileId(
                      suggestLogisticsProfile(
                        value,
                        category,
                        logisticsSettings,
                      ),
                    );
                  }
                  suggestShape(subcategory, value, category);
                }}
                placeholder="Ex.: Vestido Midi Canelado"
                required
              />
            </label>
            <label>
              Categoria
              <select
                value={category}
                onChange={(event) => {
                  const value = event.target.value as ProductCategory;
                  setCategory(value);
                  setSubcategory("");
                  setCustomSubcategoryMode(false);
                  suggestShape("", name, value);
                  if (!logisticsProfileEdited) {
                    setLogisticsProfileId(
                      suggestLogisticsProfile(name, value, logisticsSettings),
                    );
                  }
                }}
              >
                {PRODUCT_CATEGORIES.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Subcategoria
              <select
                value={customSubcategoryMode ? "__custom__" : subcategory}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__custom__") {
                    setCustomSubcategoryMode(true);
                    setSubcategory("");
                    return;
                  }

                  setCustomSubcategoryMode(false);
                  setSubcategory(value);
                  suggestShape(value);
                }}
                required
              >
                <option value="">Selecione uma subcategoria</option>
                {PRODUCT_SUBCATEGORIES[category].map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
                <option value="__custom__">
                  Adicionar outra subcategoria…
                </option>
              </select>
              {customSubcategoryMode && (
                <input
                  value={subcategory}
                  onChange={(event) => {
                    const value = event.target.value.slice(0, 80);
                    setSubcategory(value);
                    suggestShape(value);
                  }}
                  placeholder="Digite a nova subcategoria"
                  autoFocus
                  required
                />
              )}
              <small>
                Escolha uma opção da lista ou selecione “Adicionar outra
                subcategoria”.
              </small>
            </label>
            <label className="span-two">
              Endereço do produto
              <input
                value={slug}
                onChange={(event) => {
                  setSlug(makeSlug(event.target.value));
                  setSlugEdited(true);
                }}
                placeholder="criado-automaticamente"
              />
            </label>
            <label>
              Preço atual (R$)
              <input
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="120,00"
                required
              />
            </label>
            <label>
              Preço anterior — opcional (R$)
              <input
                inputMode="decimal"
                value={compareAtPrice}
                onChange={(event) => setCompareAtPrice(event.target.value)}
                placeholder="150,00"
              />
            </label>
            <label className="span-two">
              Descrição
              <textarea
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Conte os detalhes da peça…"
              />
              <button
                type="button"
                className="admin-helper-button"
                onClick={() =>
                  setDescription(
                    defaultDescription(name, category, colors, sizes),
                  )
                }
              >
                Gerar descrição padronizada
              </button>
            </label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title">
            <span>2</span>
            <div>
              <h2>Fotos com enquadramento manual</h2>
              <p>
                Escolha a foto, arraste para posicionar, ajuste o zoom e aplique
                o recorte sem esticar a imagem.
              </p>
            </div>
          </div>
          <label
            className={`image-dropzone ${uploading ? "uploading" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              uploadFiles(event.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(event) =>
                event.target.files && uploadFiles(event.target.files)
              }
            />
            <b>
              {uploading
                ? "Processando fotos…"
                : "Arraste as fotos aqui ou clique para escolher"}
            </b>
            <span>JPG, PNG ou WebP • até 8 MB • máximo de 6 fotos</span>
          </label>
          {uploadMessage && (
            <div className="upload-success">✓ {uploadMessage}</div>
          )}
          {images.length > 0 && (
            <div className="admin-image-list">
              {images.map((image, index) => (
                <div className="admin-image-item" key={`${image}-${index}`}>
                  <div className="admin-image-preview">
                    <Image
                      src={image}
                      alt={`Foto ${index + 1}`}
                      fill
                      sizes="150px"
                    />
                  </div>
                  <div>
                    <strong>
                      {index === 0 ? "Foto principal" : `Foto ${index + 1}`}
                    </strong>
                    <small>
                      {index === 0
                        ? "Será usada no catálogo"
                        : "Imagem complementar"}
                    </small>
                  </div>
                  <div className="admin-image-actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveImage(index, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === images.length - 1}
                      onClick={() => moveImage(index, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        setImages((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title">
            <span>3</span>
            <div>
              <h2>Tamanhos, cores e estoque</h2>
              <p>
                Escolha as opções. O sistema cria todas as combinações
                automaticamente.
              </p>
            </div>
          </div>
          <div className="garment-admin-editor">
            <label>
              Molde visual da peça
              <select
                value={garmentShape}
                onChange={(event) => {
                  setGarmentShape(event.target.value as GarmentShape);
                  setGarmentShapeEdited(true);
                }}
              >
                {GARMENT_SHAPES.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <small>
                O molde aparece ao lado da seleção de cor na página do produto.
              </small>
            </label>

            <div className="garment-admin-preview">
              <GarmentSilhouette
                shape={garmentShape}
                color={
                  colorHexes[colors[0]] || defaultColorHex(colors[0] || "Preto")
                }
                title="Prévia do molde escolhido"
              />
              <span>Prévia com a primeira cor</span>
              {garmentShapeEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setGarmentShapeEdited(false);
                    setGarmentShape(
                      suggestGarmentShape(subcategory, name, category),
                    );
                  }}
                >
                  Voltar ao automático
                </button>
              )}
            </div>
          </div>

          <div className="option-group">
            <strong>Tamanhos</strong>
            <div className="option-chips">
              {STANDARD_SIZES.map((item) => (
                <button
                  type="button"
                  className={sizes.includes(item) ? "selected" : ""}
                  key={item}
                  onClick={() => toggleItem(item, sizes, setSizes)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="inline-add">
              <input
                value={customSize}
                onChange={(event) => setCustomSize(event.target.value)}
                placeholder="Outro tamanho, ex.: 38 ao 42"
              />
              <button
                type="button"
                onClick={() =>
                  addCustom(customSize, sizes, setSizes, () =>
                    setCustomSize(""),
                  )
                }
              >
                Adicionar
              </button>
            </div>
            {sizes
              .filter((item) => !STANDARD_SIZES.includes(item))
              .map((item) => (
                <button
                  type="button"
                  className="custom-tag"
                  key={item}
                  onClick={() => toggleItem(item, sizes, setSizes)}
                >
                  {item} ×
                </button>
              ))}
          </div>

          <div className="option-group">
            <strong>Cores e tonalidades</strong>
            <p className="admin-field-note">
              Escolha entre várias cores. Depois ajuste cada tom para ficar mais
              claro, escuro ou próximo da cor real da peça.
            </p>

            <div className="product-color-palette">
              {PRODUCT_COLOR_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={colors.includes(option.name) ? "selected" : ""}
                  key={option.name}
                  onClick={() => toggleColor(option.name, option.hex)}
                  title={option.name}
                >
                  <span style={{ backgroundColor: option.hex }} />
                  {option.name}
                </button>
              ))}
            </div>

            <div className="custom-color-add">
              <label>
                Nome de outra cor
                <input
                  value={customColor}
                  onChange={(event) =>
                    setCustomColor(event.target.value.slice(0, 40))
                  }
                  placeholder="Ex.: Verde esmeralda"
                />
              </label>
              <label>
                Tom inicial
                <input
                  type="color"
                  value={customColorHex}
                  onChange={(event) =>
                    setCustomColorHex(event.target.value.toUpperCase())
                  }
                />
              </label>
              <button type="button" onClick={addCustomProductColor}>
                Adicionar cor
              </button>
            </div>

            <div className="selected-color-grid">
              {colors.map((color) => {
                const colorHex = colorHexes[color] || defaultColorHex(color);

                return (
                  <div className="selected-color-card" key={color}>
                    <div className="selected-color-title">
                      <span style={{ backgroundColor: colorHex }} />
                      <strong>{color}</strong>
                    </div>

                    <label>
                      Clarear ou escurecer
                      <input
                        type="color"
                        value={
                          /^#[0-9A-F]{6}$/i.test(colorHex)
                            ? colorHex
                            : defaultColorHex(color)
                        }
                        onChange={(event) =>
                          updateColorHex(color, event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Código da cor
                      <input
                        value={colorHex}
                        maxLength={7}
                        onChange={(event) =>
                          updateColorHex(
                            color,
                            event.target.value.replace(/[^#0-9a-f]/gi, ""),
                          )
                        }
                        onBlur={() => {
                          if (!/^#[0-9A-F]{6}$/i.test(colorHex)) {
                            updateColorHex(color, defaultColorHex(color));
                          }
                        }}
                        placeholder="#A46B45"
                      />
                    </label>

                    <button
                      type="button"
                      className="danger"
                      disabled={colors.length === 1}
                      onClick={() => toggleColor(color, colorHex)}
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="stock-grid">
            <div className="stock-grid-header">
              <span>Variação</span>
              <span>Quantidade</span>
            </div>
            {variants.map((variant) => (
              <label key={variantKey(variant.size, variant.color)}>
                <span>
                  <b>{variant.size}</b> / {variant.color}
                </span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={stocks[variantKey(variant.size, variant.color)] || 0}
                  onChange={(event) =>
                    setStocks((current) => ({
                      ...current,
                      [variantKey(variant.size, variant.color)]: Math.max(
                        0,
                        Number(event.target.value) || 0,
                      ),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title">
            <span>4</span>
            <div>
              <h2>Frete automático</h2>
              <p>
                Escolha somente o tipo da peça. Peso, volume, quantidade e
                embalagem serão calculados automaticamente.
              </p>
            </div>
          </div>
          <div className="logistics-mode-grid">
            <label
              className={`logistics-mode-card ${logisticsMode === "profile" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="logistics-mode"
                checked={logisticsMode === "profile"}
                onChange={() => setLogisticsMode("profile")}
              />
              <span>
                <b>Usar padrão automático</b>
                <small>Recomendado para o cadastro diário.</small>
              </span>
            </label>
            <label
              className={`logistics-mode-card ${logisticsMode === "manual" ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="logistics-mode"
                checked={logisticsMode === "manual"}
                onChange={() => setLogisticsMode("manual")}
              />
              <span>
                <b>Medida especial deste produto</b>
                <small>Use somente para uma peça muito diferente.</small>
              </span>
            </label>
          </div>
          {logisticsMode === "profile" ? (
            <div className="profile-selector-box">
              <label>
                Tipo logístico da peça
                <select
                  value={logisticsProfileId}
                  onChange={(event) => {
                    setLogisticsProfileId(event.target.value);
                    setLogisticsProfileEdited(true);
                  }}
                >
                  {activeLogisticsProfiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedLogisticsProfile && (
                <div className="profile-summary">
                  <span>
                    <b>{selectedLogisticsProfile.unitWeightKg.toFixed(3)} kg</b>{" "}
                    por peça
                  </span>
                  <span>
                    <b>
                      {selectedLogisticsProfile.unitWidthCm} ×{" "}
                      {selectedLogisticsProfile.unitLengthCm} ×{" "}
                      {selectedLogisticsProfile.unitHeightCm} cm
                    </b>{" "}
                    dobrada
                  </span>
                  <a href="/admin/logistica">
                    Editar padrões de peso e embalagem
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="admin-form-grid four shipping-dimensions">
              <label>
                Peso por unidade (kg)
                <input
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(event) => setWeightKg(event.target.value)}
                />
              </label>
              <label>
                Largura dobrada (cm)
                <input
                  inputMode="numeric"
                  value={widthCm}
                  onChange={(event) => setWidthCm(event.target.value)}
                />
              </label>
              <label>
                Altura dobrada (cm)
                <input
                  inputMode="numeric"
                  value={heightCm}
                  onChange={(event) => setHeightCm(event.target.value)}
                />
              </label>
              <label>
                Comprimento dobrado (cm)
                <input
                  inputMode="numeric"
                  value={lengthCm}
                  onChange={(event) => setLengthCm(event.target.value)}
                />
              </label>
            </div>
          )}
          {logisticsPreview && (
            <div className="automatic-example">
              <b>Exemplo com 3 unidades:</b>
              <span>
                {logisticsPreview.volumes.length === 1
                  ? logisticsPreview.volumes[0].packageName
                  : `${logisticsPreview.volumes.length} volumes`}
              </span>
              <span>
                {logisticsPreview.quotedWeightKg.toFixed(3)} kg usados na
                cotação
              </span>
            </div>
          )}
          <p className="admin-field-note">
            O sistema multiplica o padrão pela quantidade, acrescenta a margem
            de segurança e escolhe a menor embalagem cadastrada que comporta o
            pedido.
          </p>
        </section>
      </div>

      <aside className="admin-form-side">
        <div className="admin-form-card sticky-card">
          <h2>Publicação</h2>
          <label className="admin-switch">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>
              <b>{active ? "Publicado" : "Rascunho"}</b>
              <small>
                {active ? "Visível na loja imediatamente" : "Somente no painel"}
              </small>
            </span>
          </label>
          <label className="admin-switch">
            <input
              type="checkbox"
              checked={featured}
              onChange={(event) => setFeatured(event.target.checked)}
            />
            <span>
              <b>Produto em destaque</b>
              <small>Aparece na página inicial</small>
            </span>
          </label>
          <div className="publish-summary">
            <span>
              Fotos <b>{images.length}</b>
            </span>
            <span>
              Variações <b>{variants.length}</b>
            </span>
            <span>
              Estoque total{" "}
              <b>{variants.reduce((sum, variant) => sum + variant.stock, 0)}</b>
            </span>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button
            className="button button-dark button-full"
            disabled={saving || uploading || Boolean(cropFile)}
          >
            {saving
              ? "Salvando…"
              : uploading
                ? "Enviando foto…"
                : cropFile
                  ? "Conclua o ajuste da foto"
                  : product
                    ? "Salvar alterações"
                    : "Publicar produto"}
          </button>
          <button
            className="admin-cancel-button"
            type="button"
            onClick={() => router.push("/admin")}
          >
            Cancelar
          </button>
        </div>
      </aside>

      {cropFile && (
        <ProductImageCropper
          file={cropFile}
          busy={uploading}
          onCancel={cancelCurrentCrop}
          onConfirm={uploadCroppedFile}
        />
      )}
    </form>
  );
}
