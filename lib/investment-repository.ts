import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type InvestorPortalStatus = "none" | "invited" | "active" | "disabled";
export type InvestmentDistributionRule = "round_robin_random" | "round_robin_manual" | "piece_assignment";

export type InvestorView = {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  active: boolean;
  portalStatus: InvestorPortalStatus;
  createdAt: string;
};

export type InvestmentLotView = {
  id: string;
  code: string;
  name: string;
  status: "draft" | "active" | "completed" | "cancelled";
  distributionRule: InvestmentDistributionRule;
  totalUnits: number;
  soldUnits: number;
  remainingUnits: number;
  currentSlotNumber?: number;
  currentInvestorId?: string;
  currentInvestorName?: string;
  nextSlotNumber?: number;
  nextInvestorId?: string;
  nextInvestorName?: string;
  activatedAt?: string;
  completedAt?: string;
};

export type InvestmentParticipantView = {
  lotId: string;
  investorId: string;
  investorCode: string;
  investorName: string;
  purchasedUnits: number;
  drawPosition?: number;
  soldUnits: number;
  remainingUnits: number;
  nextSlotNumber?: number;
};

export type InvestmentLotItemView = {
  lotId: string;
  variantId: string;
  quantity: number;
};

export type InvestmentQueueView = {
  lotId: string;
  slotId: string;
  slotNumber: number;
  slotStatus: "pending" | "allocated" | "reversed";
  drawPosition: number;
  replacementForSlotId?: string;
  investorId: string;
  investorCode: string;
  investorName: string;
  allocationId?: string;
  sourceType?: "store_sale" | "online_order";
  inStoreSaleId?: string;
  onlineOrderId?: string;
  grossAmount?: number;
  allocationStatus?: "active" | "reversed";
  soldAt?: string;
};

type InvestorRow = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  active: boolean;
  created_at: string;
};

type PortalRow = {
  investor_id: string;
  auth_user_id: string;
  email: string;
  status: Exclude<InvestorPortalStatus, "none">;
};

type LotRow = {
  id: string;
  code: string;
  name: string;
  status: InvestmentLotView["status"];
  distribution_rule?: InvestmentDistributionRule | null;
  total_units: number | string;
  sold_units: number | string;
  remaining_units: number | string;
  current_slot_number?: number | string | null;
  current_investor_id?: string | null;
  current_investor_name?: string | null;
  next_slot_number?: number | string | null;
  next_investor_id?: string | null;
  next_investor_name?: string | null;
  activated_at?: string | null;
  completed_at?: string | null;
};

type ParticipantRow = {
  lot_id: string;
  investor_id: string;
  investor_code: string;
  investor_name: string;
  purchased_units: number | string;
  draw_position?: number | string | null;
  sold_units: number | string;
  remaining_units: number | string;
  next_slot_number?: number | string | null;
};

type LotItemRow = {
  lot_id: string;
  variant_id: string;
  quantity: number | string;
};

type QueueRow = {
  lot_id: string;
  slot_id: string;
  slot_number: number | string;
  slot_status: InvestmentQueueView["slotStatus"];
  draw_position: number | string;
  replacement_for_slot_id?: string | null;
  investor_id: string;
  investor_code: string;
  investor_name: string;
  allocation_id?: string | null;
  source_type?: InvestmentQueueView["sourceType"] | null;
  in_store_sale_id?: string | null;
  online_order_id?: string | null;
  gross_amount?: number | string | null;
  allocation_status?: InvestmentQueueView["allocationStatus"] | null;
  sold_at?: string | null;
};

function adminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("O módulo de investidores precisa do Supabase configurado.");
  }
  return supabase;
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function loadPortalStatusMap() {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("investor_portal_users")
    .select("investor_id, auth_user_id, email, status");
  if (error) throw new Error(`Erro ao carregar acessos dos investidores: ${error.message}`);
  return new Map(
    ((data || []) as PortalRow[]).map((row) => [row.investor_id, row]),
  );
}

