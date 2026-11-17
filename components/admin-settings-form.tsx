"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoreSettings } from "@/lib/store-settings";

type CategoryImageKey =
  | "categoryFemininoImageUrl"
  | "categoryMasculinoImageUrl"
  | "categoryInfantilImageUrl"
  | "categoryPlusImageUrl";

const categoryImages: Array<{
  key: CategoryImageKey;
  label: string;
}> = [
  { key: "categoryFemininoImageUrl", label: "Feminino" },
  { key: "categoryMasculinoImageUrl", label: "Masculino" },
  { key: "categoryInfantilImageUrl", label: "Infantil" },
  { key: "categoryPlusImageUrl", label: "Plus Size" },
];

export function AdminSettingsForm({ initialSettings }: { initialSettings: StoreSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const uploading = Boolean(uploadingField);

  function update<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    setUploadingField("logo");
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "logo");
      const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a logo.");
      update("logoUrl", data.imageUrl);
      setMessage("Logo enviada. Clique em Salvar configurações para publicar.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao enviar a logo.");
    } finally {
      setUploadingField("");
    }
  }

  async function uploadHeroImage(file?: File) {
    if (!file) return;
    setUploadingField("heroImageUrl");
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "hero");
      const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a foto do banner.");
      update("heroImageUrl", data.imageUrl);
      setMessage("Foto do banner enviada. Clique em Salvar configurações para publicar.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao enviar a foto do banner.");
    } finally {
      setUploadingField("");
    }
  }

  async function uploadCategoryImage(key: CategoryImageKey, label: string, file?: File) {
    if (!file) return;
    setUploadingField(key);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "category");
      const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Não foi possível enviar a foto de ${label}.`);
      update(key, data.imageUrl);
      setMessage(`Foto de ${label} enviada. Clique em Salvar configurações para publicar.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Erro ao enviar a foto de ${label}.`);
    } finally {
      setUploadingField("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar as configurações.");
      setSettings(data.settings);
      setMessage("Personalização salva. A vitrine já foi atualizada.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-settings-form" onSubmit={submit}>
      <div className="admin-form-main">
        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>1</span><div><h2>Marca e logo</h2><p>Use a identidade da A&C Moda em toda a loja.</p></div></div>
          <div className="brand-preview-card" style={{ background: settings.backgroundColor }}>
            <Image src={settings.logoUrl || "/brand/aec-logo.svg"} alt="Prévia da logo" width={360} height={130} unoptimized />
          </div>
          <label className={`image-dropzone compact ${uploadingField === "logo" ? "uploading" : ""}`}>
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => uploadLogo(event.target.files?.[0])} />
            <b>{uploadingField === "logo" ? "Ajustando logo…" : "Enviar outra logo"}</b>
            <span>O sistema preserva a proporção e cria uma versão leve para o site.</span>
          </label>
          <div className="admin-form-grid two">
            <label>Nome da loja<input value={settings.storeName} onChange={(event) => update("storeName", event.target.value)} /></label>
            <label>Frase abaixo da logo<input value={settings.tagline} onChange={(event) => update("tagline", event.target.value)} /></label>
            <label className="span-two">Endereço da logo<input value={settings.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} /></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>2</span><div><h2>Cores da loja</h2><p>Paleta elegante em preto, off-white e caramelo.</p></div></div>
          <div className="admin-form-grid three color-fields">
            <label>Cor principal<input type="color" value={settings.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} /><small>{settings.primaryColor}</small></label>
            <label>Cor de destaque<input type="color" value={settings.accentColor} onChange={(event) => update("accentColor", event.target.value)} /><small>{settings.accentColor}</small></label>
            <label>Fundo suave<input type="color" value={settings.backgroundColor} onChange={(event) => update("backgroundColor", event.target.value)} /><small>{settings.backgroundColor}</small></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>3</span><div><h2>Textos da página inicial</h2><p>Edite as mensagens sem abrir o código.</p></div></div>
          <div className="admin-form-grid two">
            <label className="span-two">Aviso no topo<input value={settings.announcement} onChange={(event) => update("announcement", event.target.value)} /></label>
            <label>Chamada pequena<input value={settings.heroEyebrow} onChange={(event) => update("heroEyebrow", event.target.value)} /></label>
            <label>Texto do botão<input value={settings.heroButtonText} onChange={(event) => update("heroButtonText", event.target.value)} /></label>
            <label className="span-two">Título principal<input value={settings.heroTitle} onChange={(event) => update("heroTitle", event.target.value)} /></label>
            <label className="span-two">Descrição principal<textarea rows={4} value={settings.heroText} onChange={(event) => update("heroText", event.target.value)} /></label>
            <label className="span-two">Descrição da loja<textarea rows={4} value={settings.description} onChange={(event) => update("description", event.target.value)} /></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>4</span><div><h2>Foto do banner principal</h2><p>Escolha a foto grande que aparecerá ao lado do texto principal da loja.</p></div></div>
          <div
            style={{
              minHeight: 360,
              position: "relative",
              overflow: "hidden",
              border: "1px solid var(--line)",
              background: "#211f1d",
              marginBottom: 14,
            }}
          >
            {settings.heroImageUrl ? (
              <Image
                src={settings.heroImageUrl}
                alt="Prévia do banner principal"
                fill
                sizes="(max-width: 700px) 100vw, 760px"
                style={{ objectFit: "cover", objectPosition: "center" }}
                unoptimized
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  padding: 25,
                  color: "#fff",
                  textAlign: "center",
                }}
              >
                Nenhuma foto selecionada para o banner
              </div>
            )}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(90deg, rgba(0,0,0,.12), transparent 60%)",
                pointerEvents: "none",
              }}
            />
          </div>

          <label className={`image-dropzone compact ${uploadingField === "heroImageUrl" ? "uploading" : ""}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => uploadHeroImage(event.target.files?.[0])}
            />
            <b>
              {uploadingField === "heroImageUrl"
                ? "Ajustando foto…"
                : settings.heroImageUrl
                  ? "Trocar foto do banner"
                  : "Escolher foto do banner"}
            </b>
            <span>Use uma foto vertical ou quadrada com boa resolução. O sistema fará o ajuste automático.</span>
          </label>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>5</span><div><h2>Fotos das categorias</h2><p>As administradoras podem escolher e trocar as quatro fotos exibidas na página inicial.</p></div></div>
          <div className="admin-form-grid two">
            {categoryImages.map(({ key, label }) => {
              const imageUrl = settings[key];
              const isUploading = uploadingField === key;

              return (
                <div key={key} style={{ display: "grid", gap: 10 }}>
                  <div
                    style={{
                      minHeight: 250,
                      position: "relative",
                      overflow: "hidden",
                      border: "1px solid var(--line)",
                      background: "#2b2927",
                    }}
                  >
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={`Prévia da categoria ${label}`}
                        fill
                        sizes="(max-width: 700px) 100vw, 360px"
                        style={{ objectFit: "cover" }}
                        unoptimized
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "grid",
                          placeItems: "center",
                          padding: 20,
                          color: "#fff",
                          textAlign: "center",
                        }}
                      >
                        Nenhuma foto selecionada
                      </div>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "flex-end",
                        padding: 20,
                        color: "#fff",
                        background: "linear-gradient(transparent 35%, rgba(0,0,0,.75))",
                      }}
                    >
                      <strong style={{ fontSize: 24 }}>{label}</strong>
                    </div>
                  </div>

                  <label className={`image-dropzone compact ${isUploading ? "uploading" : ""}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(event) => uploadCategoryImage(key, label, event.target.files?.[0])}
                    />
                    <b>{isUploading ? "Ajustando foto…" : imageUrl ? "Trocar foto" : "Escolher foto"}</b>
                    <span>Use uma imagem vertical. O sistema ajustará para preencher o cartão.</span>
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>6</span><div><h2>Contato e redes sociais</h2><p>Informações usadas no rodapé e atendimento.</p></div></div>
          <div className="admin-form-grid two">
            <label>WhatsApp com DDD<input inputMode="tel" value={settings.whatsappNumber} onChange={(event) => update("whatsappNumber", event.target.value.replace(/\D/g, ""))} placeholder="55819XXXXXXXX" /><small>Usado também no botão para combinar a retirada.</small></label>
            <label>Instagram<input value={settings.instagramUrl} onChange={(event) => update("instagramUrl", event.target.value)} /></label>
            <label>Cidade<input value={settings.city} onChange={(event) => update("city", event.target.value)} /></label>
            <label>Horário de atendimento<input value={settings.supportHours} onChange={(event) => update("supportHours", event.target.value)} /></label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>7</span><div><h2>Entrega local, frete e retirada</h2><p>Defina as opções de recebimento sem alterar a aparência da loja.</p></div></div>
          <div className="admin-switch-stack">
            <label className="admin-switch"><input type="checkbox" checked={settings.localDeliveryEnabled} onChange={(event) => update("localDeliveryEnabled", event.target.checked)} /><span><b>Permitir entrega local gratuita</b><small>Disponível somente na cidade e no estado configurados abaixo.</small></span></label>
            <label className="admin-switch"><input type="checkbox" checked={settings.pickupEnabled} onChange={(event) => update("pickupEnabled", event.target.checked)} /><span><b>Permitir retirada gratuita</b><small>O cliente poderá finalizar sem pagar frete.</small></span></label>
          </div>
          <div className="admin-form-grid two">
            <label>Nome da entrega local<input value={settings.localDeliveryName} onChange={(event) => update("localDeliveryName", event.target.value)} /></label>
            <label>Cidade atendida<input value={settings.localDeliveryCity} onChange={(event) => update("localDeliveryCity", event.target.value)} /></label>
            <label>Estado<input maxLength={2} value={settings.localDeliveryState} onChange={(event) => update("localDeliveryState", event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} /></label>
            <label>CEP de origem<input inputMode="numeric" maxLength={9} value={settings.senderPostalCode} onChange={(event) => update("senderPostalCode", event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="CEP da loja" /></label>
            <label className="span-two">Orientações para entrega local<textarea rows={4} value={settings.localDeliveryInstructions} onChange={(event) => update("localDeliveryInstructions", event.target.value)} /></label>
            <label>Nome da retirada<input value={settings.pickupName} onChange={(event) => update("pickupName", event.target.value)} /></label>
            <label>Frete grátis nacional acima de R$<input inputMode="decimal" value={settings.freeShippingFrom || ""} onChange={(event) => update("freeShippingFrom", Math.max(0, Number(event.target.value.replace(",", ".")) || 0))} placeholder="0 para desativar" /></label>
            <label className="span-two">Endereço completo para retirada<textarea rows={3} value={settings.pickupAddress} onChange={(event) => update("pickupAddress", event.target.value)} placeholder="Rua, número, bairro, Jataúba - PE" /></label>
            <label className="span-two">Orientações para retirada<textarea rows={4} value={settings.pickupInstructions} onChange={(event) => update("pickupInstructions", event.target.value)} /></label>
          </div>
        </section>
      </div>

      <aside className="admin-form-side">
        <div className="admin-form-card sticky-card">
          <h2>Salvar personalização</h2>
          <div className="publish-summary"><span>Domínio <b>{settings.domain}</b></span><span>Entrega local <b>{settings.localDeliveryEnabled ? "Ativa" : "Desativada"}</b></span><span>Retirada <b>{settings.pickupEnabled ? "Ativa" : "Desativada"}</b></span><span>CEP de origem <b>{settings.senderPostalCode || "Pendente"}</b></span></div>
          {message && <div className="upload-success">✓ {message}</div>}
          {error && <div className="form-error">{error}</div>}
          <button className="button button-dark button-full" disabled={saving || uploading}>{saving ? "Salvando…" : uploading ? "Aguarde o envio…" : "Salvar configurações"}</button>
        </div>
      </aside>
    </form>
  );
}
