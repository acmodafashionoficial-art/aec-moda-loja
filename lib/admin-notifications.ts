"server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AdminNotificationKind = "new_order" | "payment_approved";

export type AdminNotification = {
  id: string;
  kind: AdminNotificationKind;
  orderId: string;
  title: string;
  message?: string;
  createdAt: string;
  readAt?: string;
};

type NotificationRow = {
  id: string;
  kind: AdminNotificationKind;
  order_id: string;
  title: string;
  message?: string | null;
  created_at: string;
  read_at?: string | null;
};

function mapNotification(row: NotificationRow): AdminNotification {
  return {
    id: row.id,
    kind: row.kind,
    orderId: row.order_id,
    title: row.title,
    message: row.message || undefined,
    createdAt: row.created_at,
    readAt: row.read_at || undefined,
  };
}

export async function getUnreadAdminNotifications(limit = 20) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [] as AdminNotification[];

  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id, kind, order_id, title, message, created_at, read_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(300, Math.max(1, limit)));

  if (error) {
    console.error("Não foi possível carregar notificações:", error.message);
    return [] as AdminNotification[];
  }

  return ((data || []) as NotificationRow[]).map(mapNotification);
}

export async function getUnreadAdminNotificationCount() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("Não foi possível contar notificações:", error.message);
    return 0;
  }

  return count || 0;
}

export async function markOrderNotificationsRead() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .in("kind", ["new_order", "payment_approved"]);

  if (error) {
    console.error("Não foi possível marcar notificações como lidas:", error.message);
  }
}
