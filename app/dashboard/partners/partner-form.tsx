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
      window.localStorage.setItem(
        customCategoryKey(kind),
        JSON.stringify([...existing, value]),
      );
    }
  } catch {
    // localStorage unavailable — custom category simply won't persist for next time.
  }
}

export default function PartnerForm({ kind, existingIds }: { kind: "supplier" | "subcontractor"; existingIds?: string[] }) {
  const r = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supplier = kind === "supplier";

  const baseCategories = supplier ? SUPPLIER_CATEGORIES : SUBCONTRACTOR_CATEGORIES;
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  useEffect(() => {
    setCustomCategories(loadCustomCategories(kind));
  }, [kind]);

  const [category, setCategory] = useState("");
  const [otherCategory, setOtherCategory] = useState("");
  const isOther = category === "__other__";

  const allCategories = [...baseCategories, ...customCategories];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const f = new FormData(e.currentTarget);
    const g = (n: string) => String(f.get(n) ?? "");

    const finalCategory = isOther ? otherCategory.trim() : category;
    if (!finalCategory) {
      setSaving(false);
      return setMessage(`Please select or enter a ${supplier ? "supply category" : "trade specialty"}.`);
    }

    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name: g("name"),
        specialty: finalCategory,
        contact: g("contact"),
        phone: g("phone"),
        email: g("email"),
        address: g("address"),
        description: g("description"),
        accountName: g("accountName"),
        accountNumber: g("accountNumber"),
        bank: g("bank"),
        status: g("status"),
      }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) return setMessage(result.error);

    if (isOther && finalCategory) {
      saveCustomCategory(kind, finalCategory);
      setCustomCategories((prev) => (prev.includes(finalCategory) ? prev : [...prev, finalCategory]));
    }

    e.currentTarget.reset();
    setCategory("");
    setOtherCategory("");
    setMessage(`${result.id} created.`);
    r.refresh();
  }

  const field = (label: string, name: string, required = true) => (
    <div>
      <label className="field-label">{label}</label>
      <input name={name} required={required} maxLength={name === "phone" ? 15 : undefined} className="field-input" />
    </div>
  );

  return (
    <form onSubmit={submit}>
      <p className="section-title">New {kind}</p>
      <div className="mt-4 grid gap-4">
        {field(supplier ? "Supplier name" : "Subcontractor name", "name")}

        <div>
          <label className="field-label">{supplier ? "Supply category" : "Trade specialty"}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="field-input"
          >
            <option value="">Select…</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="__other__">Other…</option>
          </select>
          {isOther && (
            <input
              value={otherCategory}
              onChange={(e) => setOtherCategory(e.target.value)}
              placeholder={`Enter ${supplier ? "supply category" : "trade specialty"}`}
              required
              className="field-input mt-2"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field("Contact person", "contact", false)}
          {field("Phone number", "phone")}
        </div>
        {field("Email address", "email", false)}
        {field("Address", "address")}

        <div>
          <label className="field-label">Description / narration</label>
          <textarea
            name="description"
            rows={3}
            placeholder="Notes about this partner (optional)"
            className="field-input"
          />
        </div>

        <p className="section-title mt-2">Bank details</p>
        {field("Account name", "accountName")}
        <div className="grid grid-cols-2 gap-4">
          {field("Account number", "accountNumber")}
          {field("Bank name", "bank")}
        </div>
        <div>
          <label className="field-label">Status</label>
          <select name="status" className="field-input">
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
      <button className="btn-primary mt-6 w-full" disabled={saving}>
        {saving ? "Saving…" : `Create ${kind}`}
      </button>
    </form>
  );
}