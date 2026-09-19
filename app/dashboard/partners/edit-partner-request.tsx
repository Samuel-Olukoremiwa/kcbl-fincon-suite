"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SUPPLIER_CATEGORIES = ["Cement", "Sharp Sand", "Granite", "Plastering Sand"];
const SUBCONTRACTOR_CATEGORIES = [
  "Masons",
  "Carpenters",
  "Tilers",
  "Painters",
  "Plumbers",
  "Electricians",
  "Welders",
  "POP/Ceiling Installer",
  "Aluminium/Glazing Workers",
];

function customCategoryKey(kind: "supplier" | "subcontractor") {
  return `kcbl-custom-categories-${kind}`;
}
function loadCustomCategories(kind: "supplier" | "subcontractor") {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(customCategoryKey(kind));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveCustomCategory(kind: "supplier" | "subcontractor", value: string) {
  try {
    const existing = loadCustomCategories(kind);
    if (!existing.includes(value)) {
      window.localStorage.setItem(customCategoryKey(kind), JSON.stringify([...existing, value]));
    }
  } catch {
    // ignore
  }
}

type Partner = {
  phonenumber: string;
  email: string | null;
  address: string;
  supplycategory?: string;
  tradespecialty?: string;
  description?: string | null;
};

export default function EditPartnerRequest({
  kind, entityid, partner,
}: { kind: "supplier" | "subcontractor"; entityid: string; partner: Partner }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // The column that actually stores the category differs per entity type —
  // "specialty" is only a UI label, never sent to the API directly.
  const specialtyColumn = kind === "supplier" ? "supplycategory" : "tradespecialty";
  const currentSpecialty = (partner as any)[specialtyColumn] ?? "";

  const [form, setForm] = useState({
    phonenumber: partner.phonenumber ?? "",
    email: partner.email ?? "",
    address: partner.address ?? "",
    description: partner.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const baseCategories = kind === "supplier" ? SUPPLIER_CATEGORIES : SUBCONTRACTOR_CATEGORIES;
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  useEffect(() => {
    setCustomCategories(loadCustomCategories(kind));
  }, [kind]);
  const allCategories = [...baseCategories, ...customCategories];
  const knownCategory = allCategories.includes(currentSpecialty);
  const [isOther, setIsOther] = useState(!knownCategory && !!currentSpecialty);
  const [otherValue, setOtherValue] = useState(!knownCategory ? currentSpecialty : "");
  const [specialty, setSpecialty] = useState(knownCategory ? currentSpecialty : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const finalSpecialty = isOther ? otherValue.trim() : specialty;

    const submission: Record<string, string> = {
      ...form,
      [specialtyColumn]: finalSpecialty,
    };
    const original: Record<string, any> = {
      ...partner,
      [specialtyColumn]: currentSpecialty,
    };

    const changes: Record<string, string> = {};
    Object.keys(submission).forEach((key) => {
      const originalValue = original[key] ?? "";
      if (submission[key] !== originalValue) changes[key] = submission[key];
    });

    if (!Object.keys(changes).length) {
      setSaving(false);
      return setMsg("No changes to submit.");
    }

    const res = await fetch("/api/edit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entitytype: kind, entityid, changes }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) return setMsg(result.error);

    if (isOther && finalSpecialty) {
      saveCustomCategory(kind, finalSpecialty);
      setCustomCategories((prev) => (prev.includes(finalSpecialty) ? prev : [...prev, finalSpecialty]));
    }

    setMsg("Update request submitted for approval.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-navy hover:underline">
        Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <p className="section-title">Request update — {entityid}</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="field-label">Phone number</label>
            <input className="field-input" value={form.phonenumber} onChange={(e) => setForm({ ...form, phonenumber: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Email address</label>
            <input className="field-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Address</label>
            <input className="field-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="field-label">{kind === "supplier" ? "Supply category" : "Trade specialty"}</label>
            <select
              className="field-input"
              value={isOther ? "__other__" : specialty}
              onChange={(e) => {
                if (e.target.value === "__other__") {
                  setIsOther(true);
                } else {
                  setIsOther(false);
                  setSpecialty(e.target.value);
                }
              }}
            >
              <option value="">Select…</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__other__">Other…</option>
            </select>
            {isOther && (
              <input
                className="field-input mt-2"
                value={otherValue}
                onChange={(e) => setOtherValue(e.target.value)}
                placeholder={`Enter ${kind === "supplier" ? "supply category" : "trade specialty"}`}
              />
            )}
          </div>
          <div>
            <label className="field-label">Description / narration</label>
            <textarea
              className="field-input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Submitting…" : "Submit for approval"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}