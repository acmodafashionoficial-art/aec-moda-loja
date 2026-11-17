"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InvestmentLotView,
  InvestmentLotItemView,
  InvestmentParticipantView,
  InvestmentQueueView,
  InvestorView,
} from "@/lib/investment-repository";

type VariantOption = {
  id: string;
  size: string;
  color: string;
  sku: string;
  currentStock: number;
  unassignedStock: number;
};

type ProductGroupOption = {
  id: string;
  name: string;
  slug: string;
  image: string;
  currentStock: number;
  unassignedStock: number;
  variants: VariantOption[];
};

type Props = {
  investors: InvestorView[];
  lots: InvestmentLotView[];
  participants: InvestmentParticipantView[];
  queue: InvestmentQueueView[];
  lotItems: InvestmentLotItemView[];
  productGroups: ProductGroupOption[];
};

function intValue(value: string) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function statusLabel(status: InvestmentLotView["status"]) {
  if (status === "active") return "Em andamento";
  if (status === "completed") return "Concluído";
  if (status === "cancelled") return "Cancelado";
  return "Rascunho";
}

function slotLabel(status: InvestmentQueueView["slotStatus"]) {
  if (status === "allocated") return "Vendido";
  if (status === "reversed") return "Estornado";
  return "Aguardando";
}

function shortDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function sourceLabel(item: InvestmentQueueView) {
  if (item.slotStatus === "reversed") return "Venda estornada";
  if (item.sourceType === "store_sale") return "Venda presencial";
  if (item.sourceType === "online_order") return "Venda online";
  return "Aguardando venda";
}

