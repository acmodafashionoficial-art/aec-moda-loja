import "server-only";

export type PostalAddress = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
};

type AddressResult = Partial<PostalAddress>;

function clean(value: unknown, max: number) {
  return String(value || "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max);
}

async function viaCep(postalCode: string): Promise<AddressResult | null> {
  const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  const data = await response.json();
  if (!response.ok || data.erro) return null;
  return {
    street: data.logradouro,
    neighborhood: data.bairro,
    city: data.localidade,
    state: data.uf,
    complement: data.complemento,
  };
}

async function brasilApi(postalCode: string): Promise<AddressResult | null> {
  const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${postalCode}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  const data = await response.json();
  if (!response.ok) return null;
  return {
    street: data.street,
    neighborhood: data.neighborhood,
    city: data.city,
    state: data.state,
  };
}

export function normalizeLocationName(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export async function lookupPostalCode(value: unknown): Promise<PostalAddress | null> {
  const postalCode = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (postalCode.length !== 8) return null;

  let address: AddressResult | null = null;
  try {
    address = await viaCep(postalCode);
  } catch {
    // Tenta o provedor alternativo abaixo.
  }
  if (!address) {
    try {
      address = await brasilApi(postalCode);
    } catch {
      // A ausência de resposta será tratada pelo chamador.
    }
  }
  if (!address?.city || !address?.state) return null;

  return {
    street: clean(address.street, 180),
    neighborhood: clean(address.neighborhood, 120),
    city: clean(address.city, 100),
    state: clean(address.state, 2).toUpperCase(),
    complement: clean(address.complement, 120),
  };
}
