"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminAccountActions() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function revoke() {
    if (!window.confirm("Encerrar todas as sessões, inclusive esta?")) return;
    setLoading(true);
    const response = await fetch("/api/admin/account/revoke", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Não foi possível encerrar as sessões.");
      setLoading(false);
      return;
    }
    router.replace("/admin/login");
    router.refresh();
  }

  return <div className="admin-account-actions">
    {error && <div className="form-error">{error}</div>}
    <button className="button button-outline" disabled={loading} onClick={revoke}>{loading ? "Encerrando…" : "Encerrar todas as minhas sessões"}</button>
  </div>;
}
