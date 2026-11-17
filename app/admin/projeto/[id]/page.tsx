"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type ProjectStatus =
  | "new"
  | "under_review"
  | "awaiting_client"
  | "proposal_sent"
  | "awaiting_payment"
  | "confirmed"
  | "in_development"
  | "completed"
  | "cancelled";

type ReservationStatus =
  | "not_reserved"
  | "temporarily_reserved"
  | "confirmed"
  | "released"
  | "cancelled";

type Client = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  company_name: string | null;
  city: string | null;
  state: string | null;
  instagram: string | null;
  current_site: string | null;
};

type ScheduleSlot = {
  id: string;
  start_date: string;
  total_slots: number;
  reserved_slots: number;
  confirmed_slots: number;
  status: "available" | "blocked" | "full";
};

type Project = {
  id: string;
  protocol: string;
  status: ProjectStatus;
  reservation_status: ReservationStatus;
  reservation_expires_at: string | null;
  segment: string | null;
  business_description: string | null;
  target_audience: string | null;
  project_type: string | null;
  objectives: string[] | null;
  visual_style: string | null;
  desired_colors: string | null;
  has_logo: string | null;
  has_texts: string | null;
  has_images: string | null;
  visual_references: string | null;
  common_features: string[] | null;
  store_features: string[] | null;
  product_count: string | null;
  product_variations: string[] | null;
  delivery_options: string[] | null;
  preferred_domain: string | null;
  domain_status:
    | "not_checked"
    | "available"
    | "unavailable"
    | "registered"
    | "cancelled";
  observations: string | null;
  extra_answers: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  clients: Client | Client[] | null;
  schedule_slots: ScheduleSlot | ScheduleSlot[] | null;
};

type AiPackage = {
  id: string;
  briefing_id: string;
  prompt_text: string;
  markdown_text: string;
  json_data: Record<string, unknown>;
  structure_text: string | null;
  checklist_text: string | null;
  created_at: string;
  updated_at: string;
};

