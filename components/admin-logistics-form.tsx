"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createShipmentPlan, profileUnitVolume } from "@/lib/packing";
import type { LogisticsProfile, LogisticsSettings, PackageTemplate } from "@/lib/logistics-types";

type CalibrationDraft = { quantity: string; weightKg: string; widthCm: string; heightCm: string; lengthCm: string };

const emptyCalibration = (): CalibrationDraft => ({ quantity: "1", weightKg: "", widthCm: "", heightCm: "", lengthCm: "" });
const decimal = (value: string) => Number(value.replace(",", "."));
const safeId = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

export function AdminLogisticsForm({ initialSettings }: { initialSettings: LogisticsSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [calibrations, setCalibrations] = useState<Record<string, CalibrationDraft>>({});
  const [simulationProfileId, setSimulationProfileId] = useState(initialSettings.fallbackProfileId);
  const [simulationQuantity, setSimulationQuantity] = useState("3");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const activeProfiles = settings.profiles.filter((profile) => profile.enabled);
  const simulation = useMemo(() => {
    try {
      const profile = settings.profiles.find((item) => item.id === simulationProfileId) || activeProfiles[0];
      if (!profile) return null;
      return createShipmentPlan([{
        quantity: Math.max(1, Math.floor(decimal(simulationQuantity) || 1)),
        unitWeightKg: profile.unitWeightKg,
        unitVolumeCm3: profile.unitVolumeCm3,
        insuranceValue: 0,
      }], settings);
    } catch {
      return null;
    }
  }, [settings, simulationProfileId, simulationQuantity, activeProfiles]);

  function updateRoot<K extends keyof LogisticsSettings>(key: K, value: LogisticsSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateProfile(index: number, patch: Partial<LogisticsProfile>) {
    setSettings((current) => ({ ...current, profiles: current.profiles.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function updatePackage(index: number, patch: Partial<PackageTemplate>) {
    setSettings((current) => ({ ...current, packages: current.packages.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function calibrate(profile: LogisticsProfile, index: number) {
    const draft = calibrations[profile.id] || emptyCalibration();
    const quantity = Math.max(1, Math.floor(decimal(draft.quantity) || 1));
    const totalWeight = decimal(draft.weightKg);
    const width = decimal(draft.widthCm);
    const height = decimal(draft.heightCm);
    const length = decimal(draft.lengthCm);
    if (![totalWeight, width, height, length].every((value) => Number.isFinite(value) && value > 0)) {
      setError(`Preencha peso e medidas da amostra de ${profile.name}.`);
      return;
    }
    const unitWeightKg = totalWeight / quantity;
    const unitHeightCm = height / quantity;
    const unitVolumeCm3 = profileUnitVolume(width, height, length) / quantity;
    updateProfile(index, {
      unitWeightKg: Math.round(unitWeightKg * 1000) / 1000,
      unitWidthCm: Math.round(width * 10) / 10,
      unitHeightCm: Math.round(unitHeightCm * 10) / 10,
      unitLengthCm: Math.round(length * 10) / 10,
      unitVolumeCm3: Math.round(unitVolumeCm3),
      calibratedAt: new Date().toISOString(),
      calibrationQuantity: quantity,
    });
    setError("");
    setMessage(`Padrão de ${profile.name} calculado com ${quantity} ${quantity === 1 ? "peça" : "peças"}. Salve as configurações.`);
  }

  function addProfile() {
    const id = `tipo-${Date.now()}`;
    setSettings((current) => ({
      ...current,
      profiles: [...current.profiles, { id, name: "Novo tipo de peça", description: "", unitWeightKg: 0.35, unitWidthCm: 24, unitHeightCm: 4, unitLengthCm: 20, unitVolumeCm3: 1920, enabled: true }],
    }));
    setCalibrations((current) => ({ ...current, [id]: emptyCalibration() }));
  }

  function addPackage() {
    setSettings((current) => ({
      ...current,
      packages: [...current.packages, { id: `embalagem-${Date.now()}`, name: "Nova embalagem", widthCm: 30, heightCm: 8, lengthCm: 22, tareWeightKg: 0.12, maxWeightKg: 2, usableVolumePercent: 75, enabled: true }],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const normalized = {
        ...settings,
        profiles: settings.profiles.map((profile, index) => ({ ...profile, id: safeId(profile.id || profile.name) || `perfil-${index + 1}` })),
        packages: settings.packages.map((item, index) => ({ ...item, id: safeId(item.id || item.name) || `embalagem-${index + 1}` })),
      };
      const response = await fetch("/api/admin/logistics", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setSettings(data.settings);
      setMessage("Logística salva. Os próximos cálculos de frete já usarão esses padrões.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-logistics-form" onSubmit={submit}>
      <div className="admin-form-main">
        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>1</span><div><h2>Margens de segurança</h2><p>Uma pequena margem protege contra variação de tecido, dobra e material da embalagem.</p></div></div>
          <div className="admin-form-grid three">
            <label>Margem no peso (%)<input type="number" min="0" max="50" value={settings.weightSafetyPercent} onChange={(event) => updateRoot("weightSafetyPercent", Number(event.target.value))} /></label>
            <label>Margem no volume (%)<input type="number" min="0" max="60" value={settings.volumeSafetyPercent} onChange={(event) => updateRoot("volumeSafetyPercent", Number(event.target.value))} /></label>
            <label>Conferir acima de quantas peças<input type="number" min="1" max="100" value={settings.maxAutomaticItems} onChange={(event) => updateRoot("maxAutomaticItems", Number(event.target.value))} /></label>
          </div>
          <p className="admin-field-note">Recomendado: 10% no peso e 12% no volume. Pedidos maiores continuam sendo calculados, mas recebem aviso para conferência.</p>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>2</span><div><h2>Tipos de peça</h2><p>Meça uma peça ou uma pilha de peças iguais. O sistema divide pela quantidade e cria o padrão unitário.</p></div></div>
          <div className="logistics-profile-list">
            {settings.profiles.map((profile, index) => {
              const draft = calibrations[profile.id] || emptyCalibration();
              return <article className="logistics-profile-card" key={profile.id}>
                <div className="logistics-card-head">
                  <div><input className="logistics-name-input" value={profile.name} onChange={(event) => updateProfile(index, { name: event.target.value })} /><input className="logistics-description-input" value={profile.description} onChange={(event) => updateProfile(index, { description: event.target.value })} placeholder="Ex.: vestidos leves dobrados" /></div>
                  <label className="mini-switch"><input type="checkbox" checked={profile.enabled} onChange={(event) => updateProfile(index, { enabled: event.target.checked })} /> Ativo</label>
                </div>
                <div className="profile-current-values"><span><b>{profile.unitWeightKg.toFixed(3)} kg</b> por unidade</span><span><b>{profile.unitWidthCm} × {profile.unitLengthCm} × {profile.unitHeightCm} cm</b> dobrada</span><span><b>{Math.round(profile.unitVolumeCm3).toLocaleString("pt-BR")} cm³</b> por unidade</span></div>
                <div className="calibration-box">
                  <strong>Calibrar com uma medição real</strong>
                  <p>Coloque peças iguais uma sobre a outra, pese sem a embalagem de envio e meça a pilha dobrada.</p>
                  <div className="admin-form-grid five">
                    <label>Quantidade<input type="number" min="1" value={draft.quantity} onChange={(event) => setCalibrations((current) => ({ ...current, [profile.id]: { ...draft, quantity: event.target.value } }))} /></label>
                    <label>Peso total (kg)<input inputMode="decimal" value={draft.weightKg} onChange={(event) => setCalibrations((current) => ({ ...current, [profile.id]: { ...draft, weightKg: event.target.value } }))} placeholder="0,350" /></label>
                    <label>Largura (cm)<input inputMode="decimal" value={draft.widthCm} onChange={(event) => setCalibrations((current) => ({ ...current, [profile.id]: { ...draft, widthCm: event.target.value } }))} placeholder="24" /></label>
                    <label>Altura da pilha (cm)<input inputMode="decimal" value={draft.heightCm} onChange={(event) => setCalibrations((current) => ({ ...current, [profile.id]: { ...draft, heightCm: event.target.value } }))} placeholder="4" /></label>
                    <label>Comprimento (cm)<input inputMode="decimal" value={draft.lengthCm} onChange={(event) => setCalibrations((current) => ({ ...current, [profile.id]: { ...draft, lengthCm: event.target.value } }))} placeholder="20" /></label>
                  </div>
                  <button type="button" className="admin-helper-button" onClick={() => calibrate(profile, index)}>Calcular padrão por unidade</button>
                </div>
                <div className="logistics-card-footer"><label>Usar como padrão geral <input type="radio" name="fallback" checked={settings.fallbackProfileId === profile.id} onChange={() => updateRoot("fallbackProfileId", profile.id)} /></label>{settings.profiles.length > 1 && <button type="button" className="admin-text-button danger" onClick={() => setSettings((current) => ({ ...current, profiles: current.profiles.filter((_, itemIndex) => itemIndex !== index), fallbackProfileId: current.fallbackProfileId === profile.id ? current.profiles.find((_, itemIndex) => itemIndex !== index)?.id || "" : current.fallbackProfileId }))}>Remover</button>}</div>
              </article>;
            })}
          </div>
          <button type="button" className="button button-outline" onClick={addProfile}>+ Adicionar tipo de peça</button>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>3</span><div><h2>Embalagens disponíveis</h2><p>Meça cada embalagem vazia apenas uma vez. O sistema escolhe automaticamente a menor que comporta o pedido.</p></div></div>
          <div className="package-table">
            <div className="package-row header"><span>Embalagem</span><span>L × C × A</span><span>Peso vazio</span><span>Peso máximo</span><span>Ocupação</span><span></span></div>
            {settings.packages.map((item, index) => <div className="package-row" key={item.id}>
              <label><input value={item.name} onChange={(event) => updatePackage(index, { name: event.target.value })} /><small><input type="checkbox" checked={item.enabled} onChange={(event) => updatePackage(index, { enabled: event.target.checked })} /> ativa</small></label>
              <div className="package-dimensions"><input value={item.widthCm} onChange={(event) => updatePackage(index, { widthCm: decimal(event.target.value) })} /><b>×</b><input value={item.lengthCm} onChange={(event) => updatePackage(index, { lengthCm: decimal(event.target.value) })} /><b>×</b><input value={item.heightCm} onChange={(event) => updatePackage(index, { heightCm: decimal(event.target.value) })} /></div>
              <label><input value={item.tareWeightKg} onChange={(event) => updatePackage(index, { tareWeightKg: decimal(event.target.value) })} /><small>kg</small></label>
              <label><input value={item.maxWeightKg} onChange={(event) => updatePackage(index, { maxWeightKg: decimal(event.target.value) })} /><small>kg</small></label>
              <label><input type="number" min="35" max="100" value={item.usableVolumePercent} onChange={(event) => updatePackage(index, { usableVolumePercent: Number(event.target.value) })} /><small>% útil</small></label>
              <button type="button" className="admin-text-button danger" disabled={settings.packages.length === 1} onClick={() => setSettings((current) => ({ ...current, packages: current.packages.filter((_, itemIndex) => itemIndex !== index) }))}>Remover</button>
            </div>)}
          </div>
          <button type="button" className="button button-outline" onClick={addPackage}>+ Adicionar embalagem</button>
        </section>

        <section className="admin-form-card">
          <div className="admin-form-card-title"><span>4</span><div><h2>Simulador de quantidade</h2><p>Confira qual embalagem e peso serão usados antes de salvar.</p></div></div>
          <div className="logistics-simulator">
            <label>Tipo de peça<select value={simulationProfileId} onChange={(event) => setSimulationProfileId(event.target.value)}>{activeProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
            <label>Quantidade<input type="number" min="1" max="100" value={simulationQuantity} onChange={(event) => setSimulationQuantity(event.target.value)} /></label>
            {simulation && <div className="simulation-result"><strong>{simulation.volumes.length === 1 ? simulation.volumes[0].packageName : `${simulation.volumes.length} volumes`}</strong><span>Peso usado na cotação: {simulation.quotedWeightKg.toFixed(3)} kg</span><span>Itens: {simulation.totalItems}</span>{simulation.warning && <small>{simulation.warning}</small>}</div>}
          </div>
        </section>
      </div>

      <aside className="admin-form-side">
        <div className="admin-form-card sticky-card"><h2>Salvar logística</h2><div className="publish-summary"><span>Tipos ativos <b>{activeProfiles.length}</b></span><span>Embalagens ativas <b>{settings.packages.filter((item) => item.enabled).length}</b></span><span>Padrão geral <b>{settings.profiles.find((item) => item.id === settings.fallbackProfileId)?.name || "Pendente"}</b></span></div>{message && <div className="upload-success">✓ {message}</div>}{error && <div className="form-error">{error}</div>}<button className="button button-dark button-full" disabled={saving}>{saving ? "Salvando…" : "Salvar padrões"}</button></div>
      </aside>
    </form>
  );
}
