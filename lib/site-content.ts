export type MainOffer = {
  enabled: boolean;
  eyebrow: string;
  title: string;
  description: string;
  old_price: string;
  promotional_price: string;
  price_note: string;
  button_text: string;
  button_link: string;
  domain_title: string;
  domain_description: string;
  benefits: string[];
};

export type HomeTexts = {
  brand_tagline: string;
  header_button: string;
  hero_eyebrow: string;
  hero_title: string;
  hero_highlight: string;
  hero_description: string;
  hero_primary_button: string;
  hero_secondary_button: string;
  portfolio_eyebrow: string;
  portfolio_title: string;
  portfolio_disclaimer: string;
  process_eyebrow: string;
  process_title: string;
  control_eyebrow: string;
  control_title: string;
  control_description: string;
  agenda_eyebrow: string;
  agenda_title: string;
  agenda_description: string;
  agenda_button: string;
  investment_eyebrow: string;
  investment_title: string;
  investment_description: string;
  final_cta_title: string;
  final_cta_description: string;
  final_cta_button: string;
  footer_description: string;
};

export const defaultMainOffer: MainOffer = {
  enabled: true,
  eyebrow: "Oferta especial por tempo limitado",
  title: "Seu site profissional completo",
  description:
    "Tenha uma presença profissional na internet, conquiste novos clientes e apresente sua empresa com mais credibilidade.",
  old_price: "R$ 5.000",
  promotional_price: "R$ 1.500",
  price_note: "Condições definidas conforme a proposta aprovada.",
  button_text: "SOLICITAR MINHA PROPOSTA",
  button_link: "/questionario",
  domain_title: "Domínio incluído durante o primeiro ano",
  domain_description:
    "O registro do domínio está incluído durante os primeiros 12 meses. Após esse período, a renovação anual será de responsabilidade do cliente, conforme o valor cobrado pela empresa registradora.",
  benefits: [
    "Site profissional e responsivo",
    "Visual personalizado para a empresa",
    "Domínio incluído durante o primeiro ano",
    "Configuração e publicação do site",
    "Botão direto para WhatsApp",
    "Formulário de contato",
    "Integração com redes sociais",
    "Otimização para celulares",
    "Configuração inicial para o Google",
    "Configuração inicial de segurança",
    "Suporte durante a implantação",
    "Orientação para utilização",
    "Estrutura preparada para crescimento",
  ],
};

export const defaultHomeTexts: HomeTexts = {
  brand_tagline: "Sites Profissionais e Sistemas Web",
  header_button: "QUERO MEU SITE 🚀",
  hero_eyebrow: "Agenda aberta para novos projetos",
  hero_title: "Sua empresa merece um site que",
  hero_highlight: "impressiona e vende!",
  hero_description:
    "Desenvolvemos sites modernos, rápidos e estratégicos que geram credibilidade, atraem clientes e aumentam suas oportunidades.",
  hero_primary_button: "SOLICITAR ORÇAMENTO →",
  hero_secondary_button: "VER PORTFÓLIO",
  portfolio_eyebrow: "Projetos que geram resultados",
  portfolio_title: "Sites desenvolvidos para diferentes segmentos",
  portfolio_disclaimer:
    "Projetos demonstrativos usados para apresentar possibilidades visuais.",
  process_eyebrow: "Como funciona",
  process_title: "Um processo simples e transparente",
  control_eyebrow: "Muito mais que um site",
  control_title:
    "Você recebe uma ferramenta completa para administrar, vender e crescer",
  control_description:
    "Cada projeto é planejado conforme a necessidade da empresa. Você poderá ter controle sobre o conteúdo, receber contatos, acompanhar pedidos e gerenciar as principais funcionalidades em um painel administrativo.",
  agenda_eyebrow: "Agenda de projetos",
  agenda_title: "Vagas disponíveis para novos projetos",
  agenda_description:
    "Para manter qualidade, organização e atenção em cada entrega.",
  agenda_button: "CONSULTAR DISPONIBILIDADE",
  investment_eyebrow: "Investimento",
  investment_title: "Quanto custa ter um site profissional?",
  investment_description:
    "Menos do que muitas empresas gastam em anúncios durante um único mês — com a diferença de que o site continua trabalhando pela sua empresa todos os dias.",
  final_cta_title: "Pronto para levar sua empresa para outro nível?",
  final_cta_description:
    "O questionário completo vai reunir todas as informações necessárias para preparar sua proposta personalizada.",
  final_cta_button: "INICIAR QUESTIONÁRIO 🚀",
  footer_description:
    "Projetos personalizados para empresas que querem crescer.",
};
