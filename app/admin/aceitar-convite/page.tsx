import { Suspense } from "react";
import { AdminAccountSetup } from "@/components/admin-account-setup";

export default function AcceptInvitePage() {
  return <div className="admin-login-page"><Suspense fallback={<div className="admin-login-card">Validando convite…</div>}><AdminAccountSetup mode="invite" /></Suspense></div>;
}
