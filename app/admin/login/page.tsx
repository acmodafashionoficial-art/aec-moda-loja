import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { hasActiveAdminUsers } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) redirect("/admin");
  const bootstrap = !(await hasActiveAdminUsers());
  return <div className="admin-login-page"><AdminLoginForm bootstrap={bootstrap} /></div>;
}
