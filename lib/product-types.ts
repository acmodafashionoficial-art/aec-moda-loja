export const PRODUCT_CATEGORIES = [
  "Feminino",
  "Masculino",
  "Infantil",
  "Plus Size",
  "Acessórios",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_SUBCATEGORIES: Record<ProductCategory, readonly string[]> =
  {
    Feminino: [
      "Blusas",
      "Calças",
      "Vestidos",
      "Saias",
      "Shorts",
      "Conjuntos",
      "Macacões",
      "Bodies",
      "Outros",
    ],
    Masculino: [
      "Camisas",
      "Camisetas",
      "Calças",
      "Bermudas",
      "Conjuntos",
      "Jaquetas",
      "Outros",
    ],
    Infantil: [
      "Menina",
      "Menino",
      "Bebê",
      "Vestidos",
      "Conjuntos",
      "Blusas",
      "Calças",
      "Outros",
    ],
    "Plus Size": [
      "Blusas",
      "Calças",
      "Vestidos",
      "Saias",
      "Shorts",
      "Conjuntos",
      "Macacões",
      "Outros",
    ],
    Acessórios: [
      "Bolsas",
      "Cintos",
      "Bijuterias",
      "Bonés",
      "Carteiras",
      "Outros",
    ],
  };

export const GARMENT_SHAPES = [
  { value: "vestido", label: "Vestido" },
  { value: "blusa", label: "Blusa / cropped" },
  { value: "camisa", label: "Camisa" },
  { value: "camiseta", label: "Camiseta" },
  { value: "calca", label: "Calça" },
  { value: "short", label: "Short" },
  { value: "bermuda", label: "Bermuda" },
  { value: "saia", label: "Saia" },
  { value: "conjunto", label: "Conjunto" },
  { value: "macacao", label: "Macacão" },
  { value: "body", label: "Body" },
  { value: "jaqueta", label: "Jaqueta / casaco" },
  { value: "infantil", label: "Roupa infantil" },
  { value: "bolsa", label: "Bolsa" },
  { value: "acessorio", label: "Acessório" },
] as const;

export type GarmentShape = (typeof GARMENT_SHAPES)[number]["value"];

export const PRODUCT_COLOR_OPTIONS = [
  { name: "Preto", hex: "#161616" },
  { name: "Branco", hex: "#F6F3ED" },
  { name: "Off-white", hex: "#EDE8DD" },
  { name: "Creme", hex: "#EFE1C3" },
  { name: "Bege", hex: "#D8C3A5" },
  { name: "Areia", hex: "#CDBB9F" },
  { name: "Nude", hex: "#D7AB90" },
  { name: "Caramelo", hex: "#B77945" },
  { name: "Marrom", hex: "#6B4430" },
  { name: "Chocolate", hex: "#4A2C22" },
  { name: "Cinza claro", hex: "#C9C9C9" },
  { name: "Cinza", hex: "#8A8A8A" },
  { name: "Chumbo", hex: "#414141" },
  { name: "Rosa claro", hex: "#F3B8C5" },
  { name: "Rosa", hex: "#E66B91" },
  { name: "Pink", hex: "#E83E8C" },
  { name: "Rosa queimado", hex: "#B86F78" },
  { name: "Coral", hex: "#E97868" },
  { name: "Vermelho", hex: "#C92A2A" },
  { name: "Vinho", hex: "#7A1E37" },
  { name: "Bordô", hex: "#6D2034" },
  { name: "Laranja", hex: "#E8792E" },
  { name: "Terracota", hex: "#B85C3C" },
  { name: "Amarelo", hex: "#E4B942" },
  { name: "Mostarda", hex: "#B58A1B" },
  { name: "Verde menta", hex: "#9FD9C1" },
  { name: "Verde", hex: "#3E8C57" },
  { name: "Verde oliva", hex: "#6F7442" },
  { name: "Verde militar", hex: "#4E5B3C" },
  { name: "Azul bebê", hex: "#9CCDEB" },
  { name: "Azul", hex: "#3478C7" },
  { name: "Azul royal", hex: "#244BC1" },
  { name: "Azul marinho", hex: "#172C4A" },
  { name: "Turquesa", hex: "#35A7A0" },
  { name: "Lilás", hex: "#B69AD9" },
  { name: "Roxo", hex: "#70439A" },
  { name: "Jeans claro", hex: "#7899B6" },
  { name: "Jeans escuro", hex: "#36536C" },
  { name: "Dourado", hex: "#C6A15B" },
  { name: "Prata", hex: "#B7BCC5" },
  { name: "Cáqui", hex: "#A89A6D" },
] as const;

function plainText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isGarmentShape(value: unknown): value is GarmentShape {
  return GARMENT_SHAPES.some((item) => item.value === value);
}

export function defaultColorHex(colorName: string) {
  const exact = PRODUCT_COLOR_OPTIONS.find(
    (option) => plainText(option.name) === plainText(colorName),
  );
  if (exact) return exact.hex;

  const name = plainText(colorName);
  const partial = PRODUCT_COLOR_OPTIONS.find(
    (option) =>
      name.includes(plainText(option.name)) ||
      plainText(option.name).includes(name),
  );

  return partial?.hex || "#A46B45";
}

export function suggestGarmentShape(
  subcategory = "",
  name = "",
  category: ProductCategory = "Feminino",
): GarmentShape {
  const text = plainText(`${subcategory} ${name}`);

  if (text.includes("body")) return "body";
  if (text.includes("macacao") || text.includes("jardineira")) return "macacao";
  if (text.includes("vestido")) return "vestido";
  if (text.includes("conjunto") || text.includes("kit")) return "conjunto";
  if (
    text.includes("jaqueta") ||
    text.includes("casaco") ||
    text.includes("moletom")
  )
    return "jaqueta";
  if (text.includes("camiseta") || text.includes("t-shirt")) return "camiseta";
  if (text.includes("camisa")) return "camisa";
  if (text.includes("blusa") || text.includes("cropped")) return "blusa";
  if (text.includes("calca") || text.includes("jeans")) return "calca";
  if (text.includes("bermuda")) return "bermuda";
  if (text.includes("short")) return "short";
  if (text.includes("saia")) return "saia";
  if (text.includes("bolsa") || text.includes("carteira")) return "bolsa";
  if (
    text.includes("cinto") ||
    text.includes("bijuteria") ||
    text.includes("bone") ||
    text.includes("acessorio")
  ) {
    return "acessorio";
  }

  if (category === "Infantil") return "infantil";
  if (category === "Acessórios") return "acessorio";
  if (category === "Masculino") return "camiseta";
  return "blusa";
}

export type ProductVariant = {
  id?: string;
  sku: string;
  size: string;
  color: string;
  stock: number;
  physicalStock?: number;
  reservedStock?: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  subcategory?: string;
  garmentShape?: GarmentShape;
  colorHexes?: Record<string, string>;
  price: number;
  compareAtPrice?: number;
  description: string;
  image: string;
  imageThumbnail?: string;
  imageOriginal?: string;
  images: string[];
  sizes: string[];
  colors: string[];
  variants: ProductVariant[];
  featured: boolean;
  active: boolean;
  stock: number;
  weightKg?: number;
  widthCm?: number;
  heightCm?: number;
  lengthCm?: number;
  logisticsMode?: "profile" | "manual";
  logisticsProfileId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductInput = Omit<
  Product,
  "id" | "stock" | "createdAt" | "updatedAt"
> & {
  id?: string;
};
