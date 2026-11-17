import type { Metadata } from "next";
import { CartList } from "@/components/cart-list";

export const metadata: Metadata = { title: "Sacola" };

export default function CartPage() {
  return <div className="container page-space"><div className="page-title"><span className="eyebrow">SEU PEDIDO</span><h1>Sacola de compras</h1></div><CartList /></div>;
}
