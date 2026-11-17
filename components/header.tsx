"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import type { StoreSettings } from "@/lib/store-settings";

export function Header({ settings }: { settings: StoreSettings }) {
  const { count } = useCart();

  return (
    <>
      <div className="announcement">{settings.announcement}</div>
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" className="brand brand-image" aria-label={`${settings.storeName} — página inicial`}>
            <Image src={settings.logoUrl || "/brand/aec-logo.svg"} alt={settings.storeName} width={190} height={70} priority unoptimized />
          </Link>
          <nav className="main-nav" aria-label="Navegação principal">
            <Link href="/produtos">Novidades</Link>
            <Link href="/produtos?categoria=Feminino">Feminino</Link>
            <Link href="/produtos?categoria=Masculino">Masculino</Link>
            <Link href="/produtos?categoria=Infantil">Infantil</Link>
            <Link href="/produtos?categoria=Plus%20Size">Plus Size</Link>
          </nav>
          <div className="header-actions">
            <Link href="/acompanhar-pedido">Pedido</Link>
            <Link href="/entrega-retirada">Entrega</Link>
            <Link href="/carrinho" className="cart-link">Sacola <span>{count}</span></Link>
          </div>
        </div>
      </header>
    </>
  );
}
