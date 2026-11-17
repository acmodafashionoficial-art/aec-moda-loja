"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  defaultHomeTexts,
  defaultMainOffer,
  type HomeTexts,
  type MainOffer,
} from "@/lib/site-content";

const homeLabels: Record<keyof HomeTexts, string> = {
  brand_tagline: "Slogan da marca",
  header_button: "Botão do topo",
  hero_eyebrow: "Selo principal",
  hero_title: "Título principal",
  hero_highlight: "Destaque do título",
  hero_description: "Descrição principal",
  hero_primary_button: "Botão principal",
  hero_secondary_button: "Botão do portfólio",
  portfolio_eyebrow: "Selo do portfólio",
  portfolio_title: "Título do portfólio",
  portfolio_disclaimer: "Aviso do portfólio",
  process_eyebrow: "Selo do processo",
  process_title: "Título do processo",
  control_eyebrow: "Selo da seção de controle",
  control_title: "Título da seção de controle",
  control_description: "Descrição da seção de controle",
  agenda_eyebrow: "Selo da agenda",
  agenda_title: "Título da agenda",
  agenda_description: "Descrição da agenda",
  agenda_button: "Botão da agenda",
  investment_eyebrow: "Selo de investimento",
  investment_title: "Título de investimento",
  investment_description: "Descrição de investimento",
  final_cta_title: "Título da chamada final",
  final_cta_description: "Descrição da chamada final",
  final_cta_button: "Botão da chamada final",
  footer_description: "Texto do rodapé",
};

function listToText(values: string[]) {
  return values.join("\n");
}

function textToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminSitePage() {
  const router = useRouter();

  const [mainOffer, setMainOffer] =
    useState<MainOffer>(defaultMainOffer);
  const [homeTexts, setHomeTexts] =
    useState<HomeTexts>(defaultHomeTexts);
  const [benefitsText, setBenefitsText] = useState(
    listToText(defaultMainOffer.benefits),
  );

  const [adminEmail, setAdminEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
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

      setAdminEmail(user.email || "");

      const { data, error } = await supabase
        .from("site_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["main_offer", "home_texts"]);

      if (error) {
        throw new Error(error.message);
      }

      let loadedOffer = defaultMainOffer;
      let loadedTexts = defaultHomeTexts;

      for (const item of data || []) {
        if (item.setting_key === "main_offer") {
          loadedOffer = {
            ...defaultMainOffer,
            ...(item.setting_value as Partial<MainOffer>),
          };
        }

        if (item.setting_key === "home_texts") {
          loadedTexts = {
            ...defaultHomeTexts,
            ...(item.setting_value as Partial<HomeTexts>),
          };
        }
      }

      setMainOffer(loadedOffer);
      setHomeTexts(loadedTexts);
      setBenefitsText(listToText(loadedOffer.benefits));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o conteúdo.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateOffer<K extends keyof MainOffer>(
    field: K,
    value: MainOffer[K],
  ) {
    setMainOffer((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateHomeText<K extends keyof HomeTexts>(
    field: K,
    value: HomeTexts[K],
  ) {
    setHomeTexts((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveSettings() {
    setIsSaving(true);
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

      const finalOffer: MainOffer = {
        ...mainOffer,
        benefits: textToList(benefitsText),
      };

      const { error } = await supabase
        .from("site_settings")
        .upsert(
          [
            {
              setting_key: "main_offer",
              setting_value: finalOffer,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            },
            {
              setting_key: "home_texts",
              setting_value: homeTexts,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            },
          ],
          {
            onConflict: "setting_key",
          },
        );

      if (error) {
        throw new Error(error.message);
      }

      setMainOffer(finalOffer);
      setSuccessMessage("Conteúdo do site atualizado com sucesso.");
      window.setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o conteúdo.",
      );
    } finally {
      setIsSaving(false);
    }
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
            Carregando editor do site...
          </p>
        </div>
      </main>
    );
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
                Editor do site
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-sm">
              <p className="font-bold text-slate-300">
                Administrador
              </p>
              <p className="text-xs text-slate-500">
                {adminEmail}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-red-500/30 px-5 py-3 text-sm font-black text-red-400"
            >
              SAIR
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-sm font-bold text-blue-400"
            >
              ← Voltar ao dashboard
            </Link>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-blue-500">
              Conteúdo administrável
            </p>

            <h1 className="mt-3 text-3xl font-black sm:text-5xl">
              Editar textos, vantagens e valores
            </h1>

            <p className="mt-3 max-w-3xl leading-7 text-slate-400">
              As alterações aparecem na página inicial sem precisar
              modificar o código.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              target="_blank"
              className="rounded-xl border border-blue-500/40 px-5 py-3 text-sm font-black text-blue-300"
            >
              ABRIR SITE
            </Link>

            <button
              type="button"
              onClick={saveSettings}
              disabled={isSaving}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-black disabled:opacity-60"
            >
              {isSaving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-7 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 font-bold text-red-300">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-7 rounded-2xl border border-green-500/30 bg-green-500/5 p-5 font-bold text-green-300">
            {successMessage}
          </div>
        )}

        <section className="mt-8 rounded-3xl border border-blue-500/30 bg-[#06101d] p-6 sm:p-8">
          <h2 className="text-2xl font-black">Oferta comercial</h2>

          <label className="mt-6 flex items-center gap-3">
            <input
              type="checkbox"
              checked={mainOffer.enabled}
              onChange={(event) =>
                updateOffer("enabled", event.target.checked)
              }
              className="h-5 w-5"
            />
            <span className="font-bold">
              Mostrar oferta no site
            </span>
          </label>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <EditorField
              label="Selo da oferta"
              value={mainOffer.eyebrow}
              onChange={(value) => updateOffer("eyebrow", value)}
            />

            <EditorField
              label="Título da oferta"
              value={mainOffer.title}
              onChange={(value) => updateOffer("title", value)}
            />

            <EditorField
              label="Preço anterior"
              value={mainOffer.old_price}
              onChange={(value) =>
                updateOffer("old_price", value)
              }
            />

            <EditorField
              label="Preço promocional"
              value={mainOffer.promotional_price}
              onChange={(value) =>
                updateOffer("promotional_price", value)
              }
            />

            <EditorField
              label="Texto do botão"
              value={mainOffer.button_text}
              onChange={(value) =>
                updateOffer("button_text", value)
              }
            />

            <EditorField
              label="Destino do botão"
              value={mainOffer.button_link}
              onChange={(value) =>
                updateOffer("button_link", value)
              }
            />
          </div>

          <div className="mt-5 space-y-5">
            <EditorArea
              label="Descrição da oferta"
              value={mainOffer.description}
              onChange={(value) =>
                updateOffer("description", value)
              }
            />

            <EditorArea
              label="Vantagens — uma por linha"
              value={benefitsText}
              onChange={setBenefitsText}
              rows={12}
            />

            <EditorField
              label="Título sobre o domínio"
              value={mainOffer.domain_title}
              onChange={(value) =>
                updateOffer("domain_title", value)
              }
            />

            <EditorArea
              label="Explicação sobre a renovação do domínio"
              value={mainOffer.domain_description}
              onChange={(value) =>
                updateOffer("domain_description", value)
              }
            />

            <EditorArea
              label="Observação de pagamento"
              value={mainOffer.price_note}
              onChange={(value) =>
                updateOffer("price_note", value)
              }
            />
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#06101d] p-6 sm:p-8">
          <h2 className="text-2xl font-black">
            Textos principais da página
          </h2>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            {(Object.keys(homeTexts) as (keyof HomeTexts)[]).map(
              (key) => (
                <EditorArea
                  key={key}
                  label={homeLabels[key]}
                  value={homeTexts[key]}
                  onChange={(value) =>
                    updateHomeText(key, value)
                  }
                  rows={
                    key.includes("description") ? 4 : 2
                  }
                />
              ),
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function EditorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-300">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#020914] px-4 py-3 text-white outline-none focus:border-blue-500"
      />
    </label>
  );
}

function EditorArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-300">
        {label}
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#020914] px-4 py-3 text-white outline-none focus:border-blue-500"
      />
    </label>
  );
}
