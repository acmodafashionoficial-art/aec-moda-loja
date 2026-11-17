"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!window.confirm(`Excluir “${name}”? Essa ação não pode ser desfeita.`)) return;
    setLoading(true);
    const response = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      window.alert(result.error || "Não foi possível excluir o produto.");
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return <button className="admin-text-button danger" disabled={loading} onClick={remove}>{loading ? "Excluindo…" : "Excluir"}</button>;
}
