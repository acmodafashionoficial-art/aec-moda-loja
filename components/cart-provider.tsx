"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Product } from "@/lib/product-types";

export type CartItem = {
  productId: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  size: string;
  color: string;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (product: Product, size: string, color: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "aec-moda-cart-v1";

export function cartItemKey(item: Pick<CartItem, "productId" | "size" | "color">) {
  return `${item.productId}:${item.size}:${item.color}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let initialItems: CartItem[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) initialItems = JSON.parse(stored);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    queueMicrotask(() => {
      setItems(initialItems);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  function addItem(product: Product, size: string, color: string) {
    const next: CartItem = {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      price: product.price,
      size,
      color,
      quantity: 1,
    };

    setItems((current) => {
      const key = cartItemKey(next);
      const existing = current.find((item) => cartItemKey(item) === key);
      if (!existing) return [...current, next];
      return current.map((item) =>
        cartItemKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
  }

  function updateQuantity(key: string, quantity: number) {
    if (quantity < 1) return removeItem(key);
    setItems((current) =>
      current.map((item) => (cartItemKey(item) === key ? { ...item, quantity } : item)),
    );
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => cartItemKey(item) !== key));
  }

  const clearCart = useCallback(() => {
    setItems((current) => (current.length ? [] : current));
  }, []);

  const value: CartContextValue = {
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart precisa estar dentro de CartProvider");
  return context;
}
