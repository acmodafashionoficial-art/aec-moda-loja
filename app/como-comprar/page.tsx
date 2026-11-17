import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Como comprar" };

export default function Page() {
  return <div className="container page-space content-page">
    <span className="eyebrow">AJUDA</span>
    <h1>Como comprar na A&C Moda</h1>
    <div className="info-steps">
      <section><b>1</b><div><h2>Escolha a peça</h2><p>Abra o produto, selecione tamanho e cor e confira a disponibilidade em estoque.</p></div></section>
      <section><b>2</b><div><h2>Adicione à sacola</h2><p>Você pode continuar comprando, alterar quantidades ou remover itens antes de finalizar.</p></div></section>
      <section><b>3</b><div><h2>Escolha como receber</h2><p>Em Jataúba, escolha entrega local grátis ou retirada na loja. Para outras cidades, informe o CEP e compare os fretes.</p></div></section>
      <section><b>4</b><div><h2>Pague com segurança</h2><p>O site confere preços e estoque, registra o pedido e direciona ao checkout seguro da InfinitePay para Pix ou cartão.</p></div></section>
    </div>
    <Link href="/produtos" className="button button-dark">Começar a comprar</Link>
  </div>;
}
