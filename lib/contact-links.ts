export function normalizeWhatsAppNumber(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 15);
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

export function buildWhatsAppUrl(number: unknown, message: string) {
  const normalized = normalizeWhatsAppNumber(number);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message.trim().slice(0, 1000))}`;
}

export function pickupCustomerMessage(publicCode: string, ready = false) {
  if (ready) {
    return `Olá! Meu pedido ${publicCode} está pronto para retirada. Gostaria de combinar o melhor dia e horário para buscar na loja.`;
  }
  return `Olá! Meu pedido é ${publicCode}. Escolhi retirada na loja e gostaria de combinar o dia e o horário. Vou aguardar a confirmação de que o pedido está pronto.`;
}

export function pickupStoreMessage(customerName: string, publicCode: string, ready = false) {
  if (ready) {
    return `Olá, ${customerName}! Seu pedido ${publicCode} está pronto para retirada na A&C Moda. Qual é o melhor dia e horário para você buscar?`;
  }
  return `Olá, ${customerName}! Recebemos o pedido ${publicCode} com retirada na loja. Avisaremos assim que estiver pronto para combinar o melhor dia e horário.`;
}

export function localDeliveryCustomerMessage(publicCode: string, outForDelivery = false) {
  if (outForDelivery) {
    return `Olá! Meu pedido ${publicCode} saiu para entrega em Jataúba. Estou disponível para receber.`;
  }
  return `Olá! Meu pedido é ${publicCode}. Escolhi entrega local grátis em Jataúba e gostaria de confirmar o endereço e o melhor horário para receber.`;
}

export function localDeliveryStoreMessage(customerName: string, publicCode: string, outForDelivery = false) {
  if (outForDelivery) {
    return `Olá, ${customerName}! Seu pedido ${publicCode} saiu para entrega em Jataúba. Por favor, fique disponível no endereço informado.`;
  }
  return `Olá, ${customerName}! Recebemos o pedido ${publicCode} com entrega local grátis em Jataúba. Vamos confirmar o endereço e combinar a entrega em horário comercial.`;
}
