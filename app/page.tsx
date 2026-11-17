import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/catalog";
import { getStoreSettings } from "@/lib/store-settings";
import { getPaymentSettings } from "@/lib/payment-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [products, settings, paymentSettings] = await Promise.all([getProducts(), getStoreSettings(), getPaymentSettings()]);
  const featured = products.filter((product) => product.featured).slice(0, 8);

  const categories = [
    {
      name: "Feminino",
      description: "Peças versáteis para todos os momentos",
      className: "category-feminino",
      imageUrl: settings.categoryFemininoImageUrl,
    },
    {
      name: "Masculino",
      description: "Estilo e praticidade para o dia a dia",
      className: "category-masculino",
      imageUrl: settings.categoryMasculinoImageUrl,
    },
    {
      name: "Infantil",
      description: "Conforto e beleza para os pequenos",
      className: "category-infantil",
      imageUrl: settings.categoryInfantilImageUrl,
    },
    {
      name: "Plus Size",
      description: "Moda que valoriza cada corpo",
      className: "category-plus",
      imageUrl: settings.categoryPlusImageUrl,
    },
  ];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow light">{settings.heroEyebrow}</span>
            <h1>{settings.heroTitle}</h1>
            <p>{settings.heroText}</p>
            <div className="hero-actions">
              <Link href="/produtos" className="button button-light">{settings.heroButtonText}</Link>
              {settings.pickupEnabled && <Link href="/entrega-retirada" className="text-link-light">Retirada em Jataúba →</Link>}
            </div>
          </div>
          <div className={`hero-art ${settings.heroImageUrl ? "hero-art-with-photo" : ""}`} aria-hidden="true">
            {settings.heroImageUrl ? (
              <div
                className="hero-main-photo"
                style={{ backgroundImage: `url("${settings.heroImageUrl}")` }}
              >
                <div className="hero-photo-seal">
                  <Image
                    src={settings.logoUrl || "/brand/aec-logo.svg"}
                    alt=""
                    fill
                    sizes="96px"
                    unoptimized
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="hero-card hero-card-one"><span>ESTILO</span></div>
                <div className="hero-card hero-card-two"><span>CONFORTO</span></div>
                <div className="hero-seal"><Image src={settings.logoUrl || "/brand/aec-logo.svg"} alt="" fill sizes="140px" unoptimized /></div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="benefits-strip">
        <div className="container benefits-grid four-benefits">
          <div><strong>Envio nacional</strong><span>Frete calculado pelo CEP</span></div>
          <div><strong>Retirada grátis</strong><span>No ponto físico em Jataúba</span></div>
          <div><strong>Pagamento seguro</strong><span>Pix e cartão em até {paymentSettings.maxInstallments}x via InfinitePay</span></div>
          <div><strong>Atendimento humano</strong><span>Suporte direto pelo WhatsApp</span></div>
        </div>
      </section>

      <section className="section container">
        <div className="section-heading"><div><span className="eyebrow">ESCOLHA SEU ESTILO</span><h2>Compre por categoria</h2></div></div>
        <div className="category-grid">
          {categories.map(({ name, description, className, imageUrl }) => (
            <Link
              key={name}
              href={`/produtos?categoria=${encodeURIComponent(name)}`}
              className={`category-card ${className}`}
              style={
                imageUrl
                  ? {
                      backgroundImage: `url("${imageUrl}")`,
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            >
              <span>{name}</span>
              <small>{description}</small>
              <b>Ver coleção →</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-soft"><div className="container"><div className="section-heading"><div><span className="eyebrow">SELEÇÃO A&C</span><h2>Destaques da semana</h2></div><Link href="/produtos" className="outline-link">Ver todos</Link></div>{featured.length ? <div className="product-grid">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><h2>Novidades chegando</h2><p>Os próximos destaques já estão sendo preparados.</p></div>}</div></section>

      <section className="section container story-grid">
        <div className="story-image"><Image src={featured[0]?.image || "/products/conjunto.svg"} alt="Coleção A&C Moda" fill sizes="50vw" /></div>
        <div className="story-copy"><span className="eyebrow">A&C MODA • JATAÚBA</span><h2>Da nossa loja para todo o Brasil.</h2><p>{settings.description} Compre online, receba em casa ou retire gratuitamente em nosso ponto físico.</p><Link href="/como-comprar" className="button button-dark">Veja como comprar</Link></div>
      </section>

      <section className="trust-section"><div className="container trust-grid"><div><b>01</b><h3>Preço conferido</h3><p>O servidor valida produto, variação, estoque e frete antes de abrir o pagamento.</p></div><div><b>02</b><h3>Pagamento protegido</h3><p>Pix e cartão em até {paymentSettings.maxInstallments}x são processados no ambiente seguro da InfinitePay e confirmados diretamente pela API.</p></div><div><b>03</b><h3>Pedido acompanhado</h3><p>A confirmação chega automaticamente e o envio terá rastreamento.</p></div></div></section>

      <section className="newsletter"><div className="container newsletter-inner"><div><span className="eyebrow light">ATENDIMENTO A&C</span><h2>Dúvidas sobre tamanho ou entrega?</h2></div>{settings.whatsappNumber ? <a className="button button-light" href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noreferrer">Falar no WhatsApp</a> : <Link className="button button-light" href="/como-comprar">Como comprar</Link>}</div></section>
    </>
  );
}
