import { Suspense } from "react";
import { AdminAccountSetup } from "@/components/admin-account-setup";

export default function ResetPasswordPage() {
  return <div className="admin-login-page"><Suspense fallback={<div className="admin-login-card">Validando recuperação…</div>}><AdminAccountSetup mode="reset" /></Suspense></div>;
}