type BriefingFile = {
  id: string;
  briefing_id: string;
  category:
    | "logo"
    | "brandManual"
    | "companyImages"
    | "productImages"
    | "texts"
    | "additional";
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: "new", label: "Novo" },
  { value: "under_review", label: "Em análise" },
  { value: "awaiting_client", label: "Aguardando cliente" },
  { value: "proposal_sent", label: "Proposta enviada" },
  { value: "awaiting_payment", label: "Aguardando pagamento" },
  { value: "confirmed", label: "Confirmado" },
  { value: "in_development", label: "Em desenvolvimento" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const domainStatusLabels: Record<Project["domain_status"], string> = {
  not_checked: "Não verificado",
  available: "Disponível",
  unavailable: "Indisponível",
  registered: "Registrado",
  cancelled: "Cancelado",
};

const reservationStatusLabels: Record<ReservationStatus, string> = {
  not_reserved: "Não reservada",
  temporarily_reserved: "Reserva temporária",
  confirmed: "Confirmada",
  released: "Liberada",
  cancelled: "Cancelada",
};

const fileCategoryLabels: Record<BriefingFile["category"], string> = {
  logo: "Logotipo",
  brandManual: "Manual da marca",
  companyImages: "Fotos da empresa e serviços",
  productImages: "Fotos dos produtos",
  texts: "Textos e informações",
  additional: "Outros materiais",
};

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatScheduleDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function normalizeWhatsApp(value: string) {
  const numbers = value.replace(/\D/g, "");
  if (!numbers) return "";
  return numbers.startsWith("55") ? numbers : `55${numbers}`;
}

function textList(values: string[] | null) {
  return values?.filter(Boolean) ?? [];
}

function formatFileSize(size: number | null) {
  if (!size || size <= 0) return "Tamanho não informado";
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: BriefingFile) {
  return file.mime_type?.startsWith("image/") ?? false;
}

function sanitizeStorageFileName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  const extension =
    extensionIndex >= 0
      ? fileName.slice(extensionIndex).toLowerCase()
      : "";

  const baseName =
    extensionIndex >= 0
      ? fileName.slice(0, extensionIndex)
      : fileName;

  const safeBaseName = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${safeBaseName || "arquivo"}${extension}`;
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], {
    type: `${mimeType};charset=utf-8`,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function getSuggestedPages(project: Project) {
  const projectType = project.project_type?.toLowerCase() || "";
  const features = [
    ...textList(project.common_features),
    ...textList(project.store_features),
  ].map((item) => item.toLowerCase());

  const pages = new Set([
    "Página inicial",
    "Sobre a empresa",
    "Contato",
  ]);

  if (
    projectType.includes("loja") ||
    projectType.includes("catálogo") ||
    features.some((item) => item.includes("produto"))
  ) {
    pages.add("Produtos");
    pages.add("Categorias");
    pages.add("Página do produto");
  }

  if (
    projectType.includes("loja") ||
    features.some((item) => item.includes("carrinho"))
  ) {
    pages.add("Carrinho");
    pages.add("Finalização do pedido");
    pages.add("Meus pedidos");
  }

  if (
    features.some((item) => item.includes("login")) ||
    features.some((item) => item.includes("área do cliente"))
  ) {
    pages.add("Login");
    pages.add("Área do cliente");
  }

  if (features.some((item) => item.includes("agendamento"))) {
    pages.add("Agendamento");
  }

  if (
    features.some((item) => item.includes("blog")) ||
    projectType.includes("blog") ||
    projectType.includes("portal")
  ) {
    pages.add("Blog");
    pages.add("Página da publicação");
  }

  if (
    projectType.includes("institucional") ||
    features.some((item) => item.includes("serviço"))
  ) {
    pages.add("Serviços");
  }

  if (features.some((item) => item.includes("portfólio"))) {
    pages.add("Portfólio");
  }

  if (projectType.includes("landing page")) {
    return [
      "Landing page única",
      "Seção principal",
      "Benefícios",
      "Prova social",
      "Formulário ou WhatsApp",
      "Perguntas frequentes",
    ];
  }

  return [...pages];
}

function getSuggestedAdminModules(project: Project) {
  const features = [
    ...textList(project.common_features),
    ...textList(project.store_features),
  ].map((item) => item.toLowerCase());

  const modules = new Set([
    "Dashboard",
    "Configurações gerais",
    "Conteúdo do site",
  ]);

  if (features.some((item) => item.includes("produto"))) {
    modules.add("Produtos");
    modules.add("Categorias");
  }

  if (features.some((item) => item.includes("estoque"))) {
    modules.add("Estoque e variações");
  }

  if (
    features.some((item) => item.includes("carrinho")) ||
    features.some((item) => item.includes("pagamento"))
  ) {
    modules.add("Pedidos");
    modules.add("Pagamentos");
  }

  if (features.some((item) => item.includes("cliente"))) {
    modules.add("Clientes");
  }

  if (features.some((item) => item.includes("agendamento"))) {
    modules.add("Agenda");
  }

  if (features.some((item) => item.includes("blog"))) {
    modules.add("Publicações");
  }

  if (features.some((item) => item.includes("relatório"))) {
    modules.add("Relatórios");
  }

  return [...modules];
}

function buildFolderStructure(project: Project) {
  const pages = getSuggestedPages(project);
  const adminModules = getSuggestedAdminModules(project);

  const pageFolders = pages
    .map((page) => `│   ├── ${sanitizeFileName(page).toLowerCase()}`)
    .join("\n");

  const adminFolders = adminModules
    .map((module) => `│       ├── ${sanitizeFileName(module).toLowerCase()}`)
    .join("\n");

  return `app
├── (site)
${pageFolders}
├── admin
│   ├── login
│   └── painel
${adminFolders}
├── api
├── layout.tsx
└── page.tsx

components
├── ui
├── site
├── admin
└── forms

lib
├── supabase
├── validations
├── permissions
└── utils

public
├── images
└── uploads

supabase
├── migrations
├── policies
└── functions`;
}

function buildChecklist(project: Project) {
  const pages = getSuggestedPages(project);
  const modules = getSuggestedAdminModules(project);

  return [
    "☐ Confirmar escopo final com o cliente",
    "☐ Criar ou revisar identidade visual",
    "☐ Organizar conteúdo, textos e imagens",
    "☐ Configurar Next.js, TypeScript e Tailwind CSS",
    "☐ Configurar Supabase e variáveis de ambiente",
    "☐ Criar autenticação e permissões RLS",
    ...pages.map((page) => `☐ Criar página: ${page}`),
    ...modules.map((module) => `☐ Criar módulo administrativo: ${module}`),
    "☐ Implementar estados de carregamento e mensagens de erro",
    "☐ Testar responsividade em celular e computador",
    "☐ Testar formulários e integrações",
    "☐ Executar npm run build",
    "☐ Corrigir todos os erros antes de publicar",
    "☐ Publicar ambiente de homologação",
    "☐ Solicitar aprovação do cliente",
    "☐ Publicar versão final",
  ].join("\n");
}

export default function AdminProjectDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [aiPackage, setAiPackage] = useState<AiPackage | null>(null);
  const [isSavingAiPackage, setIsSavingAiPackage] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [briefingFiles, setBriefingFiles] = useState<BriefingFile[]>([]);
  const [fileActionId, setFileActionId] = useState<string | null>(null);
  const [adminUploadCategory, setAdminUploadCategory] =
    useState<BriefingFile["category"]>("additional");
  const [adminUploadFiles, setAdminUploadFiles] = useState<File[]>([]);
  const [isUploadingAdminFiles, setIsUploadingAdminFiles] =
    useState(false);
  const [adminUploadProgress, setAdminUploadProgress] = useState(0);

  const loadProject = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/admin/login");
        return;
      }

      const { data: isAdmin, error: adminError } =
        await supabase.rpc("is_admin");

      if (adminError || isAdmin !== true) {
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      const { data, error } = await supabase
        .from("briefings")
        .select(`
          id,
          protocol,
          status,
          reservation_status,
          reservation_expires_at,
          segment,
          business_description,
          target_audience,
          project_type,
          objectives,
          visual_style,
          desired_colors,
          has_logo,
          has_texts,
          has_images,
          visual_references,
          common_features,
          store_features,
          product_count,
          product_variations,
          delivery_options,
          preferred_domain,
          domain_status,
          observations,
          extra_answers,
          created_at,
          updated_at,
          clients (
            id,
            name,
            whatsapp,
            email,
            company_name,
            city,
            state,
            instagram,
            current_site
          ),
          schedule_slots (
            id,
            start_date,
            total_slots,
            reserved_slots,
            confirmed_slots,
            status
          )
        `)
        .eq("id", projectId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setProject(data as Project);

      const { data: packageData, error: packageError } = await supabase
        .from("project_ai_packages")
        .select(`
          id,
          briefing_id,
          prompt_text,
          markdown_text,
          json_data,
          structure_text,
          checklist_text,
          created_at,
          updated_at
        `)
        .eq("briefing_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (packageError) {
        throw new Error(packageError.message);
      }

      setAiPackage((packageData as AiPackage | null) || null);

      const { data: filesData, error: filesError } = await supabase
        .from("briefing_files")
        .select(`
          id,
          briefing_id,
          category,
          file_name,
          storage_path,
          mime_type,
          size_bytes,
          created_at
        `)
        .eq("briefing_id", projectId)
        .order("created_at", { ascending: true });

      if (filesError) {
        throw new Error(filesError.message);
      }

      setBriefingFiles((filesData || []) as BriefingFile[]);
    } catch (error) {
      console.error("Erro ao carregar projeto:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o projeto.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  async function updateStatus(status: ProjectStatus) {
    if (!project) return;

    setIsUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    const previousStatus = project.status;
    setProject({ ...project, status });

    const { error } = await supabase
      .from("briefings")
      .update({ status })
      .eq("id", project.id);

    if (error) {
      setProject({ ...project, status: previousStatus });
      setErrorMessage(error.message);
    } else {
      setSuccessMessage("Status atualizado com sucesso.");
      window.setTimeout(() => setSuccessMessage(""), 3000);
    }

    setIsUpdating(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020914] text-white">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
          <p className="mt-5 font-bold text-slate-400">
            Carregando projeto...
          </p>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020914] p-6 text-white">
        <div className="w-full max-w-xl rounded-3xl border border-red-500/30 bg-[#06101d] p-8 text-center">
          <h1 className="text-2xl font-black">Projeto não encontrado</h1>
          <p className="mt-3 text-slate-400">
            {errorMessage || "Não foi possível localizar esse projeto."}
          </p>
          <Link
            href="/admin/projetos"
            className="mt-7 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-black"
          >
            VOLTAR AOS PROJETOS
          </Link>
        </div>
      </main>
    );
  }

  const client = firstRelation(project.clients);
  const scheduleSlot = firstRelation(project.schedule_slots);
  const whatsappNumber = client
    ? normalizeWhatsApp(client.whatsapp)
    : "";

  const generatedPackage = (() => {
    if (!project) return null;

    const companyName =
      client?.company_name || client?.name || "Empresa não informada";

    const pages = getSuggestedPages(project);
    const adminModules = getSuggestedAdminModules(project);
    const structure = buildFolderStructure(project);
    const checklist = buildChecklist(project);

    const jsonData = {
      generatedAt: new Date().toISOString(),
      standard: "ALISSON DEV",
      protocol: project.protocol,
      briefingId: project.id,
      client: {
        name: client?.name || null,
        companyName: client?.company_name || null,
        whatsapp: client?.whatsapp || null,
        email: client?.email || null,
        city: client?.city || null,
        state: client?.state || null,
        instagram: client?.instagram || null,
        currentSite: client?.current_site || null,
      },
      project: {
        type: project.project_type,
        segment: project.segment,
        businessDescription: project.business_description,
        targetAudience: project.target_audience,
        objectives: textList(project.objectives),
        visualStyle: project.visual_style,
        desiredColors: project.desired_colors,
        visualReferences: project.visual_references,
        commonFeatures: textList(project.common_features),
        storeFeatures: textList(project.store_features),
        productCount: project.product_count,
        productVariations: textList(project.product_variations),
        deliveryOptions: textList(project.delivery_options),
        preferredDomain: project.preferred_domain,
        observations: project.observations,
        preferredStartDate: scheduleSlot?.start_date || null,
      },
      suggestedArchitecture: {
        pages,
        adminModules,
        technologies: [
          "Next.js 16",
          "TypeScript",
          "Tailwind CSS",
          "Supabase",
          "App Router",
        ],
      },
      developmentRules: [
        "Continuar o projeto existente; não recriar do zero.",
        "Preservar tudo que já funciona.",
        "Alterar somente os arquivos necessários.",
        "Não apagar ou substituir pastas inteiras.",
        "Não solicitar .env.local, senhas, tokens ou chaves secretas.",
        "Criar SQL separado para alterações no Supabase.",
        "Usar autenticação, RLS e RPC quando apropriado.",
        "Executar npm run build antes da entrega.",
        "Informar os arquivos criados e alterados.",
        "Trabalhar um módulo por vez.",
      ],
    };

    const prompt = `Você é o agente de desenvolvimento responsável pelo projeto ${project.protocol}.

OBJETIVO
Continuar e desenvolver este projeto seguindo o padrão técnico da ALISSON DEV. Não recrie o projeto do zero.

DADOS DO CLIENTE
- Empresa: ${companyName}
- Responsável: ${client?.name || "Não informado"}
- WhatsApp: ${client?.whatsapp || "Não informado"}
- E-mail: ${client?.email || "Não informado"}
- Local: ${[client?.city, client?.state].filter(Boolean).join(" - ") || "Não informado"}

DADOS DO PROJETO
- Tipo: ${project.project_type || "Não informado"}
- Segmento: ${project.segment || "Não informado"}
- Descrição do negócio: ${project.business_description || "Não informado"}
- Público-alvo: ${project.target_audience || "Não informado"}
- Estilo visual: ${project.visual_style || "Não informado"}
- Cores: ${project.desired_colors || "Não informado"}
- Domínio preferido: ${project.preferred_domain || "Não informado"}
- Data preferida: ${
      scheduleSlot?.start_date
        ? formatScheduleDate(scheduleSlot.start_date)
        : "Não informada"
    }

OBJETIVOS
${textList(project.objectives).map((item) => `- ${item}`).join("\n") || "- Não informados"}

FUNCIONALIDADES GERAIS
${textList(project.common_features).map((item) => `- ${item}`).join("\n") || "- Não informadas"}

RECURSOS DE LOJA
${textList(project.store_features).map((item) => `- ${item}`).join("\n") || "- Não informados"}

PRODUTOS E ENTREGA
- Quantidade inicial: ${project.product_count || "Não informada"}
- Variações: ${textList(project.product_variations).join(", ") || "Não informadas"}
- Entrega: ${textList(project.delivery_options).join(", ") || "Não informada"}

PÁGINAS SUGERIDAS
${pages.map((page) => `- ${page}`).join("\n")}

PAINEL ADMINISTRATIVO SUGERIDO
${adminModules.map((module) => `- ${module}`).join("\n")}

PADRÃO TÉCNICO OBRIGATÓRIO
- Next.js 16
- TypeScript
- Tailwind CSS
- Supabase
- App Router
- Autenticação protegida
- Row Level Security
- Funções RPC quando uma operação precisar ser segura e transacional
- Interface responsiva
- Visual profissional e consistente

REGRAS DE TRABALHO
1. Continue o projeto existente e preserve tudo que já funciona.
2. Não recrie o projeto do zero.
3. Não apague nem substitua pastas inteiras.
4. Altere somente os arquivos necessários.
5. Não solicite .env.local, tokens, senhas ou chaves secretas.
6. Para mudanças no Supabase, entregue o SQL em arquivo separado.
7. Trabalhe um módulo por vez.
8. Explique claramente onde cada arquivo deve ser colocado.
9. Execute npm run build antes de considerar a etapa concluída.
10. Informe todos os arquivos criados e modificados.
11. Não invente regras de pagamento, frete, estoque ou negócio que não estejam no briefing.
12. Em caso de informação ausente, use uma solução neutra e marque o ponto para confirmação.

ESTRUTURA SUGERIDA
${structure}

OBSERVAÇÕES DO CLIENTE
${project.observations || "Nenhuma observação adicional."}

Comece analisando o projeto atual e proponha o próximo módulo mais importante. Não altere nada às cegas.`;

    const markdown = `# Pacote para IA — ${project.protocol}

## Identificação

- **Empresa:** ${companyName}
- **Responsável:** ${client?.name || "Não informado"}
- **Tipo de projeto:** ${project.project_type || "Não informado"}
- **Segmento:** ${project.segment || "Não informado"}
- **Domínio:** ${project.preferred_domain || "Não informado"}
- **Data preferida:** ${
      scheduleSlot?.start_date
        ? formatScheduleDate(scheduleSlot.start_date)
        : "Não informada"
    }

## Descrição do negócio

${project.business_description || "Não informado"}

## Público-alvo

${project.target_audience || "Não informado"}

## Identidade visual

- **Estilo:** ${project.visual_style || "Não informado"}
- **Cores:** ${project.desired_colors || "Não informado"}
- **Possui logotipo:** ${project.has_logo || "Não informado"}
- **Possui textos:** ${project.has_texts || "Não informado"}
- **Possui imagens:** ${project.has_images || "Não informado"}

## Objetivos

${textList(project.objectives).map((item) => `- ${item}`).join("\n") || "- Não informados"}

## Funcionalidades gerais

${textList(project.common_features).map((item) => `- ${item}`).join("\n") || "- Não informadas"}

## Recursos de loja

${textList(project.store_features).map((item) => `- ${item}`).join("\n") || "- Não informados"}

## Produtos e entrega

- **Quantidade de produtos:** ${project.product_count || "Não informada"}
- **Variações:** ${textList(project.product_variations).join(", ") || "Não informadas"}
- **Entrega:** ${textList(project.delivery_options).join(", ") || "Não informada"}

## Páginas sugeridas

${pages.map((page) => `- ${page}`).join("\n")}

## Painel administrativo sugerido

${adminModules.map((module) => `- ${module}`).join("\n")}

## Tecnologias obrigatórias

- Next.js 16
- TypeScript
- Tailwind CSS
- Supabase
- App Router
- Autenticação protegida
- RLS
- RPC para operações críticas

## Estrutura sugerida

\`\`\`text
${structure}
\`\`\`

## Checklist

${checklist}

## Regras para a IA

1. Continuar o projeto existente.
2. Não recriar do zero.
3. Preservar o que já funciona.
4. Alterar somente arquivos necessários.
5. Não apagar pastas inteiras.
6. Não solicitar segredos.
7. Entregar SQL separado para Supabase.
8. Executar \`npm run build\`.
9. Informar arquivos criados e modificados.
10. Trabalhar um módulo por vez.

## Prompt completo

\`\`\`text
${prompt}
\`\`\`
`;

    return {
      prompt,
      markdown,
      jsonData,
      structure,
      checklist,
    };
  })();

  async function copyToClipboard(
    content: string,
    label: string,
  ) {
    try {
      await navigator.clipboard.writeText(content);
      setCopyMessage(`${label} copiado com sucesso.`);
      window.setTimeout(() => setCopyMessage(""), 3000);
    } catch {
      setErrorMessage(
        "Não foi possível copiar automaticamente. Tente baixar o arquivo.",
      );
    }
  }

  async function uploadAdminFiles() {
    if (!project || adminUploadFiles.length === 0) {
      setErrorMessage("Selecione pelo menos um arquivo.");
      return;
    }

    const oversized = adminUploadFiles.find(
      (file) => file.size > 50 * 1024 * 1024,
    );

    if (oversized) {
      setErrorMessage(
        `O arquivo “${oversized.name}” ultrapassa o limite de 50 MB.`,
      );
      return;
    }

    setIsUploadingAdminFiles(true);
    setAdminUploadProgress(0);
    setErrorMessage("");
    setSuccessMessage("");

    const uploadedFiles: BriefingFile[] = [];
    const failedNames: string[] = [];

    for (
      let index = 0;
      index < adminUploadFiles.length;
      index += 1
    ) {
      const file = adminUploadFiles[index];
      const storagePath =
        `briefings/${project.id}/${adminUploadCategory}/` +
        `${Date.now()}-${crypto.randomUUID()}-` +
        sanitizeStorageFileName(file.name);

      const { error: uploadError } = await supabase.storage
        .from("briefing-files")
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        failedNames.push(file.name);
        setAdminUploadProgress(
          Math.round(
            ((index + 1) / adminUploadFiles.length) * 100,
          ),
        );
        continue;
      }

      const { data: registeredId, error: registerError } =
        await supabase.rpc("register_briefing_file", {
          p_briefing_id: project.id,
          p_category: adminUploadCategory,
          p_file_name: file.name,
          p_storage_path: storagePath,
          p_mime_type:
            file.type || "application/octet-stream",
          p_size_bytes: file.size,
        });

      if (registerError || !registeredId) {
        failedNames.push(file.name);

        await supabase.storage
          .from("briefing-files")
          .remove([storagePath]);
      } else {
        uploadedFiles.push({
          id: registeredId as string,
          briefing_id: project.id,
          category: adminUploadCategory,
          file_name: file.name,
          storage_path: storagePath,
          mime_type:
            file.type || "application/octet-stream",
          size_bytes: file.size,
          created_at: new Date().toISOString(),
        });
      }

      setAdminUploadProgress(
        Math.round(
          ((index + 1) / adminUploadFiles.length) * 100,
        ),
      );
    }

    if (uploadedFiles.length > 0) {
      setBriefingFiles((current) => [
        ...current,
        ...uploadedFiles,
      ]);

      setSuccessMessage(
        `${uploadedFiles.length} arquivo(s) adicionado(s) ao projeto.`,
      );
    }

    if (failedNames.length > 0) {
      setErrorMessage(
        `Não foi possível enviar: ${failedNames.join(", ")}.`,
      );
    }

    setAdminUploadFiles([]);
    setIsUploadingAdminFiles(false);

    window.setTimeout(() => setSuccessMessage(""), 3000);
  }

  async function openFile(file: BriefingFile) {
    setFileActionId(file.id);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.storage
        .from("briefing-files")
        .createSignedUrl(file.storage_path, 60 * 10);

      if (error || !data?.signedUrl) {
        throw new Error(
          error?.message || "Não foi possível abrir o arquivo.",
        );
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o arquivo.",
      );
    } finally {
      setFileActionId(null);
    }
  }

  async function downloadProjectFile(file: BriefingFile) {
    setFileActionId(file.id);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.storage
        .from("briefing-files")
        .download(file.storage_path);

      if (error || !data) {
        throw new Error(
          error?.message || "Não foi possível baixar o arquivo.",
        );
      }

      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = file.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível baixar o arquivo.",
      );
    } finally {
      setFileActionId(null);
    }
  }

  async function deleteProjectFile(file: BriefingFile) {
    const confirmed = window.confirm(
      `Deseja realmente excluir o arquivo “${file.file_name}”?`,
    );

    if (!confirmed) return;

    setFileActionId(file.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error: storageError } = await supabase.storage
        .from("briefing-files")
        .remove([file.storage_path]);

      if (storageError) {
        throw new Error(storageError.message);
      }

      const { error: databaseError } = await supabase
        .from("briefing_files")
        .delete()
        .eq("id", file.id);

      if (databaseError) {
        throw new Error(databaseError.message);
      }

      setBriefingFiles((current) =>
        current.filter((item) => item.id !== file.id),
      );

      setSuccessMessage("Arquivo excluído com sucesso.");
      window.setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o arquivo.",
      );
    } finally {
      setFileActionId(null);
    }
  }

  async function saveAiPackage() {
    if (!project || !generatedPackage) return;

    setIsSavingAiPackage(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/admin/login");
        return;
      }

      const payload = {
        briefing_id: project.id,
        prompt_text: generatedPackage.prompt,
        markdown_text: generatedPackage.markdown,
        json_data: generatedPackage.jsonData,
        structure_text: generatedPackage.structure,
        checklist_text: generatedPackage.checklist,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("project_ai_packages")
        .insert(payload)
        .select(`
          id,
          briefing_id,
          prompt_text,
          markdown_text,
          json_data,
          structure_text,
          checklist_text,
          created_at,
          updated_at
        `)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setAiPackage(data as AiPackage);
      setSuccessMessage("Pacote para IA salvo com sucesso.");
      window.setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o pacote para IA.",
      );
    } finally {
      setIsSavingAiPackage(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <header className="border-b border-white/10 bg-[#06101d]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-800 text-xl font-black">
              A
            </span>
            <div>
              <p className="font-black">
                ALISSON <span className="text-blue-500">DEV</span>
              </p>
              <p className="text-xs text-slate-500">
                Detalhes do projeto
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-red-500/30 px-5 py-3 text-sm font-black text-red-400 transition hover:bg-red-500/10"
          >
            SAIR
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <Link
          href="/admin/projetos"
          className="text-sm font-bold text-blue-400 transition hover:text-blue-300"
        >
          ← Voltar aos projetos
        </Link>

        <section className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-[#06101d]">
          <div className="grid gap-6 border-b border-white/10 p-6 lg:grid-cols-[1fr_320px] lg:items-center sm:p-8">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-400">
                {project.protocol}
              </p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">
                {client?.company_name ||
                  client?.name ||
                  "Projeto sem empresa"}
              </h1>
              <p className="mt-4 text-slate-400">
                Recebido em {formatDate(project.created_at)}
              </p>
            </div>

            <label className="block">
              <span className="text-sm font-bold text-slate-300">
                Status do projeto
              </span>
              <select
                value={project.status}
                disabled={isUpdating}
                onChange={(event) =>
                  updateStatus(event.target.value as ProjectStatus)
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#020914] px-4 py-3 font-bold text-white outline-none focus:border-blue-500 disabled:opacity-60"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(errorMessage || successMessage) && (
            <div className="px-6 pt-6 sm:px-8">
              {errorMessage && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 font-bold text-red-300">
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 font-bold text-green-300">
                  {successMessage}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 p-6 lg:grid-cols-3 sm:p-8">
            <InfoCard title="Cliente">
              <InfoLine label="Nome" value={client?.name} />
              <InfoLine label="Empresa" value={client?.company_name} />
              <InfoLine label="WhatsApp" value={client?.whatsapp} />
              <InfoLine label="E-mail" value={client?.email} />
              <InfoLine
                label="Local"
                value={[client?.city, client?.state]
                  .filter(Boolean)
                  .join(" - ")}
              />

              <div className="mt-5 flex flex-wrap gap-3">
                {whatsappNumber && (
                  <a
                    href={`https://wa.me/${whatsappNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black transition hover:bg-green-500"
                  >
                    WHATSAPP
                  </a>
                )}

                {client?.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="rounded-xl border border-blue-500/40 px-4 py-3 text-sm font-black text-blue-300"
                  >
                    E-MAIL
                  </a>
                )}
              </div>
            </InfoCard>

            <InfoCard title="Projeto">
              <InfoLine label="Tipo" value={project.project_type} />
              <InfoLine label="Segmento" value={project.segment} />
              <InfoLine label="Estilo visual" value={project.visual_style} />
              <InfoLine label="Cores desejadas" value={project.desired_colors} />
              <InfoLine label="Quantidade de produtos" value={project.product_count} />
            </InfoCard>

            <InfoCard title="Agenda e domínio">
              <InfoLine
                label="Data preferida"
                value={
                  scheduleSlot?.start_date
                    ? formatScheduleDate(scheduleSlot.start_date)
                    : ""
                }
              />
              <InfoLine
                label="Reserva"
                value={reservationStatusLabels[project.reservation_status]}
              />
              <InfoLine label="Domínio preferido" value={project.preferred_domain} />
              <InfoLine
                label="Situação do domínio"
                value={domainStatusLabels[project.domain_status]}
              />
            </InfoCard>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <DetailSection title="Empresa e público">
            <TextBlock label="Descrição do negócio" value={project.business_description} />
            <TextBlock label="Público-alvo" value={project.target_audience} />
          </DetailSection>

          <DetailSection title="Identidade visual">
            <InfoLine label="Possui logotipo?" value={project.has_logo} />
            <InfoLine label="Possui textos?" value={project.has_texts} />
            <InfoLine label="Possui imagens?" value={project.has_images} />
            <TextBlock label="Referências visuais" value={project.visual_references} />
          </DetailSection>

          <ListSection title="Objetivos" items={textList(project.objectives)} />
          <ListSection title="Funcionalidades gerais" items={textList(project.common_features)} />
          <ListSection title="Recursos de loja" items={textList(project.store_features)} />
          <ListSection title="Variações dos produtos" items={textList(project.product_variations)} />
          <ListSection title="Entrega e retirada" items={textList(project.delivery_options)} />

          <DetailSection title="Observações">
            <TextBlock
              label="Informações adicionais do cliente"
              value={project.observations}
            />
          </DetailSection>
        </section>

        {generatedPackage && (
          <section className="mt-8 overflow-hidden rounded-3xl border border-blue-500/30 bg-[#06101d]">
            <div className="border-b border-white/10 bg-gradient-to-r from-blue-950/80 via-[#06101d] to-blue-950/80 p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
                Assistente de desenvolvimento
              </p>

              <h2 className="mt-3 text-2xl font-black sm:text-4xl">
                Pacote completo para continuar o projeto com IA
              </h2>

              <p className="mt-4 max-w-4xl leading-7 text-slate-300">
                Gera todo o contexto do cliente seguindo o padrão da ALISSON DEV:
                Next.js 16, TypeScript, Tailwind CSS, Supabase, App Router,
                autenticação, RLS, RPC e build obrigatório.
              </p>

              {aiPackage && (
                <p className="mt-4 text-sm font-bold text-green-400">
                  Último pacote salvo em {formatDate(aiPackage.created_at)}
                </p>
              )}
            </div>

            <div className="p-6 sm:p-8">
              {(copyMessage || successMessage) && (
                <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/5 p-4 font-bold text-green-300">
                  {copyMessage || successMessage}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      generatedPackage.prompt,
                      "Prompt para IA",
                    )
                  }
                  className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 text-left font-black transition hover:-translate-y-0.5"
                >
                  COPIAR PROMPT COMPLETO
                  <span className="mt-2 block text-xs font-medium text-blue-100">
                    Cole diretamente no ChatGPT ou em outro agente.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(
                        generatedPackage.jsonData,
                        null,
                        2,
                      ),
                      "JSON do projeto",
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-[#020914] px-5 py-4 text-left font-black transition hover:border-blue-500/50"
                >
                  COPIAR JSON
                  <span className="mt-2 block text-xs font-medium text-slate-400">
                    Dados estruturados para integrações e automações.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      generatedPackage.structure,
                      "Estrutura sugerida",
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-[#020914] px-5 py-4 text-left font-black transition hover:border-blue-500/50"
                >
                  COPIAR ESTRUTURA
                  <span className="mt-2 block text-xs font-medium text-slate-400">
                    Pastas e módulos sugeridos conforme o briefing.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      generatedPackage.checklist,
                      "Checklist técnico",
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-[#020914] px-5 py-4 text-left font-black transition hover:border-blue-500/50"
                >
                  COPIAR CHECKLIST
                  <span className="mt-2 block text-xs font-medium text-slate-400">
                    Etapas técnicas e validações antes da publicação.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `${sanitizeFileName(project.protocol)}-pacote-ia.md`,
                      generatedPackage.markdown,
                      "text/markdown",
                    )
                  }
                  className="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-5 py-4 text-left font-black text-blue-300 transition hover:bg-blue-500/20"
                >
                  BAIXAR MARKDOWN
                  <span className="mt-2 block text-xs font-medium text-slate-400">
                    Arquivo pronto para anexar em uma conversa com IA.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `${sanitizeFileName(project.protocol)}-dados.json`,
                      JSON.stringify(
                        generatedPackage.jsonData,
                        null,
                        2,
                      ),
                      "application/json",
                    )
                  }
                  className="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-5 py-4 text-left font-black text-blue-300 transition hover:bg-blue-500/20"
                >
                  BAIXAR JSON
                  <span className="mt-2 block text-xs font-medium text-slate-400">
                    Versão estruturada e reutilizável do briefing.
                  </span>
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-[#020914] p-5">
                <p className="font-black text-white">
                  Salvar no sistema
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Salva uma cópia do pacote no Supabase para você recuperar
                  depois, mesmo em outro computador.
                </p>

                <button
                  type="button"
                  onClick={saveAiPackage}
                  disabled={isSavingAiPackage}
                  className="mt-5 rounded-xl bg-green-600 px-6 py-3 font-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingAiPackage
                    ? "SALVANDO..."
                    : aiPackage
                      ? "SALVAR NOVA VERSÃO"
                      : "SALVAR PACOTE PARA IA"}
                </button>
              </div>

              <details className="mt-6 rounded-2xl border border-white/10 bg-[#020914] p-5">
                <summary className="cursor-pointer font-black text-blue-300">
                  Visualizar prompt gerado
                </summary>
                <pre className="mt-5 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-5 text-xs leading-6 text-slate-300">
                  {generatedPackage.prompt}
                </pre>
              </details>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#06101d] p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-400">
                Arquivos do projeto
              </p>

              <h2 className="mt-3 text-2xl font-black">
                Materiais enviados
              </h2>

              <p className="mt-3 text-slate-400">
                Visualize, baixe ou exclua os arquivos enviados pelo cliente.
              </p>
            </div>

            <span className="w-fit rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-black text-blue-300">
              {briefingFiles.length}{" "}
              {briefingFiles.length === 1 ? "ARQUIVO" : "ARQUIVOS"}
            </span>
          </div>

          <div className="mt-7 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5">
            <p className="font-black text-blue-200">
              Adicionar novos materiais
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Anexe arquivos recebidos depois por WhatsApp, e-mail ou atendimento presencial.
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr_auto] lg:items-end">
              <label className="block">
                <span className="text-sm font-bold text-slate-300">
                  Categoria
                </span>

                <select
                  value={adminUploadCategory}
                  onChange={(event) =>
                    setAdminUploadCategory(
                      event.target.value as BriefingFile["category"],
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#020914] px-4 py-3 text-white outline-none focus:border-blue-500"
                >
                  {(Object.keys(fileCategoryLabels) as BriefingFile["category"][]).map(
                    (category) => (
                      <option key={category} value={category}>
                        {fileCategoryLabels[category]}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-300">
                  Arquivos
                </span>

                <input
                  type="file"
                  multiple
                  onChange={(event) =>
                    setAdminUploadFiles(
                      Array.from(event.target.files || []),
                    )
                  }
                  className="mt-2 block w-full rounded-xl border border-white/10 bg-[#020914] px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-black file:text-white"
                />
              </label>

              <button
                type="button"
                onClick={uploadAdminFiles}
                disabled={
                  isUploadingAdminFiles ||
                  adminUploadFiles.length === 0
                }
                className="rounded-xl bg-green-600 px-6 py-4 font-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploadingAdminFiles
                  ? "ENVIANDO..."
                  : "ENVIAR ARQUIVOS"}
              </button>
            </div>

            {adminUploadFiles.length > 0 && (
              <p className="mt-3 text-sm text-slate-400">
                {adminUploadFiles.length} arquivo(s) selecionado(s).
              </p>
            )}

            {isUploadingAdminFiles && (
              <div className="mt-4">
                <div className="flex justify-between text-xs font-bold text-blue-300">
                  <span>Enviando materiais...</span>
                  <span>{adminUploadProgress}%</span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all"
                    style={{
                      width: `${adminUploadProgress}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {briefingFiles.length === 0 ? (
            <div className="mt-7 rounded-2xl border border-white/10 bg-[#020914] p-8 text-center">
              <p className="font-black text-slate-200">
                Nenhum material enviado
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Este projeto ainda não possui arquivos cadastrados.
              </p>
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              {(
                Object.keys(fileCategoryLabels) as BriefingFile["category"][]
              ).map((category) => {
                const categoryFiles = briefingFiles.filter(
                  (file) => file.category === category,
                );

                if (categoryFiles.length === 0) return null;

                return (
                  <div
                    key={category}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-[#020914]"
                  >
                    <div className="border-b border-white/10 px-5 py-4">
                      <h3 className="font-black text-blue-300">
                        {fileCategoryLabels[category]}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {categoryFiles.length}{" "}
                        {categoryFiles.length === 1
                          ? "arquivo"
                          : "arquivos"}
                      </p>
                    </div>

                    <div className="divide-y divide-white/10">
                      {categoryFiles.map((file) => (
                        <article
                          key={file.id}
                          className="grid gap-4 p-5 lg:grid-cols-[72px_1fr_auto] lg:items-center"
                        >
                          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                            {isImageFile(file) ? (
                              <span className="text-2xl">🖼️</span>
                            ) : (
                              <span className="text-2xl">📄</span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="break-words font-bold text-slate-200">
                              {file.file_name}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{formatFileSize(file.size_bytes)}</span>

                              <span>
                                {file.mime_type || "Tipo não informado"}
                              </span>

                              <span>
                                Enviado em {formatDate(file.created_at)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3 lg:justify-end">
                            <button
                              type="button"
                              disabled={fileActionId === file.id}
                              onClick={() => openFile(file)}
                              className="rounded-xl border border-blue-500/40 px-4 py-3 text-xs font-black text-blue-300 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              VISUALIZAR
                            </button>

                            <button
                              type="button"
                              disabled={fileActionId === file.id}
                              onClick={() => downloadProjectFile(file)}
                              className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              BAIXAR
                            </button>

                            <button
                              type="button"
                              disabled={fileActionId === file.id}
                              onClick={() => deleteProjectFile(file)}
                              className="rounded-xl border border-red-500/30 px-4 py-3 text-xs font-black text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              EXCLUIR
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#020914] p-5">
      <h2 className="font-black text-blue-400">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </article>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-[#06101d] p-6 sm:p-8">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-6 space-y-5">{children}</div>
    </article>
  );
}

function ListSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-[#06101d] p-6 sm:p-8">
      <h2 className="text-xl font-black">{title}</h2>

      {items.length === 0 ? (
        <p className="mt-5 text-slate-500">Nenhuma opção informada.</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#020914] p-4"
            >
              <span className="mt-0.5 text-green-400">✓</span>
              <span className="text-sm font-bold text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-slate-200">
        {value || "Não informado"}
      </p>
    </div>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-slate-300">
        {value || "Não informado"}
      </p>
    </div>
  );
}
