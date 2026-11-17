export function onlyDigits(value: unknown, max = 20) {
  return String(value || "").replace(/\D/g, "").slice(0, max);
}

export function isValidCpf(value: unknown) {
  const cpf = onlyDigits(value, 11);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (base: string, factor: number) => {
    let sum = 0;
    for (const char of base) sum += Number(char) * factor--;
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(cpf.slice(0, 9), 10) === Number(cpf[9]) && digit(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function isValidCnpj(value: unknown) {
  const cnpj = onlyDigits(value, 14);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((total, char, index) => total + Number(char) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc(cnpj.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

export function safeHttpsUrl(value: unknown, max = 1000) {
  const text = String(value || "").trim().slice(0, max);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}

export function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function safeAssetUrl(value: unknown, max = 1000) {
  const text = String(value || "").trim().slice(0, max);
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\")) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "";
    if (url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co")) return url.toString();
    return "";
  } catch { return ""; }
}

export function safeSocialUrl(value: unknown, hostname: string, max = 500) {
  const text = String(value || "").trim().slice(0, max);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "";
    if (url.hostname === hostname || url.hostname.endsWith(`.${hostname}`)) return url.toString();
    return "";
  } catch { return ""; }
}