function ProductPhotoPicker({
  products,
  value,
  onChange,
}: {
  products: ProductGroupOption[];
  value: string;
  onChange: (productId: string) => void;
}) {
  if (!products.length) {
    return (
      <div className="investment-empty-note">
        Não há outros modelos disponíveis para adicionar a este lote.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))",
        gap: 12,
        width: "100%",
      }}
    >
      {products.map((product) => {
        const selected = product.id === value;
        const unavailable = product.unassignedStock <= 0;
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => !unavailable && onChange(product.id)}
            disabled={unavailable}
            aria-pressed={selected}
            title={
              unavailable
                ? `${product.name}: sem peças livres para novo lote`
                : `Selecionar ${product.name}`
            }
            style={{
              appearance: "none",
              border: selected ? "2px solid #111" : "1px solid #dedbd6",
              borderRadius: 10,
              padding: 8,
              background: selected ? "#f4efe8" : "#fff",
              textAlign: "left",
              cursor: unavailable ? "not-allowed" : "pointer",
              opacity: unavailable ? 0.5 : 1,
              boxShadow: selected ? "0 0 0 2px rgba(17,17,17,.08)" : "none",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "4 / 5",
                overflow: "hidden",
                borderRadius: 7,
                background: "#f1efeb",
                marginBottom: 8,
              }}
            >
              <Image
                src={product.image || "/products/body-vinho.svg"}
                alt={product.name}
                fill
                sizes="(max-width: 760px) 45vw, 180px"
                style={{ objectFit: "cover" }}
              />
            </div>
            <strong
              style={{
                display: "block",
                fontSize: 12,
                lineHeight: 1.3,
                marginBottom: 5,
              }}
            >
              {product.name}
            </strong>
            <small style={{ display: "block", fontSize: 10, color: "#666" }}>
              {unavailable
                ? "Sem peças livres"
                : `${product.unassignedStock} peça(s) livre(s) de ${product.currentStock}`}
            </small>
            {selected ? (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 7,
                  padding: "4px 7px",
                  borderRadius: 999,
                  background: "#111",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                Selecionada
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function InvestmentManager({
  investors,
  lots,
  participants,
  queue,
  lotItems,
  productGroups,
}: Props) {
  const router = useRouter();
  const activeInvestors = investors.filter((investor) => investor.active);
  const archivedInvestorsCount = investors.filter((investor) => !investor.active).length;

  const [showArchivedInvestors, setShowArchivedInvestors] = useState(false);
  const visibleInvestors = showArchivedInvestors
    ? investors
    : investors.filter((investor) => investor.active);

  const [investorName, setInvestorName] = useState("");
  const [investorEmail, setInvestorEmail] = useState("");
  const [investorPhone, setInvestorPhone] = useState("");
  const [savingInvestor, setSavingInvestor] = useState(false);
  const [editingInvestorId, setEditingInvestorId] = useState("");
  const [editInvestorName, setEditInvestorName] = useState("");
  const [editInvestorEmail, setEditInvestorEmail] = useState("");
  const [editInvestorPhone, setEditInvestorPhone] = useState("");
  const [editInvestorActive, setEditInvestorActive] = useState(true);
  const [investorActionId, setInvestorActionId] = useState("");

  const [lotName, setLotName] = useState("");
  const [distributionMode, setDistributionMode] = useState<
    "random" | "manual_order" | "piece_assignment"
  >("random");
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [pieceAssignments, setPieceAssignments] = useState<Record<string, string>>({});
  const [generatedInviteLinks, setGeneratedInviteLinks] = useState<
    Record<string, { inviteUrl: string; expiresAt?: string | null; mode?: string }>
  >({});
  const [unitsByInvestor, setUnitsByInvestor] = useState<Record<string, string>>(
    {},
  );
  const [pendingProductId, setPendingProductId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [quantitiesByVariant, setQuantitiesByVariant] = useState<
    Record<string, string>
  >({});
  const [creatingLot, setCreatingLot] = useState(false);

  const [editingLotId, setEditingLotId] = useState("");
  const [editLotName, setEditLotName] = useState("");
  const [editUnitsByInvestor, setEditUnitsByInvestor] = useState<Record<string, string>>({});
  const [editPendingProductId, setEditPendingProductId] = useState("");
  const [editSelectedProductIds, setEditSelectedProductIds] = useState<string[]>([]);
  const [editQuantitiesByVariant, setEditQuantitiesByVariant] = useState<Record<string, string>>({});
  const [lotActionId, setLotActionId] = useState("");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const firstLiveLot =
    lots.find((lot) => lot.status === "active") ||
    lots.find((lot) => lot.status === "completed") ||
    lots[0];

  const [selectedLotId, setSelectedLotId] = useState(firstLiveLot?.id || "");
  const selectedLot =
    lots.find((lot) => lot.id === selectedLotId) || firstLiveLot;

  const selectedProductGroups = useMemo(
    () =>
      selectedProductIds
        .map((productId) =>
          productGroups.find((product) => product.id === productId),
        )
        .filter((product): product is ProductGroupOption => Boolean(product)),
    [productGroups, selectedProductIds],
  );

  const itemTotal = useMemo(
    () =>
      selectedProductGroups.reduce(
        (groupTotal, product) =>
          groupTotal +
          product.variants.reduce(
            (variantTotal, variant) =>
              variantTotal + intValue(quantitiesByVariant[variant.id] || ""),
            0,
          ),
        0,
      ),
    [quantitiesByVariant, selectedProductGroups],
  );

  const pieceInvestorTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const investor of activeInvestors) totals[investor.id] = 0;
    for (const product of selectedProductGroups) {
      for (const variant of product.variants) {
        for (const investor of activeInvestors) {
          totals[investor.id] =
            (totals[investor.id] || 0) +
            intValue(pieceAssignments[`${variant.id}|||${investor.id}`] || "");
        }
      }
    }
    return totals;
  }, [activeInvestors, pieceAssignments, selectedProductGroups]);

  const participantTotal = useMemo(
    () =>
      distributionMode === "piece_assignment"
        ? (Object.values(pieceInvestorTotals) as number[]).reduce((sum: number, value: number) => sum + value, 0)
        : activeInvestors.reduce(
            (sum, investor) => sum + intValue(unitsByInvestor[investor.id] || ""),
            0,
          ),
    [activeInvestors, distributionMode, pieceInvestorTotals, unitsByInvestor],
  );

  const manualParticipantOrder = useMemo(() => {
    const selectedIds = activeInvestors
      .filter((investor) => intValue(unitsByInvestor[investor.id] || "") > 0)
      .map((investor) => investor.id);
    return [
      ...manualOrder.filter((id) => selectedIds.includes(id)),
      ...selectedIds.filter((id) => !manualOrder.includes(id)),
    ];
  }, [activeInvestors, manualOrder, unitsByInvestor]);

  const pieceAssignmentsValid = useMemo(() => {
    if (distributionMode !== "piece_assignment") return true;
    if (!itemTotal) return false;

    for (const product of selectedProductGroups) {
      for (const variant of product.variants) {
        const expected = intValue(quantitiesByVariant[variant.id] || "");
        if (!expected) continue;
        const assigned = activeInvestors.reduce(
          (sum, investor) =>
            sum + intValue(pieceAssignments[`${variant.id}|||${investor.id}`] || ""),
          0,
        );
        if (assigned !== expected) return false;
      }
    }

    return participantTotal === itemTotal && participantTotal > 0;
  }, [
    activeInvestors,
    distributionMode,
    itemTotal,
    participantTotal,
    pieceAssignments,
    quantitiesByVariant,
    selectedProductGroups,
  ]);

  const selectedParticipants = useMemo(
    () =>
      selectedLot
        ? participants
            .filter((item) => item.lotId === selectedLot.id)
            .sort(
              (a, b) =>
                (a.drawPosition || 9999) - (b.drawPosition || 9999),
            )
        : [],
    [participants, selectedLot],
  );

  const selectedQueue = useMemo(
    () =>
      selectedLot
        ? queue
            .filter((item) => item.lotId === selectedLot.id)
            .sort((a, b) => a.slotNumber - b.slotNumber)
        : [],
    [queue, selectedLot],
  );

  const selectedLotItems = useMemo(
    () =>
      selectedLot
        ? lotItems.filter((item) => item.lotId === selectedLot.id)
        : [],
    [lotItems, selectedLot],
  );

  const editSelectedProductGroups = useMemo(
    () =>
      editSelectedProductIds
        .map((productId) => productGroups.find((product) => product.id === productId))
        .filter((product): product is ProductGroupOption => Boolean(product)),
    [editSelectedProductIds, productGroups],
  );

  const editParticipantTotal = useMemo(
    () =>
      investors.reduce(
        (sum, investor) => sum + intValue(editUnitsByInvestor[investor.id] || ""),
        0,
      ),
    [editUnitsByInvestor, investors],
  );

  const editItemTotal = useMemo(
    () =>
      editSelectedProductGroups.reduce(
        (groupTotal, product) =>
          groupTotal +
          product.variants.reduce(
            (variantTotal, variant) =>
              variantTotal + intValue(editQuantitiesByVariant[variant.id] || ""),
            0,
          ),
        0,
      ),
    [editQuantitiesByVariant, editSelectedProductGroups],
  );

  const activeLots = lots.filter((lot) => lot.status === "active").length;
  const totalSold = lots.reduce((sum, lot) => sum + lot.soldUnits, 0);
  const totalRemaining = lots.reduce((sum, lot) => sum + lot.remainingUnits, 0);

  async function submitInvestor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (investorName.trim().length < 2) {
      setErrorMessage("Informe o nome do investidor.");
      return;
    }

    setSavingInvestor(true);
    try {
      const response = await fetch("/api/admin/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: investorName,
          email: investorEmail,
          phone: investorPhone,
        }),
      });

      const data = (await response.json()) as {
        investorId?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível cadastrar.");
      }

      setInvestorName("");
      setInvestorEmail("");
      setInvestorPhone("");
      setMessage("Investidor cadastrado com sucesso.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erro ao cadastrar investidor.",
      );
    } finally {
      setSavingInvestor(false);
    }
  }

  function startEditInvestor(investor: InvestorView) {
    setEditingInvestorId(investor.id);
    setEditInvestorName(investor.name);
    setEditInvestorEmail(investor.email || "");
    setEditInvestorPhone(investor.phone || "");
    setEditInvestorActive(investor.active);
    setMessage("");
    setErrorMessage("");
  }

  function cancelEditInvestor() {
    setEditingInvestorId("");
  }

  async function saveInvestorEdit(investor: InvestorView) {
    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/investors/${investor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editInvestorName,
          email: editInvestorEmail,
          phone: editInvestorPhone,
          active: editInvestorActive,
        }),
      });
      const data = (await response.json()) as { error?: string; accessWasUnlinked?: boolean };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o investidor.");
      setEditingInvestorId("");
      setMessage(
        data.accessWasUnlinked
          ? "Investidor atualizado. Como o e-mail mudou, o acesso antigo foi removido; libere o acesso novamente para o novo e-mail."
          : "Investidor atualizado com sucesso.",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao atualizar investidor.");
    } finally {
      setInvestorActionId("");
    }
  }

  async function archiveInvestorById(investor: InvestorView) {
    if (!window.confirm(`Arquivar ${investor.name}? Ele sairá dos novos lotes e da lista principal, mas todo o histórico será preservado.`)) return;
    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/investors/${investor.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível arquivar o investidor.");
      setMessage("Investidor arquivado. O histórico foi preservado.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao arquivar investidor.");
    } finally {
      setInvestorActionId("");
    }
  }

  async function deleteInvestorPermanently(investor: InvestorView) {
    if (
      !window.confirm(
        `Excluir definitivamente o cadastro de ${investor.name}?\n\nIsso só será permitido se ele nunca tiver participado de lote, venda, peça atribuída ou movimentação de caixa. Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/admin/investors/${investor.id}?permanent=1`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { error?: string; deleted?: boolean };
      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível excluir definitivamente o investidor.",
        );
      }

      setMessage("Cadastro do investidor excluído definitivamente.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Erro ao excluir definitivamente o investidor.",
      );
    } finally {
      setInvestorActionId("");
    }
  }

  async function restoreInvestor(investor: InvestorView) {
    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/investors/${investor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: investor.name,
          email: investor.email || "",
          phone: investor.phone || "",
          active: true,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível reativar o investidor.");
      setMessage("Investidor reativado. Ele já pode participar de novos lotes.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao reativar investidor.");
    } finally {
      setInvestorActionId("");
    }
  }

  async function enableInvestorAccess(investor: InvestorView) {
    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/investors/${investor.id}/access`, { method: "POST" });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível liberar o acesso.");
      setMessage(data.message || "Acesso do investidor liberado.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao liberar acesso.");
    } finally {
      setInvestorActionId("");
    }
  }

  async function sendInvestorWhatsAppInvite(investor: InvestorView) {
    if (!investor.phone?.trim()) {
      setErrorMessage("Cadastre o telefone/WhatsApp deste investidor primeiro.");
      return;
    }
    if (!investor.email?.trim()) {
      setErrorMessage("Cadastre o e-mail deste investidor. Ele será usado para entrar no portal depois de criar a senha.");
      return;
    }

    const whatsappWindow = window.open("about:blank", "_blank");
    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/investors/${investor.id}/invite-link`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        mode?: "invite" | "existing_admin_account";
        inviteUrl?: string;
        whatsappUrl?: string;
        expiresAt?: string | null;
      };
      if (!response.ok || !data.inviteUrl || !data.whatsappUrl) {
        throw new Error(data.error || "Não foi possível preparar o acesso por WhatsApp.");
      }

      setGeneratedInviteLinks((current) => ({
        ...current,
        [investor.id]: { inviteUrl: data.inviteUrl!, expiresAt: data.expiresAt, mode: data.mode },
      }));
      setMessage(
        data.mode === "existing_admin_account"
          ? `${investor.name} também é administrador. O Portal do Investidor foi vinculado à mesma conta e usa a mesma senha.`
          : `Novo link criado para ${investor.name}. Ele vale por 7 dias e só pode ser usado uma vez.`,
      );
      if (whatsappWindow) {
        whatsappWindow.opener = null;
        whatsappWindow.location.href = data.whatsappUrl;
      } else {
        window.location.href = data.whatsappUrl;
      }
      router.refresh();
    } catch (error) {
      whatsappWindow?.close();
      setErrorMessage(
        error instanceof Error ? error.message : "Erro ao gerar convite por WhatsApp.",
      );
    } finally {
      setInvestorActionId("");
    }
  }

  async function copyGeneratedInvite(investor: InvestorView) {
    const invite = generatedInviteLinks[investor.id];
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setMessage(`Link de ${investor.name} copiado.`);
      setErrorMessage("");
    } catch {
      setErrorMessage("Não foi possível copiar automaticamente. Gere o convite novamente pelo WhatsApp.");
    }
  }

  function moveManualInvestor(investorId: string, direction: -1 | 1) {
    const current = [...manualParticipantOrder];
    const index = current.indexOf(investorId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    setManualOrder(current);
  }

  async function revokeInvestorAccess(investor: InvestorView) {
    if (!window.confirm(`Bloquear o acesso de ${investor.name} ao Portal do Investidor?`)) return;
    setInvestorActionId(investor.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/investors/${investor.id}/access`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível bloquear o acesso.");
      setMessage("Acesso ao Portal do Investidor bloqueado.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao bloquear acesso.");
    } finally {
      setInvestorActionId("");
    }
  }

  function portalStatusLabel(status: InvestorView["portalStatus"]) {
    if (status === "active") return "Portal ativo";
    if (status === "invited") return "Convite enviado";
    if (status === "disabled") return "Portal bloqueado";
    return "Sem acesso";
  }

  function addProductGroup() {
    if (!pendingProductId) return;

    const product = productGroups.find((item) => item.id === pendingProductId);
    if (!product) return;

    if (product.unassignedStock <= 0) {
      setErrorMessage(
        "Este modelo não possui peças livres para um novo lote. As peças já estão vinculadas a outro lote ou não há estoque disponível.",
      );
      return;
    }

    setSelectedProductIds((current) =>
      current.includes(pendingProductId)
        ? current
        : [...current, pendingProductId],
    );

    setQuantitiesByVariant((current) => {
      const next = { ...current };
      for (const variant of product.variants) {
        if (!next[variant.id] && variant.unassignedStock > 0) {
          next[variant.id] = String(variant.unassignedStock);
        }
      }
      return next;
    });

    setPendingProductId("");
    setErrorMessage("");
  }

  function updateVariantQuantity(variantId: string, value: string) {
    setQuantitiesByVariant((current) => ({
      ...current,
      [variantId]: value,
    }));
  }

  function updatePieceAssignment(variantId: string, investorId: string, value: string) {
    setPieceAssignments((current) => ({
      ...current,
      [`${variantId}|||${investorId}`]: value,
    }));
  }

  function removeProductGroup(productId: string) {
    const product = productGroups.find((item) => item.id === productId);

    setSelectedProductIds((current) =>
      current.filter((id) => id !== productId),
    );

    if (product) {
      setQuantitiesByVariant((current) => {
        const next = { ...current };
        for (const variant of product.variants) {
          delete next[variant.id];
        }
        return next;
      });
      setPieceAssignments((current) => {
        const next = { ...current };
        for (const variant of product.variants) {
          for (const investor of activeInvestors) {
            delete next[`${variant.id}|||${investor.id}`];
          }
        }
        return next;
      });
    }
  }

  function productGroupTotal(product: ProductGroupOption) {
    return product.variants.reduce(
      (sum, variant) =>
        sum + intValue(quantitiesByVariant[variant.id] || ""),
      0,
    );
  }

  async function createLot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setMessage("");

    const lotParticipants = activeInvestors
      .map((investor) => ({
        investorId: investor.id,
        units:
          distributionMode === "piece_assignment"
            ? pieceInvestorTotals[investor.id] || 0
            : intValue(unitsByInvestor[investor.id] || ""),
      }))
      .filter((item) => item.units > 0);

    const lotItems = selectedProductGroups.flatMap((product) =>
      product.variants
        .map((variant) => ({
          variantId: variant.id,
          quantity: intValue(quantitiesByVariant[variant.id] || ""),
        }))
        .filter((item) => item.quantity > 0),
    );

    const lotPieceAssignments =
      distributionMode === "piece_assignment"
        ? selectedProductGroups.flatMap((product) =>
            product.variants.flatMap((variant) =>
              activeInvestors
                .map((investor) => ({
                  variantId: variant.id,
                  investorId: investor.id,
                  quantity: intValue(
                    pieceAssignments[`${variant.id}|||${investor.id}`] || "",
                  ),
                }))
                .filter((item) => item.quantity > 0),
            ),
          )
        : [];

    if (lotName.trim().length < 2) {
      setErrorMessage("Informe um nome para o lote.");
      return;
    }

    if (!lotParticipants.length) {
      setErrorMessage(
        distributionMode === "piece_assignment"
          ? "Distribua pelo menos uma peça para um investidor."
          : "Informe a participação de pelo menos um investidor.",
      );
      return;
    }

    if (!lotItems.length) {
      setErrorMessage("Adicione pelo menos uma peça ao lote.");
      return;
    }

    if (participantTotal !== itemTotal) {
      setErrorMessage(
        `As quantidades precisam ser iguais. Investidores: ${participantTotal}. Peças: ${itemTotal}.`,
      );
      return;
    }

    if (distributionMode === "piece_assignment" && !pieceAssignmentsValid) {
      setErrorMessage(
        "Na distribuição por peça, cada variação precisa ser totalmente dividida entre os investidores.",
      );
      return;
    }

    if (
      distributionMode === "manual_order" &&
      manualParticipantOrder.length !== lotParticipants.length
    ) {
      setErrorMessage("Defina a ordem de todos os investidores participantes.");
      return;
    }

    const modeText =
      distributionMode === "manual_order"
        ? "ordem definida pelo administrador"
        : distributionMode === "piece_assignment"
          ? "cada roupa já possui investidor definido"
          : "sorteio automático";

    const confirmation = window.confirm(
      [
        `Criar o lote "${lotName.trim()}"?`,
        "",
        `Total de peças: ${itemTotal}`,
        `Investidores participantes: ${lotParticipants.length}`,
        `Distribuição: ${modeText}`,
        "",
        distributionMode === "random"
          ? "ATENÇÃO: o sorteio será feito uma única vez e ficará travado."
          : distributionMode === "manual_order"
            ? "ATENÇÃO: a ordem definida será gravada e ficará travada depois da ativação."
            : "ATENÇÃO: a propriedade de cada peça ficará gravada e não poderá ser trocada depois da ativação.",
        "O estoque físico não será aumentado; serão usadas peças já cadastradas.",
      ].join("\n"),
    );

    if (!confirmation) return;

    setCreatingLot(true);
    try {
      const response = await fetch("/api/admin/investment-lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lotName,
          participants: lotParticipants,
          items: lotItems,
          distributionMode,
          manualOrder:
            distributionMode === "manual_order" ? manualParticipantOrder : [],
          pieceAssignments: lotPieceAssignments,
        }),
      });

      const data = (await response.json()) as {
        lotId?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível criar o lote.");
      }

      setLotName("");
      setUnitsByInvestor({});
      setPendingProductId("");
      setSelectedProductIds([]);
      setQuantitiesByVariant({});
      setPieceAssignments({});
      setManualOrder([]);
      setDistributionMode("random");
      if (data.lotId) setSelectedLotId(data.lotId);
      setMessage(
        distributionMode === "random"
          ? "Lote criado. O sorteio foi realizado uma única vez e o rodízio já está ativo."
          : distributionMode === "manual_order"
            ? "Lote criado. A ordem definida foi gravada e o rodízio já está ativo."
            : "Lote criado. A propriedade de cada roupa foi gravada e a distribuição já está ativa.",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erro ao criar o lote.",
      );
    } finally {
      setCreatingLot(false);
    }
  }


  function startEditLot(lot: InvestmentLotView) {
    const lotParticipants = participants.filter((item) => item.lotId === lot.id);
    const currentItems = lotItems.filter((item) => item.lotId === lot.id);

    const nextUnits: Record<string, string> = {};
    for (const investor of investors) {
      const participant = lotParticipants.find((item) => item.investorId === investor.id);
      nextUnits[investor.id] = participant ? String(participant.purchasedUnits) : "";
    }

    const nextQuantities: Record<string, string> = {};
    const nextProductIds: string[] = [];
    for (const item of currentItems) {
      nextQuantities[item.variantId] = String(item.quantity);
      const product = productGroups.find((group) =>
        group.variants.some((variant) => variant.id === item.variantId),
      );
      if (product && !nextProductIds.includes(product.id)) {
        nextProductIds.push(product.id);
      }
    }

    setEditingLotId(lot.id);
    setEditLotName(lot.name);
    setEditUnitsByInvestor(nextUnits);
    setEditSelectedProductIds(nextProductIds);
    setEditQuantitiesByVariant(nextQuantities);
    setEditPendingProductId("");
    setMessage("");
    setErrorMessage("");
  }

  function cancelEditLot() {
    setEditingLotId("");
    setEditPendingProductId("");
  }

  function addEditProductGroup() {
    if (!editPendingProductId) return;

    const product = productGroups.find((item) => item.id === editPendingProductId);
    if (!product) return;

    if (product.unassignedStock <= 0) {
      setErrorMessage(
        "Este modelo não possui peças livres para acrescentar ao lote.",
      );
      return;
    }

    setEditSelectedProductIds((current) =>
      current.includes(editPendingProductId)
        ? current
        : [...current, editPendingProductId],
    );

    setEditQuantitiesByVariant((current) => {
      const next = { ...current };
      for (const variant of product.variants) {
        if (!next[variant.id] && variant.unassignedStock > 0) {
          next[variant.id] = String(variant.unassignedStock);
        }
      }
      return next;
    });

    setEditPendingProductId("");
    setErrorMessage("");
  }

  function updateEditVariantQuantity(variantId: string, value: string) {
    setEditQuantitiesByVariant((current) => ({
      ...current,
      [variantId]: value,
    }));
  }

  function removeEditProductGroup(productId: string) {
    const product = productGroups.find((item) => item.id === productId);
    setEditSelectedProductIds((current) => current.filter((id) => id !== productId));

    if (product) {
      setEditQuantitiesByVariant((current) => {
        const next = { ...current };
        for (const variant of product.variants) {
          delete next[variant.id];
        }
        return next;
      });
    }
  }

  function editProductGroupTotal(product: ProductGroupOption) {
    return product.variants.reduce(
      (sum, variant) => sum + intValue(editQuantitiesByVariant[variant.id] || ""),
      0,
    );
  }

  async function saveLotEdit(lot: InvestmentLotView) {
    setMessage("");
    setErrorMessage("");

    const lotParticipants = investors
      .map((investor) => ({
        investorId: investor.id,
        units: intValue(editUnitsByInvestor[investor.id] || ""),
      }))
      .filter((item) => item.units > 0);

    const lotEditItems = editSelectedProductGroups.flatMap((product) =>
      product.variants
        .map((variant) => ({
          variantId: variant.id,
          quantity: intValue(editQuantitiesByVariant[variant.id] || ""),
        }))
        .filter((item) => item.quantity > 0),
    );

    if (editLotName.trim().length < 2) {
      setErrorMessage("Informe um nome válido para o lote.");
      return;
    }

    if (!lotParticipants.length || !lotEditItems.length) {
      setErrorMessage("O lote precisa ter pelo menos um investidor e uma peça.");
      return;
    }

    if (editParticipantTotal !== editItemTotal) {
      setErrorMessage(
        `As quantidades precisam ser iguais. Investidores: ${editParticipantTotal}. Peças: ${editItemTotal}.`,
      );
      return;
    }

    const confirmation = window.confirm(
      [
        `Salvar as alterações do lote "${lot.name}"?`,
        "",
        `Novo total: ${editItemTotal} peça(s)`,
        `Já vendidas: ${lot.soldUnits}`,
        "",
        "A ordem já consumida será preservada. O sistema ajustará somente as posições futuras necessárias.",
      ].join("\n"),
    );
    if (!confirmation) return;

    setLotActionId(lot.id);
    try {
      const response = await fetch(`/api/admin/investment-lots/${lot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editLotName,
          participants: lotParticipants,
          items: lotEditItems,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível atualizar o lote.");
      }

      setEditingLotId("");
      setMessage(
        "Lote atualizado com sucesso. Os vínculos das peças e as próximas posições do rodízio foram ajustados sem alterar o estoque físico.",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erro ao atualizar o lote.",
      );
    } finally {
      setLotActionId("");
    }
  }

  async function deleteLot(lot: InvestmentLotView) {
    const confirmation = window.confirm(
      [
        `Apagar o lote "${lot.name}"?`,
        "",
        "As peças ainda não vendidas serão liberadas do lote e continuarão no estoque normal da loja.",
        "Vendas já realizadas e auditoria serão preservadas por segurança.",
        "",
        "Esta ação não deve ser usada para cancelar uma venda individual.",
      ].join("\n"),
    );
    if (!confirmation) return;

    setLotActionId(lot.id);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/admin/investment-lots/${lot.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível apagar o lote.");
      }

      setEditingLotId("");
      setSelectedLotId("");
      setMessage(
        "Lote apagado do gerenciamento. O histórico de vendas já realizadas foi preservado.",
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao apagar o lote.");
    } finally {
      setLotActionId("");
    }
  }

  return (
    <div className="investment-root">
      {(message || errorMessage) && (
        <div
          className={`investment-feedback ${errorMessage ? "error" : "ok"}`}
          role="status"
        >
          {errorMessage || message}
        </div>
      )}

      <section className="investment-stats">
        <article>
          <span>Investidores ativos</span>
          <strong>{activeInvestors.length}</strong>
          <small>{investors.length} cadastrado(s)</small>
        </article>
        <article>
          <span>Lotes em andamento</span>
          <strong>{activeLots}</strong>
          <small>{lots.length} lote(s) no histórico</small>
        </article>
        <article>
          <span>Vendas distribuídas</span>
          <strong>{totalSold}</strong>
          <small>participações atualmente válidas</small>
        </article>
        <article>
          <span>Peças restantes</span>
          <strong>{totalRemaining}</strong>
          <small>nos lotes acompanhados</small>
        </article>
      </section>

      <section className="investment-grid">
        <form className="investment-card" onSubmit={submitInvestor}>
          <header>
            <div>
              <span className="investment-kicker">CADASTRO</span>
              <h2>Novo investidor</h2>
            </div>
          </header>

          <label>
            <span>Nome *</span>
            <input
              value={investorName}
              onChange={(event) => setInvestorName(event.target.value)}
              maxLength={120}
              placeholder="Ex.: Carlos"
              required
            />
          </label>

          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={investorEmail}
              onChange={(event) => setInvestorEmail(event.target.value)}
              maxLength={200}
              placeholder="Opcional nesta etapa"
            />
          </label>

          <label>
            <span>Telefone</span>
            <input
              value={investorPhone}
              onChange={(event) => setInvestorPhone(event.target.value)}
              maxLength={40}
              placeholder="Opcional"
            />
          </label>

          <button
            type="submit"
            className="button button-dark"
            disabled={savingInvestor}
          >
            {savingInvestor ? "Salvando..." : "Cadastrar investidor"}
          </button>

          {archivedInvestorsCount > 0 ? (
            <div className="investment-investor-list-tools">
              <span>
                {activeInvestors.length} ativo(s)
                {archivedInvestorsCount ? ` · ${archivedInvestorsCount} arquivado(s)` : ""}
              </span>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setShowArchivedInvestors((current) => !current)}
              >
                {showArchivedInvestors ? "Ocultar arquivados" : "Mostrar arquivados"}
              </button>
            </div>
          ) : null}

          <div className="investment-mini-list investment-investor-admin-list">
            {visibleInvestors.length ? (
              visibleInvestors.map((investor) => (
                <article className="investment-investor-admin" key={investor.id}>
                  {editingInvestorId === investor.id ? (
                    <div className="investment-investor-edit">
                      <label>
                        <span>Nome</span>
                        <input value={editInvestorName} onChange={(event) => setEditInvestorName(event.target.value)} maxLength={120} />
                      </label>
                      <label>
                        <span>E-mail</span>
                        <input type="email" value={editInvestorEmail} onChange={(event) => setEditInvestorEmail(event.target.value)} maxLength={200} />
                      </label>
                      <label>
                        <span>Telefone</span>
                        <input value={editInvestorPhone} onChange={(event) => setEditInvestorPhone(event.target.value)} maxLength={40} />
                      </label>
                      <label className="investment-investor-active-check">
                        <input type="checkbox" checked={editInvestorActive} onChange={(event) => setEditInvestorActive(event.target.checked)} />
                        <span>Ativo para novos lotes</span>
                      </label>
                      <div className="investment-investor-actions">
                        <button type="button" className="button button-dark" disabled={investorActionId === investor.id} onClick={() => void saveInvestorEdit(investor)}>Salvar</button>
                        <button type="button" className="button button-outline" onClick={cancelEditInvestor}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="investment-investor-summary">
                        <span>
                          <strong>{investor.name}</strong>
                          <small>{investor.code}{investor.email ? ` · ${investor.email}` : " · sem e-mail"}</small>
                        </span>
                        <div className="investment-investor-badges">
                          <b>{investor.active ? "Ativo" : "Arquivado"}</b>
                          <b>{portalStatusLabel(investor.portalStatus)}</b>
                        </div>
                      </div>
                      <div className="investment-investor-actions">
                        <button type="button" className="button button-outline" onClick={() => startEditInvestor(investor)}>Editar</button>
                        {investor.active ? (
                          <>
                            <button type="button" className="button button-outline" disabled={investorActionId === investor.id} onClick={() => void archiveInvestorById(investor)}>Arquivar</button>
                            <button type="button" className="button button-outline" disabled={investorActionId === investor.id} onClick={() => void deleteInvestorPermanently(investor)}>Excluir cadastro</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="button button-outline" disabled={investorActionId === investor.id} onClick={() => void restoreInvestor(investor)}>Reativar</button>
                            <button type="button" className="button button-outline" disabled={investorActionId === investor.id} onClick={() => void deleteInvestorPermanently(investor)}>Excluir cadastro</button>
                          </>
                        )}
                        {investor.active ? (
                          <>
                            <button
                              type="button"
                              className="button button-dark"
                              disabled={investorActionId === investor.id || !investor.phone || !investor.email}
                              onClick={() => void sendInvestorWhatsAppInvite(investor)}
                            >
                              {investor.portalStatus === "active" ? "Novo link por WhatsApp" : "Convite por WhatsApp"}
                            </button>
                            <button
                              type="button"
                              className="button button-outline"
                              disabled={investorActionId === investor.id || !investor.email}
                              onClick={() => void enableInvestorAccess(investor)}
                            >
                              {investor.portalStatus ? "Reenviar por e-mail" : "Convite por e-mail"}
                            </button>
                          </>
                        ) : null}
                        {generatedInviteLinks[investor.id] ? (
                          <button
                            type="button"
                            className="button button-outline"
                            onClick={() => void copyGeneratedInvite(investor)}
                          >
                            Copiar link gerado
                          </button>
                        ) : null}
                        {investor.portalStatus === "active" || investor.portalStatus === "invited" ? (
                          <button type="button" className="button button-outline" disabled={investorActionId === investor.id} onClick={() => void revokeInvestorAccess(investor)}>Bloquear portal</button>
                        ) : null}
                      </div>
                    </>
                  )}
                </article>
              ))
            ) : (
              <p>{showArchivedInvestors ? "Nenhum investidor cadastrado." : "Nenhum investidor ativo nesta lista."}</p>
            )}
          </div>

          <div className="investment-global-rule">
            <strong>Portal separado e seguro</strong>
            <span>
              Normalmente o Portal do Investidor é separado do administrativo. Quando a mesma pessoa também é administradora, a conta pode ser vinculada aos dois acessos e usa o mesmo e-mail e a mesma senha. Para investidores comuns, o link do WhatsApp vale por 7 dias e só pode ser usado uma vez.
            </span>
          </div>
        </form>

        <form className="investment-card investment-lot-form" onSubmit={createLot}>
          <header>
            <div>
              <span className="investment-kicker">COMPRA COMPARTILHADA</span>
              <h2>Novo lote</h2>
            </div>
            <span className="investment-lock">Regra travada após ativar 🔒</span>
          </header>

          <label>
            <span>Nome do lote *</span>
            <input
              value={lotName}
              onChange={(event) => setLotName(event.target.value)}
              maxLength={160}
              placeholder="Ex.: Compra Agosto — Lote 01"
              required
            />
          </label>

          <div className="investment-subsection">
            <div className="investment-subtitle">
              <div>
                <strong>Como será a distribuição?</strong>
                <small>Escolha a regra correta antes de montar o lote.</small>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {[
                { value: "random", title: "Sorteio automático", text: "O sistema sorteia a ordem uma única vez e depois segue o rodízio." },
                { value: "manual_order", title: "Ordem já definida", text: "Você escolhe quem é 1º, 2º, 3º... antes de ativar." },
                { value: "piece_assignment", title: "Cada roupa já tem dono", text: "Você informa exatamente quantas unidades de cada roupa pertencem a cada investidor." },
              ].map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 10,
                    alignItems: "start",
                    border: distributionMode === option.value ? "2px solid #111" : "1px solid #ddd8d0",
                    borderRadius: 10,
                    padding: 12,
                    background: distributionMode === option.value ? "#f7f2eb" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="distribution-mode"
                    value={option.value}
                    checked={distributionMode === option.value}
                    onChange={() =>
                      setDistributionMode(
                        option.value as "random" | "manual_order" | "piece_assignment",
                      )
                    }
                  />
                  <span>
                    <strong style={{ display: "block" }}>{option.title}</strong>
                    <small style={{ color: "#6f6a63" }}>{option.text}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="investment-subsection">
            <div className="investment-subtitle">
              <div>
                <strong>1. Participação de cada investidor</strong>
                <small>Digite quantas peças cada pessoa comprou.</small>
              </div>
              <b>{participantTotal} peça(s)</b>
            </div>

            {activeInvestors.length ? (
              distributionMode === "piece_assignment" ? (
                <div className="investment-participant-inputs">
                  {activeInvestors.map((investor) => (
                    <label key={investor.id}>
                      <span>{investor.name}</span>
                      <input
                        type="number"
                        value={pieceInvestorTotals[investor.id] || 0}
                        readOnly
                        aria-label={`Total já distribuído para ${investor.name}`}
                      />
                      <small>Calculado automaticamente pelas roupas definidas abaixo.</small>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="investment-participant-inputs">
                  {activeInvestors.map((investor) => (
                    <label key={investor.id}>
                      <span>{investor.name}</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="1"
                        inputMode="numeric"
                        value={unitsByInvestor[investor.id] || ""}
                        onChange={(event) =>
                          setUnitsByInvestor((current) => ({
                            ...current,
                            [investor.id]: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              )
            ) : (
              <div className="investment-empty-note">
                Cadastre os investidores antes de criar o primeiro lote.
              </div>
            )}

            {distributionMode === "manual_order" && manualParticipantOrder.length ? (
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                <strong style={{ fontSize: 12 }}>Ordem definida dos investidores</strong>
                {manualParticipantOrder.map((investorId, index) => {
                  const investor = activeInvestors.find((item) => item.id === investorId);
                  if (!investor) return null;
                  return (
                    <div
                      key={investorId}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "36px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: 9,
                        border: "1px solid #ddd8d0",
                        borderRadius: 8,
                        background: "#fff",
                      }}
                    >
                      <b>{index + 1}º</b>
                      <span>{investor.name}</span>
                      <span style={{ display: "flex", gap: 5 }}>
                        <button type="button" className="button button-outline" disabled={index === 0} onClick={() => moveManualInvestor(investorId, -1)}>↑</button>
                        <button type="button" className="button button-outline" disabled={index === manualParticipantOrder.length - 1} onClick={() => moveManualInvestor(investorId, 1)}>↓</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="investment-subsection">
            <div className="investment-subtitle">
              <div>
                <strong>2. Roupas já cadastradas no estoque</strong>
                <small>
                  Escolha o modelo. O sistema já puxa automaticamente as peças
                  livres que foram cadastradas no produto.
                </small>
              </div>
              <b>{itemTotal} peça(s)</b>
            </div>

            <div className="investment-global-rule">
              <strong>O lote não aumenta o estoque</strong>
              <span>
                Primeiro cadastre a quantidade física correta no produto. Aqui
                o sistema apenas vincula essas peças ao lote e ao rodízio.
              </span>
            </div>

            <div className="investment-global-rule">
              <strong>{distributionMode === "piece_assignment" ? "Distribuição por peça" : "Um único rodízio para todo o lote"}</strong>
              <span>
                {distributionMode === "piece_assignment"
                  ? "Cada unidade será vinculada ao investidor definido abaixo. A venda daquela unidade irá diretamente para esse investidor."
                  : "A ordem dos investidores não reinicia quando muda o produto, tamanho ou cor. Cada peça vendida consome apenas a próxima posição da fila geral."}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <strong style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Escolha a roupa pela foto
                </strong>
                <small style={{ color: "#777" }}>
                  Clique na foto do modelo correto e depois em “Adicionar roupa ao lote”.
                </small>
              </div>

              <ProductPhotoPicker
                products={productGroups.filter(
                  (product) => !selectedProductIds.includes(product.id),
                )}
                value={pendingProductId}
                onChange={setPendingProductId}
              />

              <button
                type="button"
                className="button button-outline"
                onClick={addProductGroup}
                disabled={!pendingProductId}
                style={{ alignSelf: "flex-start" }}
              >
                + Adicionar roupa ao lote
              </button>
            </div>

            {selectedProductGroups.length ? (
              <div className="investment-product-groups">
                {selectedProductGroups.map((product) => (
                  <article className="investment-product-group" key={product.id}>
                    <header>
                      <div>
                        <strong>{product.name}</strong>
                        <small>
                          Estoque físico: {product.currentStock} · livre para
                          novo lote: {product.unassignedStock} ·{" "}
                          {product.variants.length} variação(ões)
                        </small>
                      </div>

                      <div className="investment-product-group-actions">
                        <b>{productGroupTotal(product)} peça(s) neste grupo</b>
                        <button
                          type="button"
                          className="investment-remove-group"
                          onClick={() => removeProductGroup(product.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </header>

                    <div className="investment-variant-grid">
                      {product.variants.map((variant) => {
                        const variantQuantity = intValue(quantitiesByVariant[variant.id] || "");
                        const assignedQuantity = activeInvestors.reduce(
                          (sum, investor) =>
                            sum + intValue(pieceAssignments[`${variant.id}|||${investor.id}`] || ""),
                          0,
                        );
                        return (
                          <div
                            className="investment-variant-row"
                            key={variant.id}
                            style={{ display: "grid", gap: 8 }}
                          >
                            <span>
                              <strong>{variant.size} · {variant.color}</strong>
                              <small>
                                {variant.sku} · estoque físico {variant.currentStock} · livre para lote {variant.unassignedStock}
                              </small>
                            </span>

                            <input
                              type="number"
                              min="0"
                              max={variant.unassignedStock}
                              step="1"
                              inputMode="numeric"
                              value={quantitiesByVariant[variant.id] || ""}
                              onChange={(event) =>
                                updateVariantQuantity(variant.id, event.target.value)
                              }
                              placeholder="Qtd. do lote"
                              aria-label={`Quantidade do estoque que entrará no lote: ${product.name}, ${variant.size}, ${variant.color}`}
                            />

                            {distributionMode === "piece_assignment" && variantQuantity > 0 ? (
                              <div
                                style={{
                                  gridColumn: "1 / -1",
                                  display: "grid",
                                  gap: 7,
                                  padding: 10,
                                  borderRadius: 8,
                                  background: "#f7f3ed",
                                  border: assignedQuantity === variantQuantity ? "1px solid #b8cbb9" : "1px solid #e0c7a7",
                                }}
                              >
                                <strong style={{ fontSize: 11 }}>
                                  Defina os donos — {assignedQuantity}/{variantQuantity} distribuída(s)
                                </strong>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 7 }}>
                                  {activeInvestors.map((investor) => (
                                    <label key={investor.id} style={{ display: "grid", gap: 4, fontSize: 10 }}>
                                      <span>{investor.name}</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max={variantQuantity}
                                        step="1"
                                        inputMode="numeric"
                                        value={pieceAssignments[`${variant.id}|||${investor.id}`] || ""}
                                        onChange={(event) =>
                                          updatePieceAssignment(variant.id, investor.id, event.target.value)
                                        }
                                        placeholder="0"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="investment-empty-note">
                Adicione um modelo de roupa para informar as quantidades do
                grupo.
              </div>
            )}
          </div>

          <div
            className={`investment-balance ${
              participantTotal > 0 && participantTotal === itemTotal
                ? "balanced"
                : ""
            }`}
          >
            <span>
              Investidores: <strong>{participantTotal}</strong>
            </span>
            <span>
              Peças: <strong>{itemTotal}</strong>
            </span>
            <b>
              {participantTotal > 0 && participantTotal === itemTotal
                ? "Quantidades conferidas ✓"
                : "Os dois totais precisam ser iguais"}
            </b>
          </div>

          <div className="investment-warning">
            {distributionMode === "random"
              ? "Ao confirmar, o banco sorteia a ordem uma única vez e trava o rodízio."
              : distributionMode === "manual_order"
                ? "Ao confirmar, a ordem definida acima é gravada e fica travada para preservar o histórico."
                : "Ao confirmar, cada unidade fica vinculada ao investidor definido. Essa propriedade não é trocada depois da ativação."}
            {" "}O lote usa somente peças que já existem no estoque; a quantidade física não aumenta.
          </div>

          <button
            type="submit"
            className="button button-dark"
            disabled={
              creatingLot ||
              !activeInvestors.length ||
              participantTotal <= 0 ||
              participantTotal !== itemTotal ||
              (distributionMode === "piece_assignment" && !pieceAssignmentsValid)
            }
          >
            {creatingLot
              ? "Criando lote..."
              : distributionMode === "random"
                ? "Criar lote e sortear rodízio"
                : distributionMode === "manual_order"
                  ? "Criar lote com ordem definida"
                  : "Criar lote com peças definidas"}
          </button>
        </form>
      </section>

      <section className="investment-card investment-live-card">
        <header>
          <div>
            <span className="investment-kicker">RODÍZIO AO VIVO</span>
            <h2>Quem é o próximo?</h2>
          </div>

          <div className="investment-lot-header-actions">
            {lots.length > 0 && (
              <select
                className="investment-lot-select"
                value={selectedLot?.id || ""}
                onChange={(event) => {
                  setSelectedLotId(event.target.value);
                  setEditingLotId("");
                }}
                aria-label="Selecionar lote"
              >
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.code} — {lot.name} — {statusLabel(lot.status)}
                  </option>
                ))}
              </select>
            )}

            {selectedLot ? (
              <div className="investment-lot-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => startEditLot(selectedLot)}
                  disabled={
                    lotActionId === selectedLot.id ||
                    selectedLot.distributionRule === "piece_assignment"
                  }
                  title={
                    selectedLot.distributionRule === "piece_assignment"
                      ? "A distribuição por peça fica travada após a ativação. Apague e recrie o lote se houve erro antes das vendas."
                      : undefined
                  }
                >
                  {selectedLot.distributionRule === "piece_assignment" ? "Distribuição travada" : "Editar lote"}
                </button>
                <button
                  type="button"
                  className="button button-outline investment-danger-button"
                  onClick={() => void deleteLot(selectedLot)}
                  disabled={lotActionId === selectedLot.id}
                >
                  Apagar lote
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {!selectedLot ? (
          <div className="investment-empty-note">
            Ainda não existe lote. Depois do primeiro sorteio, a fila aparecerá
            aqui.
          </div>
        ) : (
          <>
            <div className="investment-live-hero">
              <div>
                <span>{selectedLot.distributionRule === "piece_assignment" ? "DISTRIBUIÇÃO" : "VEZ ATUAL"}</span>
                <strong>
                  {selectedLot.distributionRule === "piece_assignment"
                    ? "Peças já definidas"
                    : selectedLot.currentInvestorName || "Rodízio concluído"}
                </strong>
                <small>
                  {selectedLot.distributionRule === "piece_assignment"
                    ? "Cada roupa pertence ao investidor definido no lote"
                    : selectedLot.currentSlotNumber
                      ? `Posição ${selectedLot.currentSlotNumber} de ${selectedLot.totalUnits}`
                      : statusLabel(selectedLot.status)}
                </small>
              </div>

              <div>
                <span>{selectedLot.distributionRule === "piece_assignment" ? "REGRA" : "PRÓXIMO"}</span>
                <strong>
                  {selectedLot.distributionRule === "piece_assignment"
                    ? "Sem fila geral"
                    : selectedLot.nextInvestorName || "—"}
                </strong>
                <small>
                  {selectedLot.distributionRule === "piece_assignment"
                    ? "A venda segue o dono da unidade"
                    : selectedLot.nextSlotNumber
                      ? `Posição ${selectedLot.nextSlotNumber}`
                      : "Sem próxima posição"}
                </small>
              </div>

              <div>
                <span>PROGRESSO</span>
                <strong>
                  {selectedLot.soldUnits}/{selectedLot.totalUnits}
                </strong>
                <small>{selectedLot.remainingUnits} restante(s)</small>
              </div>
            </div>

            <div className="investment-progress" aria-label="Progresso do lote">
              <i
                style={{
                  width: `${
                    selectedLot.totalUnits
                      ? Math.min(
                          100,
                          Math.round(
                            (selectedLot.soldUnits / selectedLot.totalUnits) *
                              100,
                          ),
                        )
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="investment-live-meta">
              <span>
                <strong>{selectedLot.code}</strong> · {selectedLot.name}
              </span>
              <span>
                Ativado: <strong>{shortDate(selectedLot.activatedAt)}</strong>
              </span>
              <span>
                Status: <strong>{statusLabel(selectedLot.status)}</strong>
              </span>
              <span>
                Regra: <strong>{selectedLot.distributionRule === "round_robin_manual" ? "Ordem definida" : selectedLot.distributionRule === "piece_assignment" ? "Peças definidas" : "Sorteio automático"}</strong>
              </span>
            </div>

            {editingLotId === selectedLot.id ? (
              <div className="investment-lot-editor">
                <div className="investment-lot-editor-heading">
                  <div>
                    <span className="investment-kicker">EDIÇÃO DO LOTE</span>
                    <h3>Corrigir lote</h3>
                    <p>
                      Você pode corrigir nome, quantidade de cada investidor e as roupas do lote.
                      O sistema preserva vendas já feitas e ajusta somente o estoque e a fila futura.
                    </p>
                  </div>
                  <b>{selectedLot.soldUnits} já vendida(s)</b>
                </div>

                <label>
                  <span>Nome do lote</span>
                  <input
                    value={editLotName}
                    onChange={(event) => setEditLotName(event.target.value)}
                    maxLength={160}
                  />
                </label>

                <div className="investment-subsection">
                  <div className="investment-subtitle">
                    <div>
                      <strong>Quantidade por investidor</strong>
                      <small>
                        Não é possível reduzir um investidor para menos do que ele já recebeu em vendas confirmadas.
                      </small>
                    </div>
                    <b>{editParticipantTotal} peça(s)</b>
                  </div>

                  <div className="investment-participant-inputs">
                    {investors.map((investor) => {
                      const currentParticipant = participants.find(
                        (item) =>
                          item.lotId === selectedLot.id &&
                          item.investorId === investor.id,
                      );
                      const sold = currentParticipant?.soldUnits || 0;
                      const canUseInvestor = investor.active || Boolean(currentParticipant);

                      return (
                        <label key={investor.id}>
                          <span>
                            {investor.name}
                            {!investor.active ? " · inativo" : ""}
                          </span>
                          <input
                            type="number"
                            min={sold}
                            max="10000"
                            step="1"
                            inputMode="numeric"
                            value={editUnitsByInvestor[investor.id] || ""}
                            onChange={(event) =>
                              setEditUnitsByInvestor((current) => ({
                                ...current,
                                [investor.id]: event.target.value,
                              }))
                            }
                            placeholder="0"
                            disabled={!canUseInvestor}
                          />
                          {!canUseInvestor ? (
                            <small>Reative o investidor para adicioná-lo a este lote.</small>
                          ) : sold > 0 ? (
                            <small>Mínimo: {sold} já vendida(s)</small>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="investment-subsection">
                  <div className="investment-subtitle">
                    <div>
                      <strong>Roupas e quantidades</strong>
                      <small>
                        Aumentar usa peças livres que já existem no estoque; reduzir apenas libera peças do lote, sem alterar o estoque físico.
                      </small>
                    </div>
                    <b>{editItemTotal} peça(s)</b>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <strong style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                        Adicionar outra roupa pela foto
                      </strong>
                      <small style={{ color: "#777" }}>
                        Clique no modelo que deseja acrescentar ao lote.
                      </small>
                    </div>

                    <ProductPhotoPicker
                      products={productGroups.filter(
                        (product) => !editSelectedProductIds.includes(product.id),
                      )}
                      value={editPendingProductId}
                      onChange={setEditPendingProductId}
                    />

                    <button
                      type="button"
                      className="button button-outline"
                      onClick={addEditProductGroup}
                      disabled={!editPendingProductId}
                      style={{ alignSelf: "flex-start" }}
                    >
                      + Adicionar roupa ao lote
                    </button>
                  </div>

                  {editSelectedProductGroups.length ? (
                    <div className="investment-product-groups">
                      {editSelectedProductGroups.map((product) => (
                        <article className="investment-product-group" key={product.id}>
                          <header>
                            <div>
                              <strong>{product.name}</strong>
                              <small>
                                Estoque físico: {product.currentStock} · livre para
                                acrescentar: {product.unassignedStock}
                              </small>
                            </div>
                            <div className="investment-product-group-actions">
                              <b>{editProductGroupTotal(product)} peça(s)</b>
                              <button
                                type="button"
                                className="investment-remove-group"
                                onClick={() => removeEditProductGroup(product.id)}
                              >
                                Remover
                              </button>
                            </div>
                          </header>

                          <div className="investment-variant-grid">
                            {product.variants.map((variant) => {
                              const originalQuantity =
                                selectedLotItems.find(
                                  (item) => item.variantId === variant.id,
                                )?.quantity || 0;
                              return (
                                <label className="investment-variant-row" key={variant.id}>
                                  <span>
                                    <strong>{variant.size} · {variant.color}</strong>
                                    <small>
                                      {variant.sku} · no lote atual {originalQuantity} ·
                                      livre fora do lote {variant.unassignedStock}
                                    </small>
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={originalQuantity + variant.unassignedStock}
                                    step="1"
                                    inputMode="numeric"
                                    value={editQuantitiesByVariant[variant.id] || ""}
                                    onChange={(event) =>
                                      updateEditVariantQuantity(
                                        variant.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="0"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="investment-empty-note">
                      O lote precisa manter pelo menos um grupo de roupas.
                    </div>
                  )}
                </div>

                <div
                  className={`investment-balance ${
                    editParticipantTotal > 0 &&
                    editParticipantTotal === editItemTotal
                      ? "balanced"
                      : ""
                  }`}
                >
                  <span>
                    Investidores: <strong>{editParticipantTotal}</strong>
                  </span>
                  <span>
                    Peças: <strong>{editItemTotal}</strong>
                  </span>
                  <b>
                    {editParticipantTotal > 0 &&
                    editParticipantTotal === editItemTotal
                      ? "Quantidades conferidas ✓"
                      : "Os dois totais precisam ser iguais"}
                  </b>
                </div>

                <div className="investment-lot-editor-actions">
                  <button
                    type="button"
                    className="button button-dark"
                    disabled={
                      lotActionId === selectedLot.id ||
                      editParticipantTotal <= 0 ||
                      editParticipantTotal !== editItemTotal
                    }
                    onClick={() => void saveLotEdit(selectedLot)}
                  >
                    {lotActionId === selectedLot.id
                      ? "Salvando..."
                      : "Salvar alterações do lote"}
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={cancelEditLot}
                    disabled={lotActionId === selectedLot.id}
                  >
                    Cancelar edição
                  </button>
                </div>
              </div>
            ) : null}

            <div className="investment-participant-table">
              <div className="investment-table-head">
                <span>Ordem</span>
                <span>Investidor</span>
                <span>Comprou</span>
                <span>Vendidas</span>
                <span>Restam</span>
                <span>Próxima posição</span>
              </div>

              {selectedParticipants.map((item) => (
                <div className="investment-table-row" key={item.investorId}>
                  <span>{item.drawPosition ? `${item.drawPosition}º` : "—"}</span>
                  <strong>{item.investorName}</strong>
                  <span>{item.purchasedUnits}</span>
                  <span>{item.soldUnits}</span>
                  <span>{item.remainingUnits}</span>
                  <span>
                    {item.nextSlotNumber ? `#${item.nextSlotNumber}` : "Finalizado"}
                  </span>
                </div>
              ))}
            </div>

            <div className="investment-queue-title">
              <div>
                <h3>Sequência completa</h3>
                <p>
                  Todos conseguem conferir o que já vendeu, onde a fila está e
                  quais são as próximas posições.
                </p>
              </div>
            </div>

            <div className="investment-queue">
              {selectedQueue.map((item) => (
                <article
                  key={item.slotId}
                  className={`investment-queue-item ${item.slotStatus}`}
                >
                  <b>#{item.slotNumber}</b>
                  <div>
                    <strong>{item.investorName}</strong>
                    <small>{sourceLabel(item)}</small>
                  </div>
                  <span>{slotLabel(item.slotStatus)}</span>
                  <small>{item.soldAt ? shortDate(item.soldAt) : ""}</small>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <style jsx>{`
        .investment-root {
          display: grid;
          gap: 22px;
        }

        .investment-feedback {
          padding: 14px 16px;
          border: 1px solid;
          border-radius: 14px;
          font-weight: 700;
        }

        .investment-feedback.ok {
          border-color: #b7dbc1;
          background: #f1faf4;
          color: #195d2d;
        }

        .investment-feedback.error {
          border-color: #ecc1c1;
          background: #fff4f4;
          color: #8b1f1f;
        }

        .investment-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .investment-stats article,
        .investment-card {
          border: 1px solid rgba(20, 20, 20, 0.1);
          border-radius: 18px;
          background: #fff;
        }

        .investment-stats article {
          display: grid;
          gap: 6px;
          padding: 18px;
        }

        .investment-stats span,
        .investment-kicker {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.64;
        }

        .investment-stats strong {
          font-size: 30px;
        }

        .investment-stats small {
          opacity: 0.62;
        }

        .investment-grid {
          display: grid;
          grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.5fr);
          gap: 18px;
          align-items: start;
        }

        .investment-card {
          display: grid;
          gap: 16px;
          padding: 20px;
        }

        .investment-card header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .investment-card h2,
        .investment-card h3 {
          margin: 4px 0 0;
        }

        .investment-card label {
          display: grid;
          gap: 7px;
        }

        .investment-card label > span {
          font-size: 12px;
          font-weight: 800;
        }

        .investment-card input,
        .investment-card select {
          width: 100%;
          box-sizing: border-box;
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid rgba(20, 20, 20, 0.16);
          border-radius: 11px;
          background: #fff;
          color: inherit;
          font: inherit;
        }

        .investment-mini-list {
          display: grid;
          gap: 7px;
          margin-top: 4px;
          max-height: 290px;
          overflow: auto;
        }

        .investment-mini-list > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(20, 20, 20, 0.08);
          border-radius: 11px;
        }

        .investment-mini-list > div > span {
          display: grid;
          gap: 2px;
        }

        .investment-mini-list small {
          opacity: 0.55;
        }

        .investment-mini-list b {
          font-size: 11px;
        }

        .investment-lock {
          padding: 8px 10px;
          border-radius: 999px;
          background: #f5f1ea;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .investment-subsection {
          display: grid;
          gap: 12px;
          padding: 15px;
          border: 1px solid rgba(20, 20, 20, 0.08);
          border-radius: 14px;
          background: #faf9f7;
        }

        .investment-subtitle {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .investment-subtitle > div {
          display: grid;
          gap: 3px;
        }

        .investment-subtitle small {
          opacity: 0.65;
        }

        .investment-participant-inputs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .investment-global-rule {
          display: grid;
          gap: 4px;
          padding: 12px 14px;
          border: 1px solid #c9dfcf;
          border-radius: 12px;
          background: #f1faf4;
        }

        .investment-global-rule strong {
          font-size: 13px;
        }

        .investment-global-rule span {
          font-size: 12px;
          line-height: 1.5;
          opacity: 0.72;
        }

        .investment-product-adder {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 9px;
        }

        .investment-product-groups {
          display: grid;
          gap: 12px;
        }

        .investment-product-group {
          overflow: hidden;
          border: 1px solid rgba(20, 20, 20, 0.1);
          border-radius: 14px;
          background: #fff;
        }

        .investment-product-group > header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 14px;
          border-bottom: 1px solid rgba(20, 20, 20, 0.08);
          background: #f6f4f0;
        }

        .investment-product-group > header > div:first-child {
          display: grid;
          gap: 3px;
        }

        .investment-product-group > header small {
          opacity: 0.62;
        }

        .investment-product-group-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .investment-product-group-actions b {
          font-size: 12px;
          white-space: nowrap;
        }

        .investment-remove-group {
          padding: 7px 9px;
          border: 1px solid rgba(20, 20, 20, 0.12);
          border-radius: 9px;
          background: #fff;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
        }

        .investment-variant-grid {
          display: grid;
          gap: 0;
        }

        .investment-variant-row {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 120px;
          align-items: center;
          gap: 12px !important;
          padding: 11px 14px;
        }

        .investment-variant-row + .investment-variant-row {
          border-top: 1px solid rgba(20, 20, 20, 0.07);
        }

        .investment-variant-row > span {
          display: grid;
          gap: 2px;
        }

        .investment-variant-row > span > strong {
          font-size: 13px;
        }

        .investment-variant-row > span > small {
          font-size: 11px;
          opacity: 0.62;
        }

        .investment-variant-row input {
          min-height: 40px;
          text-align: center;
        }

        .investment-balance {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          padding: 13px 14px;
          border: 1px solid #ead2a1;
          border-radius: 13px;
          background: #fff9ed;
        }

        .investment-balance.balanced {
          border-color: #b8dcc2;
          background: #f1faf4;
        }

        .investment-balance b {
          margin-left: auto;
        }

        .investment-warning {
          padding: 13px 14px;
          border-left: 4px solid #23211f;
          background: #f5f3ef;
          font-size: 13px;
          line-height: 1.55;
        }

        .investment-empty-note {
          padding: 18px;
          border: 1px dashed rgba(20, 20, 20, 0.18);
          border-radius: 13px;
          text-align: center;
          opacity: 0.68;
        }

        .investment-live-card {
          gap: 20px;
        }

        .investment-lot-select {
          max-width: 430px;
        }

        .investment-live-hero {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          gap: 10px;
        }

        .investment-live-hero > div {
          display: grid;
          gap: 5px;
          padding: 18px;
          border-radius: 15px;
          background: #f7f5f1;
        }

        .investment-live-hero > div:first-child {
          background: #171614;
          color: #fff;
        }

        .investment-live-hero span {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.09em;
          opacity: 0.62;
        }

        .investment-live-hero strong {
          font-size: 22px;
        }

        .investment-live-hero small {
          opacity: 0.68;
        }

        .investment-progress {
          height: 12px;
          overflow: hidden;
          border-radius: 999px;
          background: #ece9e3;
        }

        .investment-progress i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #171614;
          transition: width 0.3s ease;
        }

        .investment-live-meta {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          font-size: 12px;
          opacity: 0.76;
        }

        .investment-participant-table {
          display: grid;
          overflow-x: auto;
          border: 1px solid rgba(20, 20, 20, 0.08);
          border-radius: 13px;
        }

        .investment-table-head,
        .investment-table-row {
          display: grid;
          grid-template-columns: 70px minmax(160px, 1.4fr) repeat(4, minmax(90px, 0.75fr));
          min-width: 760px;
          align-items: center;
          gap: 8px;
          padding: 11px 13px;
        }

        .investment-table-head {
          background: #f4f2ee;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .investment-table-row + .investment-table-row {
          border-top: 1px solid rgba(20, 20, 20, 0.07);
        }

        .investment-queue-title p {
          margin: 5px 0 0;
          opacity: 0.64;
        }

        .investment-queue {
          display: grid;
          gap: 7px;
          max-height: 520px;
          overflow: auto;
        }

        .investment-queue-item {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr) 100px 135px;
          align-items: center;
          gap: 10px;
          padding: 11px 13px;
          border: 1px solid rgba(20, 20, 20, 0.08);
          border-radius: 12px;
        }

        .investment-queue-item > div {
          display: grid;
          gap: 2px;
        }

        .investment-queue-item small {
          opacity: 0.58;
        }

        .investment-queue-item.allocated {
          background: #f2faf4;
          border-color: #c8e3cf;
        }

        .investment-queue-item.reversed {
          background: #fff7f0;
          border-color: #ecd3bd;
        }

        .investment-queue-item.pending:first-of-type {
          border-color: #171614;
        }

        @media (max-width: 1050px) {
          .investment-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .investment-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .investment-stats,
          .investment-participant-inputs,
          .investment-live-hero {
            grid-template-columns: 1fr;
          }

          .investment-card header,
          .investment-subtitle {
            flex-direction: column;
          }

          .investment-lot-select {
            max-width: none;
          }

          .investment-product-adder {
            grid-template-columns: 1fr;
          }

          .investment-product-group > header,
          .investment-product-group-actions {
            align-items: flex-start;
            flex-direction: column;
          }

          .investment-variant-row {
            grid-template-columns: minmax(0, 1fr) 100px;
          }

          .investment-balance b {
            width: 100%;
            margin-left: 0;
          }

          .investment-queue-item {
            grid-template-columns: 46px minmax(0, 1fr);
          }

          .investment-queue-item > span,
          .investment-queue-item > small {
            grid-column: 2;
          }
        }

        .investment-investor-list-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,.08); }
        .investment-investor-list-tools span { font-size: 10px; color: #6c6963; }
        .investment-investor-list-tools .button { padding: 7px 10px; min-height: 32px; font-size: 10px; }
        .investment-investor-admin-list { gap: 10px; }
        .investment-investor-admin { display: grid; gap: 10px; padding: 14px !important; border: 1px solid rgba(0,0,0,.08) !important; border-radius: 12px; }
        .investment-investor-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .investment-investor-summary > span { display: grid; gap: 3px; min-width: 0; }
        .investment-investor-summary small { overflow: hidden; text-overflow: ellipsis; }
        .investment-investor-badges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .investment-investor-badges b { font-size: 9px; padding: 5px 7px; border-radius: 999px; background: #f2f0ec; }
        .investment-investor-actions { display: flex; gap: 7px; flex-wrap: wrap; }
        .investment-investor-actions .button { padding: 8px 10px; font-size: 10px; min-height: 34px; }
        .investment-investor-edit { display: grid; gap: 10px; }
        .investment-investor-active-check { display: flex !important; flex-direction: row !important; align-items: center; gap: 8px !important; text-transform: none !important; letter-spacing: 0 !important; }
        .investment-investor-active-check input { width: auto !important; }
        @media (max-width: 700px) {
          .investment-investor-summary { flex-direction: column; }
          .investment-investor-badges { justify-content: flex-start; }
        }

        .investment-lot-header-actions {
          display: grid;
          justify-items: end;
          gap: 10px;
        }

        .investment-lot-actions,
        .investment-lot-editor-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .investment-danger-button {
          border-color: #e1b9b9 !important;
          color: #a52c2c !important;
        }

        .investment-lot-editor {
          display: grid;
          gap: 16px;
          padding: 18px;
          border: 1px solid #dfd4c7;
          border-radius: 16px;
          background: #fffaf4;
        }

        .investment-lot-editor-heading {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .investment-lot-editor-heading h3 {
          margin: 4px 0 5px;
        }

        .investment-lot-editor-heading p {
          margin: 0;
          max-width: 760px;
          color: #6d6258;
          line-height: 1.5;
          font-size: 12px;
        }

        .investment-lot-editor-heading > b {
          white-space: nowrap;
          padding: 7px 10px;
          border-radius: 999px;
          background: #f1e7da;
          font-size: 11px;
        }

        .investment-lot-editor label > small {
          font-size: 10px;
          color: #8a5b43;
        }
      `}</style>
    </div>
  );
}