function mapInvestors(rows: InvestorRow[], portalMap: Map<string, PortalRow>) {
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    notes: row.notes || undefined,
    active: row.active,
    portalStatus: portalMap.get(row.id)?.status || "none",
    createdAt: row.created_at,
  })) satisfies InvestorView[];
}

export async function listInvestors(): Promise<InvestorView[]> {
  const supabase = adminClient();
  const [investorsResult, portalMap] = await Promise.all([
    supabase
      .from("investors")
      .select("id, code, name, email, phone, notes, active, created_at")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    loadPortalStatusMap(),
  ]);

  if (investorsResult.error) {
    throw new Error(`Erro ao carregar investidores: ${investorsResult.error.message}`);
  }
  return mapInvestors((investorsResult.data || []) as InvestorRow[], portalMap);
}

export async function getInvestorById(investorId: string) {
  const supabase = adminClient();
  const [{ data, error }, portalMap] = await Promise.all([
    supabase
      .from("investors")
      .select("id, code, name, email, phone, notes, active, created_at")
      .eq("id", investorId)
      .maybeSingle(),
    loadPortalStatusMap(),
  ]);
  if (error) throw new Error(`Erro ao carregar investidor: ${error.message}`);
  if (!data) return null;
  return mapInvestors([data as InvestorRow], portalMap)[0] || null;
}

export async function createInvestor(input: {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  actorId: string;
  actorEmail: string;
}) {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("create_investor", {
    p_name: input.name.trim().slice(0, 120),
    p_email: input.email?.trim().slice(0, 200) || null,
    p_phone: input.phone?.trim().slice(0, 40) || null,
    p_notes: input.notes?.trim().slice(0, 1000) || null,
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });

  if (error) throw new Error(error.message || "Não foi possível cadastrar o investidor.");
  return String(data);
}

