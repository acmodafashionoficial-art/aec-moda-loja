"use client";

import Image from "next/image";
import Link from "next/link";
import { cartItemKey, useCart } from "@/components/cart-provider";
import { formatBRL } from "@/lib/currency";

export function CartList() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  if (!items.length) {
    return (
      <div className="empty-state">
        <h1>Sua sacola está vazia</h1>
        <p>Escolha suas peças favoritas e volte para finalizar a compra.</p>
        <Link href="/produtos" className="button button-dark">Ver produtos</Link>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <div className="cart-items">
        {items.map((item) => {
          const key = cartItemKey(item);
          return (
            <article className="cart-item" key={key}>
              <Image src={item.image} alt={item.name} width={120} height={150} />
              <div className="cart-item-info">
                <Link href={`/produto/${item.slug}`}><strong>{item.name}</strong></Link>
                <span>Tamanho: {item.size}</span>
                <span>Cor: {item.color}</span>
                <div className="quantity-control">
                  <button onClick={() => updateQuantity(key, item.quantity - 1)} aria-label="Diminuir quantidade">−</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQuantity(key, item.quantity + 1)} aria-label="Aumentar quantidade">+</button>
                </div>
                <button className="text-button" onClick={() => removeItem(key)}>Remover</button>
              </div>
              <strong>{formatBRL(item.price * item.quantity)}</strong>
            </article>
          );
        })}
      </div>
      <aside className="order-summary">
        <h2>Resumo</h2>
        <div><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div>
        <div><span>Entrega</span><span>Frete por CEP ou retirada grátis</span></div>
        <hr />
        <div className="summary-total"><span>Total parcial</span><strong>{formatBRL(subtotal)}</strong></div>
        <Link href="/finalizar" className="button button-dark button-full">Continuar para entrega</Link>
        <Link href="/produtos" className="continue-link">Continuar comprando</Link>
      </aside>
    </div>
  );
}
