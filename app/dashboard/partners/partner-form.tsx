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

export default function PartnerForm({
  kind,
  existingIds,
}: {
  kind: PartnerKind;
  existingIds?: string[];
}) {
  const router = useRouter();

  void existingIds;

  const supplier = kind === "supplier";

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(
    null,
  );
  const [customCategories, setCustomCategories] =
    useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] =
    useState<string[]>([]);
  const [otherCategory, setOtherCategory] =
    useState("");

  useEffect(() => {
    setCustomCategories(loadCustomCategories(kind));
    setSelectedCategories([]);
    setOtherCategory("");
  }, [kind]);

  const baseCategories = supplier
    ? SUPPLIER_CATEGORIES
    : SUBCONTRACTOR_CATEGORIES;

  const allCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...baseCategories,
          ...customCategories,
        ]),
      ),
    [baseCategories, customCategories],
  );

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  function addOtherCategory() {
    const value = otherCategory
      .trim()
      .replace(/\s+/g, " ");

    if (!value) {
      return;
    }

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

    setOtherCategory("");
  }

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form = event.currentTarget;

    setSaving(true);
    setMessage(null);

    try {
      const data = new FormData(form);

      const get = (name: string) =>
        String(data.get(name) ?? "").trim();

      if (!selectedCategories.length) {
        setMessage(
          `Select at least one ${
            supplier
              ? "supply category"
              : "trade specialty"
          }.`,
        );
        return;
      }

      const name = get("name");

      if (!name) {
        setMessage(
          `Please enter the ${
            supplier
              ? "supplier"
              : "subcontractor"
          } name.`,
        );
        return;
      }

      const response = await fetch("/api/partners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind,
          name,
          specialties: selectedCategories,
          contact: get("contact"),
          phone: get("phone"),
          email: get("email"),
          address: get("address"),
          description: get("description"),
          accountName: get("accountName"),
          accountNumber: get("accountNumber"),
          bank: get("bank"),
          status: get("status") || "Active",
        }),
      });

      let result: {
        id?: string;
        error?: string;
      };

      try {
        result = await response.json();
      } catch {
        result = {
          error:
            "The server returned an invalid response.",
        };
      }

      if (!response.ok) {
        setMessage(
          result.error ??
            `Unable to create ${kind}.`,
        );
        return;
      }

      form.reset();
      setSelectedCategories([]);
      setOtherCategory("");

      setMessage(
        result.id
          ? `${result.id} created successfully.`
          : `${
              supplier
                ? "Supplier"
                : "Subcontractor"
            } created successfully.`,
      );

      router.refresh();
    } catch {
      setMessage(
        `Unable to create ${
          supplier
            ? "supplier"
            : "subcontractor"
        }. Please try again.`,
      );
    } finally {
      setSaving(false);
    }
  }

  const field = (
    label: string,
    name: string,
    required = true,
  ) => (
    <div>
      <label
        className="field-label"
        htmlFor={name}
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        required={required}
        maxLength={
          name === "phone" ? 15 : undefined
        }
        className="field-input"
      />
    </div>
  );

  return (
    <form onSubmit={submit}>
      <p className="section-title">
        New {supplier ? "supplier" : "subcontractor"}
      </p>

      <div className="mt-4 grid gap-4">
        {field(
          supplier
            ? "Supplier name"
            : "Subcontractor name",
          "name",
        )}

        <div>
          <label className="field-label">
            {supplier
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
              value={otherCategory}
              onChange={(event) =>
                setOtherCategory(event.target.value)
              }
              placeholder={`Add another ${
                supplier ? "category" : "specialty"
              }`}
              className="field-input"
            />

            <button
              type="button"
              onClick={addOtherCategory}
              className="btn-secondary shrink-0"
            >
              Add
            </button>
          </div>

          {!!selectedCategories.length && (
            <p className="mt-2 text-xs text-slate-500">
              Selected:{" "}
              {selectedCategories.join(", ")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field(
            "Contact person",
            "contact",
            false,
          )}

          {field(
            "Phone number",
            "phone",
          )}
        </div>

        {field(
          "Email address",
          "email",
          false,
        )}

        {field("Address", "address")}

        <div>
          <label
            className="field-label"
            htmlFor="description"
          >
            Description / narration
          </label>

          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Notes about this partner (optional)"
            className="field-input"
          />
        </div>

        <p className="section-title mt-2">
          Bank details
        </p>

        {field(
          "Account name",
          "accountName",
        )}

        <div className="grid grid-cols-2 gap-4">
          {field(
            "Account number",
            "accountNumber",
          )}

          {field(
            "Bank name",
            "bank",
          )}
        </div>

        <div>
          <label
            className="field-label"
            htmlFor="status"
          >
            Status
          </label>

          <select
            id="status"
            name="status"
            defaultValue="Active"
            className="field-input"
          >
            <option value="Active">
              Active
            </option>

            <option value="Inactive">
              Inactive
            </option>
          </select>
        </div>
      </div>

      {message && (
        <p
          className={`mt-3 text-sm ${
            message
              .toLowerCase()
              .includes("success") ||
            message
              .toLowerCase()
              .includes("created")
              ? "text-emerald-600"
              : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        className="btn-primary mt-6 w-full"
        disabled={saving}
      >
        {saving
          ? "Saving…"
          : `Create ${
              supplier
                ? "supplier"
                : "subcontractor"
            }`}
      </button>
    </form>
  );
}
