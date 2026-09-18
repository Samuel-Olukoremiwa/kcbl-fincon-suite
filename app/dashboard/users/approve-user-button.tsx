"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ApproveUserButton({ userid }: { userid: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/users/${userid}/approve`, {
      method: "PATCH",
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not approve user.");
    router.refresh();
  }

  return (
    <span>
      <button
        className="text-sm font-medium text-navy hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={approve}
      >
        {busy ? "Approving…" : "Approve"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
