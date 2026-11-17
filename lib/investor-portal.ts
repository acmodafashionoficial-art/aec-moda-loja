import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type InvestorPortalStatus = "invited" | "active" | "disabled";

export class InvestorAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function adminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado para o Portal do Investidor.");
  return supabase;
}

function normalEmail(value: unknown) {
  return String(value || "").trim().toLowerCase().slice(0, 200);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function whatsappNumber(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (!digits.startsWith("55") || digits.length < 12 || digits.length > 13) return "";
  return digits;
}

function inviteTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findAuthUserByEmail(email: string) {
  const supabase = adminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Erro ao consultar contas: ${error.message}`);
    const found = data.users.find((user) => normalEmail(user.email) === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function inviteInvestorPortalAccess(investorId: string) {
  const supabase = adminClient();
  const { data: investor, error: investorError } = await supabase
    .from("investors")
    .select("id, name, email, active")
    .eq("id", investorId)
    .maybeSingle();
  if (investorError) throw new Error(`Erro ao carregar investidor: ${investorError.message}`);
  if (!investor) throw new Error("Investidor não encontrado.");
  if (!investor.active) throw new Error("Reative o investidor antes de liberar o acesso.");

  const email = normalEmail(investor.email);
  if (!validEmail(email)) throw new Error("Cadastre um e-mail válido para este investidor antes de liberar o acesso.");

  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.aecmoda.com.br").replace(/\/$/, "");
  const inviteRedirectTo = `${siteUrl}/investidor/aceitar-convite`;
  const recoveryRedirectTo = `${siteUrl}/investidor/redefinir-senha`;
  const now = new Date().toISOString();

  const { data: current, error: currentError } = await supabase
    .from("investor_portal_users")
    .select("auth_user_id, investor_id, email, status")
    .eq("investor_id", investorId)
    .maybeSingle();
  if (currentError) throw new Error(`Erro ao consultar acesso: ${currentError.message}`);

  if (current) {
    if (normalEmail(current.email) !== email) {
      throw new Error("O e-mail do acesso é diferente do cadastro. Bloqueie/remova o acesso antigo, salve o novo e-mail e tente novamente.");
    }

    const { error: adminCheckError, data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", current.auth_user_id)
      .maybeSingle();
    if (adminCheckError) throw new Error(`Erro ao validar a conta: ${adminCheckError.message}`);

    if (adminUser) {
      const { error: updateError } = await supabase
        .from("investor_portal_users")
        .update({
          status: "active",
          disabled_at: null,
          invited_at: current.status === "active" ? undefined : now,
          activated_at: now,
        })
        .eq("investor_id", investorId);
      if (updateError) throw new Error(`Erro ao vincular a conta administrativa ao investidor: ${updateError.message}`);

      await supabase
        .from("investor_portal_invites")
        .update({ revoked_at: now })
        .eq("investor_id", investorId)
        .is("used_at", null)
        .is("revoked_at", null);

      return { mode: "admin_linked" as const };
    }

    const keepActive = current.status === "active";
    const { error: updateError } = await supabase
      .from("investor_portal_users")
      .update({
        status: keepActive ? "active" : "invited",
        disabled_at: null,
        invited_at: now,
      })
      .eq("investor_id", investorId);
    if (updateError) throw new Error(`Erro ao preparar o reenvio: ${updateError.message}`);

    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectTo,
    });
    if (recoveryError) throw new Error(`Não foi possível reenviar o acesso por e-mail: ${recoveryError.message}`);
    return { mode: "recovery_sent" as const };
  }

  const existingAuthUser = await findAuthUserByEmail(email);
  if (existingAuthUser) {
    const { data: adminUser, error: adminCheckError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", existingAuthUser.id)
      .maybeSingle();
    if (adminCheckError) throw new Error(`Erro ao validar a conta: ${adminCheckError.message}`);

    const isAdminInvestor = Boolean(adminUser);
    const { error: linkError } = await supabase.from("investor_portal_users").insert({
      auth_user_id: existingAuthUser.id,
      investor_id: investorId,
      email,
      status: "active",
      invited_at: now,
      activated_at: now,
    });
    if (linkError) throw new Error(`Erro ao vincular acesso: ${linkError.message}`);

    if (isAdminInvestor) {
      return { mode: "admin_linked" as const };
    }

    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectTo,
    });
    if (recoveryError) throw new Error(`A conta foi vinculada, mas o e-mail de acesso não pôde ser enviado: ${recoveryError.message}`);
    return { mode: "recovery_sent" as const };
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectTo,
  });
  if (error || !data.user) throw new Error(error?.message || "Não foi possível enviar o convite do investidor.");

  const { error: linkError } = await supabase.from("investor_portal_users").insert({
    auth_user_id: data.user.id,
    investor_id: investorId,
    email,
    status: "invited",
    invited_at: now,
  });

  if (linkError) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw new Error(`O convite foi cancelado porque o vínculo não pôde ser salvo: ${linkError.message}`);
  }

  return { mode: "invite_sent" as const };
}

export async function createInvestorPortalInviteLink(input: {
  investorId: string;
  actorId?: string;
  actorEmail?: string;
}) {
  const supabase = adminClient();
  const { data: investor, error: investorError } = await supabase
    .from("investors")
    .select("id, name, email, phone, active")
    .eq("id", input.investorId)
    .maybeSingle();
  if (investorError) throw new Error(`Erro ao carregar investidor: ${investorError.message}`);
  if (!investor) throw new Error("Investidor não encontrado.");
  if (!investor.active) throw new Error("Reative o investidor antes de gerar o convite.");

  const email = normalEmail(investor.email);
  if (!validEmail(email)) {
    throw new Error("Cadastre um e-mail válido para o investidor. Ele será usado para entrar no portal.");
  }
  const phone = whatsappNumber(investor.phone);
  if (!phone) {
    throw new Error("Cadastre um WhatsApp válido com DDD para este investidor.");
  }

  const { data: current, error: currentError } = await supabase
    .from("investor_portal_users")
    .select("auth_user_id, investor_id, email, status")
    .eq("investor_id", input.investorId)
    .maybeSingle();
  if (currentError) throw new Error(`Erro ao consultar acesso: ${currentError.message}`);

  let authUserId = current?.auth_user_id ? String(current.auth_user_id) : "";
  let isAdminInvestor = false;
  if (current && normalEmail(current.email) !== email) {
    throw new Error("O e-mail do acesso é diferente do cadastro. Remova o acesso antigo e salve o novo e-mail antes de gerar outro convite.");
  }

  if (!authUserId) {
    const existingAuthUser = await findAuthUserByEmail(email);
    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
      const { data: adminUser, error: adminCheckError } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", existingAuthUser.id)
        .maybeSingle();
      if (adminCheckError) throw new Error(`Erro ao validar a conta: ${adminCheckError.message}`);
      isAdminInvestor = Boolean(adminUser);
    } else {
      const temporaryPassword = randomBytes(48).toString("base64url");
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });
      if (createError || !created.user) {
        throw new Error(createError?.message || "Não foi possível preparar a conta do investidor.");
      }
      authUserId = created.user.id;
    }

    const nowIso = new Date().toISOString();
    const { error: linkError } = await supabase.from("investor_portal_users").insert({
      auth_user_id: authUserId,
      investor_id: input.investorId,
      email,
      status: isAdminInvestor ? "active" : "invited",
      invited_at: nowIso,
      activated_at: isAdminInvestor ? nowIso : null,
    });
    if (linkError) throw new Error(`Erro ao preparar o acesso: ${linkError.message}`);
  } else {
    const { data: adminUser, error: adminCheckError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();
    if (adminCheckError) throw new Error(`Erro ao validar a conta: ${adminCheckError.message}`);
    isAdminInvestor = Boolean(adminUser);
  }

  const now = new Date();
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.aecmoda.com.br").replace(/\/$/, "");

  if (isAdminInvestor) {
    const { error: revokeError } = await supabase
      .from("investor_portal_invites")
      .update({ revoked_at: now.toISOString() })
      .eq("investor_id", input.investorId)
      .is("used_at", null)
      .is("revoked_at", null);
    if (revokeError) throw new Error(`Erro ao invalidar convite anterior: ${revokeError.message}`);

    const { error: portalError } = await supabase
      .from("investor_portal_users")
      .update({
        status: "active",
        activated_at: now.toISOString(),
        disabled_at: null,
      })
      .eq("investor_id", input.investorId);
    if (portalError) throw new Error(`Erro ao ativar o portal: ${portalError.message}`);

    const portalUrl = `${siteUrl}/investidor`;
    const message = [
      `Olá, ${String(investor.name || "").trim()}!`,
      "Seu acesso ao Portal do Investidor A&C Moda está ativo.",
      "Como este e-mail também é uma conta administrativa, use o MESMO e-mail e a MESMA senha que você já usa no painel administrativo.",
      portalUrl,
    ].join("\n");
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    return {
      mode: "existing_admin_account" as const,
      inviteUrl: portalUrl,
      whatsappUrl,
      expiresAt: null,
    };
  }

  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = inviteTokenHash(token);

  const { error: revokeError } = await supabase
    .from("investor_portal_invites")
    .update({ revoked_at: now.toISOString() })
    .eq("investor_id", input.investorId)
    .is("used_at", null)
    .is("revoked_at", null);
  if (revokeError) throw new Error(`Erro ao invalidar convite anterior: ${revokeError.message}`);

  const { error: inviteError } = await supabase.from("investor_portal_invites").insert({
    investor_id: input.investorId,
    auth_user_id: authUserId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    created_by_user_id: input.actorId || null,
    created_by_email: input.actorEmail?.trim() || null,
  });
  if (inviteError) throw new Error(`Erro ao criar o novo convite: ${inviteError.message}`);

  const { error: portalError } = await supabase
    .from("investor_portal_users")
    .update({
      status: current?.status === "active" ? "active" : "invited",
      invited_at: now.toISOString(),
      disabled_at: null,
    })
    .eq("investor_id", input.investorId);
  if (portalError) throw new Error(`Erro ao atualizar o portal: ${portalError.message}`);

  const inviteUrl = `${siteUrl}/investidor/aceitar-convite?token=${encodeURIComponent(token)}`;
  const message = [
    `Olá, ${String(investor.name || "").trim()}!`,
    "Seu acesso ao Portal do Investidor A&C Moda está pronto.",
    "Crie sua senha pelo link abaixo para acompanhar seus lotes e suas vendas:",
    inviteUrl,
    "",
    "Este link é individual, vale por 7 dias e só pode ser usado uma vez.",
  ].join("\n");
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return {
    mode: "invite" as const,
    inviteUrl,
    whatsappUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function acceptInvestorPortalInvite(input: { token: string; password: string }) {
  const token = String(input.token || "").trim();
  const password = String(input.password || "");
  if (token.length < 20) throw new InvestorAccessError("Link de convite inválido.", 400);
  if (password.length < 8 || password.length > 128) {
    throw new InvestorAccessError("A senha precisa ter entre 8 e 128 caracteres.", 400);
  }

  const supabase = adminClient();
  const tokenHash = inviteTokenHash(token);
  const { data, error } = await supabase.rpc("consume_investor_portal_invite", {
    p_token_hash: tokenHash,
  });
  if (error) throw new InvestorAccessError(error.message || "O link expirou ou já foi utilizado.", 400);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.auth_user_id || !row?.email) {
    throw new InvestorAccessError("O link expirou ou já foi utilizado. Gere um novo convite.", 400);
  }

  const { error: passwordError } = await supabase.auth.admin.updateUserById(
    String(row.auth_user_id),
    { password, email_confirm: true },
  );
  if (passwordError) {
    if (row.invite_id) {
      await supabase
        .from("investor_portal_invites")
        .update({ used_at: null })
        .eq("id", String(row.invite_id));
    }
    throw new Error(`Não foi possível criar a senha: ${passwordError.message}`);
  }

  const now = new Date().toISOString();
  const { error: portalError } = await supabase
    .from("investor_portal_users")
    .update({ status: "active", activated_at: now, disabled_at: null, last_login_at: now })
    .eq("auth_user_id", String(row.auth_user_id));
  if (portalError) throw new Error(`Senha criada, mas o portal não pôde ser ativado: ${portalError.message}`);

  return { email: normalEmail(row.email) };
}

export async function revokeInvestorPortalAccess(investorId: string) {
  const supabase = adminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("investor_portal_users")
    .update({ status: "disabled", disabled_at: now })
    .eq("investor_id", investorId)
    .select("auth_user_id")
    .maybeSingle();
  if (error) throw new Error(`Erro ao bloquear acesso: ${error.message}`);

  const { error: inviteError } = await supabase
    .from("investor_portal_invites")
    .update({ revoked_at: now })
    .eq("investor_id", investorId)
    .is("used_at", null)
    .is("revoked_at", null);
  if (inviteError) throw new Error(`Acesso bloqueado, mas houve erro ao invalidar convites: ${inviteError.message}`);

  return Boolean(data);
}

export async function unlinkInvestorPortalAccess(investorId: string) {
  const supabase = adminClient();
  const { data: link, error: linkError } = await supabase
    .from("investor_portal_users")
    .select("auth_user_id")
    .eq("investor_id", investorId)
    .maybeSingle();
  if (linkError) throw new Error(`Erro ao consultar acesso: ${linkError.message}`);
  if (!link) return false;

  const { error: deleteLinkError } = await supabase
    .from("investor_portal_users")
    .delete()
    .eq("investor_id", investorId);
  if (deleteLinkError) throw new Error(`Erro ao desvincular acesso: ${deleteLinkError.message}`);

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", link.auth_user_id)
    .maybeSingle();

  if (!adminUser) {
    await supabase.auth.admin.deleteUser(link.auth_user_id).catch(() => undefined);
  }
  return true;
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function requireInvestorRequest(request: Request, options?: { allowInvited?: boolean }) {
  const token = bearerToken(request);
  if (!token) throw new InvestorAccessError("Faça login para continuar.", 401);

  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) throw new InvestorAccessError("Sua sessão expirou. Entre novamente.", 401);

  const { data: link, error: linkError } = await supabase
    .from("investor_portal_users")
    .select("auth_user_id, investor_id, email, status")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (linkError) throw new Error(`Erro ao validar acesso: ${linkError.message}`);
  if (!link) throw new InvestorAccessError("Esta conta não possui acesso ao Portal do Investidor.", 403);
  if (link.status === "disabled") throw new InvestorAccessError("Seu acesso ao Portal do Investidor está bloqueado.", 403);
  if (link.status === "invited" && !options?.allowInvited) {
    throw new InvestorAccessError("Conclua a criação da sua senha pelo link do convite.", 403);
  }

  const { data: investor, error: investorError } = await supabase
    .from("investors")
    .select("id, code, name, email, phone, active")
    .eq("id", link.investor_id)
    .maybeSingle();
  if (investorError) throw new Error(`Erro ao validar investidor: ${investorError.message}`);
  if (!investor || !investor.active) throw new InvestorAccessError("Este investidor não está ativo.", 403);

  return { authUser: authData.user, link, investor };
}

export async function activateInvestorPortal(request: Request) {
  const session = await requireInvestorRequest(request, { allowInvited: true });
  const supabase = adminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("investor_portal_users")
    .update({ status: "active", activated_at: now, disabled_at: null, last_login_at: now })
    .eq("auth_user_id", session.authUser.id);
  if (error) throw new Error(`Erro ao ativar o acesso: ${error.message}`);
  return session.investor;
}

export async function getInvestorPortalDashboard(request: Request) {
  const session = await requireInvestorRequest(request);
  const supabase = adminClient();
  const now = new Date().toISOString();

  await supabase
    .from("investor_portal_users")
    .update({ last_login_at: now })
    .eq("auth_user_id", session.authUser.id);

  const { data: ownRows, error: ownError } = await supabase
    .from("investment_lot_participants")
    .select("lot_id")
    .eq("investor_id", session.investor.id);
  if (ownError) throw new Error(`Erro ao localizar seus lotes: ${ownError.message}`);

  const lotIds = [...new Set((ownRows || []).map((row) => String(row.lot_id)))];
  if (!lotIds.length) {
    return { investor: session.investor, lots: [], participants: [], queue: [], items: [] };
  }

  const [lotsResult, participantsResult, queueResult, lotItemsResult] = await Promise.all([
    supabase.from("investment_lot_live").select("*").in("id", lotIds).order("activated_at", { ascending: false, nullsFirst: false }),
    supabase.from("investment_participant_live").select("*").in("lot_id", lotIds).order("lot_id", { ascending: true }).order("draw_position", { ascending: true }),
    supabase.from("investment_queue_live").select("lot_id, slot_number, slot_status, draw_position, investor_id, investor_code, investor_name, source_type, sold_at").in("lot_id", lotIds).order("lot_id", { ascending: true }).order("slot_number", { ascending: true }),
    supabase.from("investment_lot_items").select("lot_id, variant_id, quantity").in("lot_id", lotIds).order("created_at", { ascending: true }),
  ]);

  if (lotsResult.error) throw new Error(`Erro ao carregar lotes: ${lotsResult.error.message}`);
  if (participantsResult.error) throw new Error(`Erro ao carregar participantes: ${participantsResult.error.message}`);
  if (queueResult.error) throw new Error(`Erro ao carregar fila: ${queueResult.error.message}`);
  if (lotItemsResult.error) throw new Error(`Erro ao carregar roupas dos lotes: ${lotItemsResult.error.message}`);

  const rawLotItems = (lotItemsResult.data || []) as Array<{
    lot_id: string;
    variant_id: string;
    quantity: number;
  }>;

  const variantIds = [...new Set(rawLotItems.map((item) => String(item.variant_id)).filter(Boolean))];
  let items: Array<{
    lot_id: string;
    variant_id: string;
    quantity: number;
    product_id: string;
    product_name: string;
    product_slug: string;
    product_active: boolean;
    image_url: string | null;
    sku: string;
    size: string;
    color: string;
  }> = [];

  if (variantIds.length) {
    const { data: variantsData, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, sku, size, color")
      .in("id", variantIds);
    if (variantsError) throw new Error(`Erro ao carregar variações das roupas: ${variantsError.message}`);

    const variants = (variantsData || []) as Array<{
      id: string;
      product_id: string;
      sku: string;
      size: string;
      color: string;
    }>;
    const variantById = new Map(variants.map((variant) => [String(variant.id), variant]));
    const productIds = [...new Set(variants.map((variant) => String(variant.product_id)).filter(Boolean))];

    if (productIds.length) {
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, slug, name, active, image_url, image_thumbnail_url")
        .in("id", productIds);
      if (productsError) throw new Error(`Erro ao carregar fotos das roupas: ${productsError.message}`);

      const products = (productsData || []) as Array<{
        id: string;
        slug: string;
        name: string;
        active: boolean;
        image_url: string | null;
        image_thumbnail_url: string | null;
      }>;
      const productById = new Map(products.map((product) => [String(product.id), product]));

      items = rawLotItems.flatMap((item) => {
        const variant = variantById.get(String(item.variant_id));
        if (!variant) return [];
        const product = productById.get(String(variant.product_id));
        if (!product) return [];
        return [{
          lot_id: String(item.lot_id),
          variant_id: String(item.variant_id),
          quantity: Math.max(0, Number(item.quantity) || 0),
          product_id: String(product.id),
          product_name: String(product.name || "Produto"),
          product_slug: String(product.slug || ""),
          product_active: product.active !== false,
          image_url: product.image_thumbnail_url || product.image_url || null,
          sku: String(variant.sku || ""),
          size: String(variant.size || ""),
          color: String(variant.color || ""),
        }];
      });
    }
  }

  return {
    investor: session.investor,
    lots: lotsResult.data || [],
    participants: participantsResult.data || [],
    queue: queueResult.data || [],
    items,
  };
}

export function investorErrorStatus(error: unknown, fallback = 500) {
  return error instanceof InvestorAccessError ? error.status : fallback;
}
