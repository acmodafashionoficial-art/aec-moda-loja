export function makeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function makeSku(...parts: string[]) {
  return parts
    .map((part) => makeSlug(part).replaceAll("-", "_").toUpperCase())
    .filter(Boolean)
    .join("-")
    .slice(0, 100);
}
