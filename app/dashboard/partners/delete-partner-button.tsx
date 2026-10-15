"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type PartnerKind = "supplier" | "subcontractor";

export default function DeletePartnerButton({
  kind,
  entityId,
  name,
}: {
  kind: PartnerKind;
  entityId: string;
  name: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function deletePartner() {
    const label = kind === "supplier" ? "supplier" : "subcontractor";

    const confirmed = window.confirm(
      `Delete ${entityId} - ${name}?\n\nThis permanently deletes the ${label}. If the record already has financial transactions or a pending update request, deletion will be blocked.`,
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const response = await fetch("/api/partners", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind,
          id: entityId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        window.alert(
          result.error ?? `Could not delete the ${label}.`,
        );
        return;
      }

      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : `Could not delete the ${label}.`,
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={deletePartner}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2 size={15} />
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
