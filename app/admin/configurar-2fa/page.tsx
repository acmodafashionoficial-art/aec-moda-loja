import { redirect } from "next/navigation";
import { AdminMfaForm } from "@/components/admin-mfa-form";
import { getPendingAdminAuth, isAdminAuthenticated } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function ConfigureMfaPage() {
  if (await isAdminAuthenticated()) redirect("/admin");
  const pending = await getPendingAdminAuth();
  if (!pending) redirect("/admin/login");
  return <div className="admin-login-page"><AdminMfaForm mode="enroll" email={pending.email} /></div>;
}
