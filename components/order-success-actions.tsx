"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";

export function OrderSuccessActions({
  code,
  clearCart: shouldClearCart = true,
  contactUrl,
  contactLabel = "Falar com a loja",
}: {
  code?: string;
  clearCart?: boolean;
  contactUrl?: string;
  contactLabel?: string;
}) {
  const { clearCart } = useCart();
  useEffect(() => { if (shouldClearCart) clearCart(); }, [clearCart, shouldClearCart]);
  return <div className="status-actions"><Link className="button button-dark" href="/acompanhar-pedido">Acompanhar pedido</Link>{contactUrl && <a className="button button-outline" href={contactUrl} target="_blank" rel="noopener noreferrer">{contactLabel}</a>}<Link className="button button-outline" href="/">Voltar à loja</Link>{code && <small>Guarde o código: <b>{code}</b></small>}</div>;
}
