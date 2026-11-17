import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AdminRole = "owner" | "admin";
export type AdminStatus = "invited" | "active" | "disabled";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  status: AdminStatus;
  mfaRequired: boolean;
  sessionVersion: number;
  invitedBy: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  status: AdminStatus;
  mfa_required: boolean;
  session_version: number;
  invited_by: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mfaRequired: row.mfa_required,
    sessionVersion: row.session_version,
    invitedBy: row.invited_by,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function missingRelation(message: string) {
  return /does not exist|relation .*admin_users/i.test(message);
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,email,display_name,role,status,mfa_required,session_version,invited_by,last_login_at,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) {
    if (!missingRelation(error.message)) console.error("Administradores:", error.message);
    return [];
  }
  return ((data || []) as AdminUserRow[]).map(mapRow);
}

export async function getAdminUserById(id: string): Promise<AdminUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,email,display_name,role,status,mfa_required,session_version,invited_by,last_login_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as AdminUserRow);
}

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const supabase = getSupabaseAdmin();
  const normalized = String(email || "").trim().toLowerCase();
  if (!supabase || !normalized) return null;
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,email,display_name,role,status,mfa_required,session_version,invited_by,last_login_at,created_at,updated_at")
    .eq("email", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as AdminUserRow);
}

export async function hasActiveAdminUsers() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (error) return false;
  return (count || 0) > 0;
}

export async function countActiveOwners() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("role", "owner");
  if (error) return 0;
  return count || 0;
}

export async function updateAdminLastLogin(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}

export async function activateAdminUser(id: string, displayName: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado.");
  const { error } = await supabase
    .from("admin_users")
    .update({
      display_name: displayName.trim().slice(0, 120),
      status: "active",
      session_version: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "invited");
  if (error) throw new Error(error.message);
}

export async function completePasswordReset(id: string, displayName?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado.");
  const updates: Record<string, unknown> = {
    session_version: 1,
    updated_at: new Date().toISOString(),
  };
  if (displayName?.trim()) updates.display_name = displayName.trim().slice(0, 120);
  const current = await getAdminUserById(id);
  if (!current || current.status !== "active") throw new Error("Conta administrativa não encontrada.");
  updates.session_version = current.sessionVersion + 1;
  const { error } = await supabase.from("admin_users").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}
