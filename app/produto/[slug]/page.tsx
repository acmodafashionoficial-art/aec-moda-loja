import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPurchaseArea } from "@/components/product-purchase-area";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { formatBRL } from "@/lib/currency";
import { getProductBySlug, getProducts } from "@/lib/catalog";
import { getStoreSettings } from "@/lib/store-settings";
import { getPaymentSettings } from "@/lib/payment-settings";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  const [product, products, settings, paymentSettings] = await Promise.all([
    getProductBySlug(slug),
    getProducts(),
    getStoreSettings(),
    getPaymentSettings(),
  ]);

  if (!product) notFound();

  const related = products
    .filter(
      (item) => item.id !== product.id && item.category === product.category,
    )
    .slice(0, 4);

  const galleryImages = Array.from(
    new Set(
      [product.image, ...(product.images ?? [])].filter(
        (image): image is string =>
          typeof image === "string" && image.trim().length > 0,
      ),
    ),
  );

  return (
    <div className="container page-space">
      <div className="breadcrumbs">
        <Link href="/">Início</Link> / <Link href="/produtos">Produtos</Link> /{" "}
        {product.name}
      </div>

      <div className="product-detail">
        <ProductGallery images={galleryImages} productName={product.name} />

        <div className="product-detail-info">
          <span className="eyebrow">{product.category}</span>
          <h1>{product.name}</h1>

          <div className="detail-price">
            <strong>{formatBRL(product.price)}</strong>
            {product.compareAtPrice && (
              <s>{formatBRL(product.compareAtPrice)}</s>
            )}
          </div>

          <p className="installments">
            Pix ou cartão em até {paymentSettings.maxInstallments}x; condições
            exibidas no checkout.
          </p>

          <p className="product-description">{product.description}</p>

          <ProductPurchaseArea product={product} />

          <div className="detail-benefits">
            <div>
              <strong>Pagamento seguro</strong>
              <span>Pix e cartão processados pela InfinitePay</span>
            </div>

            <div>
              <strong>Frete pelo CEP</strong>
              <span>Compare opções antes do pagamento</span>
            </div>

            {settings.pickupEnabled && (
              <div>
                <strong>Retirada grátis</strong>
                <span>Disponível no ponto físico em Jataúba</span>
              </div>
            )}
          </div>

          <p className="product-security-link">
            <Link href="/seguranca">Entenda como protegemos sua compra →</Link>
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <h2>Você também pode gostar</h2>
          </div>

          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
