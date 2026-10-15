"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SUPPLIER_CATEGORIES = [
  "Cement",
  "Sharp Sand",
  "Granite",
  "Plastering Sand",
];

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

type PartnerKind = "supplier" | "subcontractor";

type Partner = {
  phonenumber: string;
  email: string | null;
  address: string;
  supplycategory?: string[] | null;
  tradespecialty?: string[] | null;
  description?: string | null;
};

function customCategoryKey(kind: PartnerKind) {
  return `kcbl-custom-categories-${kind}`;
}

function loadCustomCategories(kind: PartnerKind) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(
      customCategoryKey(kind),
    );

    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCustomCategory(
  kind: PartnerKind,
  value: string,
) {
  try {
    const existing = loadCustomCategories(kind);

    if (!existing.includes(value)) {
      window.localStorage.setItem(
        customCategoryKey(kind),
        JSON.stringify([...existing, value]),
      );
    }
  } catch {
    // localStorage may be unavailable.
  }
}

function normalizeCategories(
  value:
    | string[]
    | string
    | null
    | undefined,
) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  const single = String(value ?? "").trim();

  return single ? [single] : [];
}

function valuesEqual(
  left: unknown,
  right: unknown,
) {
  if (
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return (
      JSON.stringify(left ?? []) ===
      JSON.stringify(right ?? [])
    );
  }

  return (
    String(left ?? "") ===
    String(right ?? "")
  );
}

export default function EditPartnerRequest({
  kind,
  entityid,
  partner,
}: {
  kind: PartnerKind;
  entityid: string;
  partner: Partner;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(
    null,
  );

  const specialtyColumn =
    kind === "supplier"
      ? "supplycategory"
      : "tradespecialty";

  const currentCategories =
    normalizeCategories(
      partner[specialtyColumn],
    );

  const [
    selectedCategories,
    setSelectedCategories,
  ] = useState<string[]>(currentCategories);

  const [
    customCategories,
    setCustomCategories,
  ] = useState<string[]>([]);

  const [otherValue, setOtherValue] =
    useState("");

  const [form, setForm] = useState({
    phonenumber: partner.phonenumber ?? "",
    email: partner.email ?? "",
    address: partner.address ?? "",
    description: partner.description ?? "",
  });

  const baseCategories =
    kind === "supplier"
      ? SUPPLIER_CATEGORIES
      : SUBCONTRACTOR_CATEGORIES;

  useEffect(() => {
    setCustomCategories(
      loadCustomCategories(kind),
    );
  }, [kind]);

  const allCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...baseCategories,
          ...customCategories,
          ...currentCategories,
        ]),
      ),
    [
      baseCategories,
      customCategories,
      currentCategories,
    ],
  );

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter(
            (value) => value !== category,
          )
        : [...current, category],
    );
  }

  function addOtherCategory() {
    const value = otherValue
      .trim()
      .replace(/\s+/g, " ");

    if (!value) return;

    saveCustomCategory(kind, value);

    setCustomCategories((current) =>
      current.includes(value)
        ? current
        : [...current, value],
    );

    setSelectedCategories((current) =>
      current.includes(value)
        ? current
        : [...current, value],
    );

    setOtherValue("");
  }

  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setMsg(null);

    if (!selectedCategories.length) {
      setSaving(false);
      setMsg(
        kind === "supplier"
          ? "Select at least one supply category."
          : "Select at least one trade specialty.",
      );
      return;
    }

    const submission: Record<
      string,
      unknown
    > = {
      ...form,
      [specialtyColumn]:
        selectedCategories,
    };

    const original: Record<
      string,
      unknown
    > = {
      phonenumber: partner.phonenumber ?? "",
      email: partner.email ?? "",
      address: partner.address ?? "",
      description: partner.description ?? "",
      [specialtyColumn]:
        currentCategories,
    };

    const changes: Record<
      string,
      unknown
    > = {};

    Object.keys(submission).forEach((key) => {
      if (
        !valuesEqual(
          submission[key],
          original[key],
        )
      ) {
        changes[key] = submission[key];
      }
    });

    if (!Object.keys(changes).length) {
      setSaving(false);
      setMsg("No changes to submit.");
      return;
    }

    const response = await fetch(
      "/api/edit-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entitytype: kind,
          entityid,
          changes,
        }),
      },
    );

    const result = await response.json();

    setSaving(false);

    if (!response.ok) {
      setMsg(
        result.error ??
          "Could not submit the update request.",
      );
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-navy hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <p className="section-title">
          Request update — {entityid}
        </p>

        <form
          onSubmit={submit}
          className="mt-4 space-y-4"
        >
          <div>
            <label className="field-label">
              Phone number
            </label>

            <input
              className="field-input"
              value={form.phonenumber}
              onChange={(event) =>
                setForm({
                  ...form,
                  phonenumber:
                    event.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="field-label">
              Email address
            </label>

            <input
              className="field-input"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({
                  ...form,
                  email:
                    event.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="field-label">
              Address
            </label>

            <input
              className="field-input"
              value={form.address}
              onChange={(event) =>
                setForm({
                  ...form,
                  address:
                    event.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="field-label">
              {kind === "supplier"
                ? "Supply categories"
                : "Trade specialties"}
            </label>

            <p className="mb-2 text-xs text-slate-500">
              Select one or more.
            </p>

            <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              {allCategories.map((category) => (
                <label
                  key={category}
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(
                      category,
                    )}
                    onChange={() =>
                      toggleCategory(category)
                    }
                  />

                  <span>{category}</span>
                </label>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                className="field-input"
                value={otherValue}
                onChange={(event) =>
                  setOtherValue(
                    event.target.value,
                  )
                }
                placeholder={`Add another ${
                  kind === "supplier"
                    ? "category"
                    : "specialty"
                }`}
              />

              <button
                type="button"
                onClick={addOtherCategory}
                className="btn-secondary shrink-0"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="field-label">
              Description / narration
            </label>

            <textarea
              className="field-input"
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm({
                  ...form,
                  description:
                    event.target.value,
                })
              }
            />
          </div>

          {msg && (
            <p className="text-sm text-red-600">
              {msg}
            </p>
          )}

          <div className="flex gap-2">
            <button
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving
                ? "Submitting…"
                : "Submit for approval"}
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