export async function updateInvestor(input: {
  investorId: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  active: boolean;
  actorId: string;
  actorEmail: string;
}) {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("update_investor", {
    p_investor_id: input.investorId,
    p_name: input.name.trim().slice(0, 120),
    p_email: input.email?.trim().slice(0, 200) || null,
    p_phone: input.phone?.trim().slice(0, 40) || null,
    p_notes: input.notes?.trim().slice(0, 1000) || null,
    p_active: Boolean(input.active),
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw new Error(error.message || "Não foi possível atualizar o investidor.");
  return String(data);
}

export async function archiveInvestor(input: {
  investorId: string;
  actorId: string;
  actorEmail: string;
}) {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("archive_investor", {
    p_investor_id: input.investorId,
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw new Error(error.message || "Não foi possível remover o investidor.");
  return Boolean(data);
}

export type DeleteUnusedInvestorResult = "deleted" | "has_history" | "not_found";

export async function deleteUnusedInvestor(investorId: string): Promise<DeleteUnusedInvestorResult> {
  const supabase = adminClient();

  const { data: portalLink, error: portalError } = await supabase
    .from("investor_portal_users")
    .select("auth_user_id")
    .eq("investor_id", investorId)
    .maybeSingle();
  if (portalError) {
    throw new Error(`Erro ao conferir o acesso do investidor: ${portalError.message}`);
  }

  const { data, error } = await supabase.rpc("delete_unused_investor", {
    p_investor_id: investorId,
  });
  if (error) {
    throw new Error(error.message || "Não foi possível excluir o cadastro do investidor.");
  }

  const result = String(data || "") as DeleteUnusedInvestorResult;
  if (!["deleted", "has_history", "not_found"].includes(result)) {
    throw new Error("O banco retornou uma resposta inesperada ao excluir o investidor.");
  }

  if (result === "deleted" && portalLink?.auth_user_id) {
    const authUserId = String(portalLink.auth_user_id);
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (!adminUser) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
  }

  return result;
}


export type PurgeTestInvestorResult = {
  status: "deleted" | "blocked_sales" | "not_found";
  lotsDeleted: number;
  otherParticipantsRemoved: number;
  message?: string;
};

export async function purgeTestInvestor(
  investorId: string,
): Promise<PurgeTestInvestorResult> {
  const supabase = adminClient();

  const { data: portalLink, error: portalError } = await supabase
    .from("investor_portal_users")
    .select("auth_user_id")
    .eq("investor_id", investorId)
    .maybeSingle();
  if (portalError) {
    throw new Error(`Erro ao conferir o acesso do investidor: ${portalError.message}`);
  }

  const { data, error } = await supabase.rpc("purge_test_investor", {
    p_investor_id: investorId,
    p_confirmation: "APAGAR TESTE",
  });
  if (error) {
    throw new Error(error.message || "Não foi possível excluir o investidor de teste.");
  }

  const raw = (data || {}) as Record<string, unknown>;
  const status = String(raw.status || "") as PurgeTestInvestorResult["status"];
  if (!["deleted", "blocked_sales", "not_found"].includes(status)) {
    throw new Error("O banco retornou uma resposta inesperada ao limpar o investidor de teste.");
  }

  if (status === "deleted" && portalLink?.auth_user_id) {
    const authUserId = String(portalLink.auth_user_id);
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (!adminUser) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
  }

  return {
    status,
    lotsDeleted: Number(raw.lots_deleted || 0),
    otherParticipantsRemoved: Number(raw.other_participants_removed_from_test_lots || 0),
    message: raw.message ? String(raw.message) : undefined,
  };
}

export async function createAndActivateInvestmentLot(input: {
  name: string;
  participants: Array<{ investorId: string; units: number }>;
  items: Array<{ variantId: string; quantity: number }>;
  distributionMode?: "random" | "manual_order" | "piece_assignment";
  manualOrder?: string[];
  pieceAssignments?: Array<{ variantId: string; investorId: string; quantity: number }>;
  actorId: string;
  actorEmail: string;
}) {
  const participants = input.participants
    .map((item) => ({
      investor_id: String(item.investorId || "").trim(),
      units: Math.floor(Number(item.units) || 0),
    }))
    .filter((item) => item.investor_id && item.units > 0);

  const itemMap = new Map<string, number>();
  for (const item of input.items) {
    const variantId = String(item.variantId || "").trim();
    const quantity = Math.floor(Number(item.quantity) || 0);
    if (!variantId || quantity <= 0) continue;
    itemMap.set(variantId, (itemMap.get(variantId) || 0) + quantity);
  }
  const items = [...itemMap.entries()].map(([variant_id, quantity]) => ({ variant_id, quantity }));

  if (!participants.length) throw new Error("Informe a quantidade de pelo menos um investidor.");
  if (!items.length) throw new Error("Adicione pelo menos uma peça ao lote.");

  const participantTotal = participants.reduce((sum, item) => sum + item.units, 0);
  const itemTotal = items.reduce((sum, item) => sum + item.quantity, 0);
  if (participantTotal !== itemTotal) {
    throw new Error(`As quantidades não fecham: investidores ${participantTotal}, peças ${itemTotal}.`);
  }

  const distributionMode = input.distributionMode || "random";
  const distributionRule: InvestmentDistributionRule =
    distributionMode === "manual_order"
      ? "round_robin_manual"
      : distributionMode === "piece_assignment"
        ? "piece_assignment"
        : "round_robin_random";

  const participantIds = new Set(participants.map((item) => item.investor_id));
  const manualOrder = (input.manualOrder || [])
    .map((value) => String(value || "").trim())
    .filter((value, index, all) => value && participantIds.has(value) && all.indexOf(value) === index);

  if (distributionRule === "round_robin_manual" && manualOrder.length !== participants.length) {
    throw new Error("Defina a ordem de todos os investidores participantes.");
  }

  const assignmentMap = new Map<string, number>();
  for (const assignment of input.pieceAssignments || []) {
    const variantId = String(assignment.variantId || "").trim();
    const investorId = String(assignment.investorId || "").trim();
    const quantity = Math.floor(Number(assignment.quantity) || 0);
    if (!variantId || !investorId || quantity <= 0) continue;
    const key = `${variantId}|||${investorId}`;
    assignmentMap.set(key, (assignmentMap.get(key) || 0) + quantity);
  }
  const pieceAssignments = [...assignmentMap.entries()].map(([key, quantity]) => {
    const [variant_id, investor_id] = key.split("|||");
    return { variant_id, investor_id, quantity };
  });

  if (distributionRule === "piece_assignment" && !pieceAssignments.length) {
    throw new Error("Defina de qual investidor é cada roupa do lote.");
  }

  const supabase = adminClient();
  const { data, error } = await supabase.rpc("create_and_activate_investment_lot_v2", {
    p_name: input.name.trim().slice(0, 160),
    p_participants: participants,
    p_items: items,
    p_distribution_rule: distributionRule,
    p_manual_order: manualOrder,
    p_piece_assignments: pieceAssignments,
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw new Error(error.message || "Não foi possível criar o lote.");
  return String(data);
}


export async function updateInvestmentLot(input: {
  lotId: string;
  name: string;
  participants: Array<{ investorId: string; units: number }>;
  items: Array<{ variantId: string; quantity: number }>;
  actorId: string;
  actorEmail: string;
}) {
  const participants = input.participants
    .map((item) => ({
      investor_id: String(item.investorId || "").trim(),
      units: Math.floor(Number(item.units) || 0),
    }))
    .filter((item) => item.investor_id && item.units > 0);

  const itemMap = new Map<string, number>();
  for (const item of input.items) {
    const variantId = String(item.variantId || "").trim();
    const quantity = Math.floor(Number(item.quantity) || 0);
    if (!variantId || quantity <= 0) continue;
    itemMap.set(variantId, (itemMap.get(variantId) || 0) + quantity);
  }

  const items = [...itemMap.entries()].map(([variant_id, quantity]) => ({
    variant_id,
    quantity,
  }));

  if (!participants.length) {
    throw new Error("Informe a quantidade de pelo menos um investidor.");
  }
  if (!items.length) {
    throw new Error("Adicione pelo menos uma peça ao lote.");
  }

  const participantTotal = participants.reduce((sum, item) => sum + item.units, 0);
  const itemTotal = items.reduce((sum, item) => sum + item.quantity, 0);
  if (participantTotal !== itemTotal) {
    throw new Error(
      `As quantidades não fecham: investidores ${participantTotal}, peças ${itemTotal}.`,
    );
  }

  const supabase = adminClient();
  const { data, error } = await supabase.rpc("update_investment_lot", {
    p_lot_id: input.lotId,
    p_name: input.name.trim().slice(0, 160),
    p_participants: participants,
    p_items: items,
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });

  if (error) {
    throw new Error(error.message || "Não foi possível atualizar o lote.");
  }

  return Boolean(data);
}

export async function archiveInvestmentLot(input: {
  lotId: string;
  actorId: string;
  actorEmail: string;
}) {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("archive_investment_lot", {
    p_lot_id: input.lotId,
    p_reason: "Lote apagado pelo painel administrativo",
    p_actor_user_id: input.actorId,
    p_actor_email: input.actorEmail,
  });

  if (error) {
    throw new Error(error.message || "Não foi possível apagar o lote.");
  }

  return Boolean(data);
}


export async function getUnassignedInvestmentStock() {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("investment_unassigned_stock")
    .select("variant_id, available_units")
    .limit(10000);

  if (error) {
    throw new Error(
      `Erro ao carregar estoque livre para os lotes: ${error.message}`,
    );
  }

  const counts: Record<string, number> = {};
  for (const row of (data || []) as Array<{
    variant_id: string;
    available_units: number | string;
  }>) {
    counts[String(row.variant_id)] = Math.max(
      0,
      Math.floor(Number(row.available_units) || 0),
    );
  }

  return counts;
}

export async function getInvestmentDashboard() {
  const supabase = adminClient();
  const [investorsResult, portalMap, lotsResult, participantsResult, queueResult, lotItemsResult] = await Promise.all([
    supabase
      .from("investors")
      .select("id, code, name, email, phone, notes, active, created_at")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    loadPortalStatusMap(),
    supabase.from("investment_lot_live").select("*").order("activated_at", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("investment_participant_live").select("*").order("lot_id", { ascending: true }).order("draw_position", { ascending: true }).limit(5000),
    supabase.from("investment_queue_live").select("*").order("lot_id", { ascending: true }).order("slot_number", { ascending: true }).limit(10000),
    supabase.from("investment_lot_items").select("lot_id, variant_id, quantity").order("created_at", { ascending: true }).limit(10000),
  ]);

  if (investorsResult.error) throw new Error(`Erro ao carregar investidores: ${investorsResult.error.message}`);
  if (lotsResult.error) throw new Error(`Erro ao carregar lotes: ${lotsResult.error.message}`);
  if (participantsResult.error) throw new Error(`Erro ao carregar participantes: ${participantsResult.error.message}`);
  if (queueResult.error) throw new Error(`Erro ao carregar o rodízio: ${queueResult.error.message}`);
  if (lotItemsResult.error) throw new Error(`Erro ao carregar as peças dos lotes: ${lotItemsResult.error.message}`);

  const investors = mapInvestors((investorsResult.data || []) as InvestorRow[], portalMap);
  const lots = ((lotsResult.data || []) as LotRow[]).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    distributionRule: row.distribution_rule || "round_robin_random",
    totalUnits: Number(row.total_units) || 0,
    soldUnits: Number(row.sold_units) || 0,
    remainingUnits: Number(row.remaining_units) || 0,
    currentSlotNumber: optionalNumber(row.current_slot_number),
    currentInvestorId: row.current_investor_id || undefined,
    currentInvestorName: row.current_investor_name || undefined,
    nextSlotNumber: optionalNumber(row.next_slot_number),
    nextInvestorId: row.next_investor_id || undefined,
    nextInvestorName: row.next_investor_name || undefined,
    activatedAt: row.activated_at || undefined,
    completedAt: row.completed_at || undefined,
  })) satisfies InvestmentLotView[];

  const participants = ((participantsResult.data || []) as ParticipantRow[]).map((row) => ({
    lotId: row.lot_id,
    investorId: row.investor_id,
    investorCode: row.investor_code,
    investorName: row.investor_name,
    purchasedUnits: Number(row.purchased_units) || 0,
    drawPosition: optionalNumber(row.draw_position),
    soldUnits: Number(row.sold_units) || 0,
    remainingUnits: Number(row.remaining_units) || 0,
    nextSlotNumber: optionalNumber(row.next_slot_number),
  })) satisfies InvestmentParticipantView[];

  const queue = ((queueResult.data || []) as QueueRow[]).map((row) => ({
    lotId: row.lot_id,
    slotId: row.slot_id,
    slotNumber: Number(row.slot_number) || 0,
    slotStatus: row.slot_status,
    drawPosition: Number(row.draw_position) || 0,
    replacementForSlotId: row.replacement_for_slot_id || undefined,
    investorId: row.investor_id,
    investorCode: row.investor_code,
    investorName: row.investor_name,
    allocationId: row.allocation_id || undefined,
    sourceType: row.source_type || undefined,
    inStoreSaleId: row.in_store_sale_id || undefined,
    onlineOrderId: row.online_order_id || undefined,
    grossAmount: optionalNumber(row.gross_amount),
    allocationStatus: row.allocation_status || undefined,
    soldAt: row.sold_at || undefined,
  })) satisfies InvestmentQueueView[];

  const liveLotIds = new Set(lots.map((lot) => lot.id));
  const lotItems = ((lotItemsResult.data || []) as LotItemRow[])
    .filter((row) => liveLotIds.has(row.lot_id))
    .map((row) => ({
      lotId: row.lot_id,
      variantId: row.variant_id,
      quantity: Number(row.quantity) || 0,
    })) satisfies InvestmentLotItemView[];

  return { investors, lots, participants, queue, lotItems };
}
