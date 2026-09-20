"use client";

import { useMemo, useState } from "react";
import EditPartnerRequest from "./edit-partner-request";

type Partner = {
  id: string;
  name: string;
  category: string;
  email: string | null;
  phonenumber: string;
  address: string;
  description: string | null;
  status: string;
  kind: "Supplier" | "Subcontractor";
  supplycategory?: string;
  tradespecialty?: string;
};

type PartnerDirectoryProps = {
  rows: Partner[];
  selectedKind?: "Supplier" | "Subcontractor";
};

export default function PartnerDirectory({
  rows,
  selectedKind,
}: PartnerDirectoryProps) {
  const [query, setQuery] = useState("");

  const [kind, setKind] = useState<
    "All types" | "Supplier" | "Subcontractor"
  >(
    selectedKind ?? "All types",
  );

  const [status, setStatus] = useState<
    "All statuses" | "Active" | "Inactive"
  >("All statuses");

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !search ||
        `${row.id} ${row.name} ${row.category} ${
          row.email ?? ""
        } ${row.phonenumber}`
          .toLowerCase()
          .includes(search);

      const matchesKind =
        kind === "All types" || row.kind === kind;

      const matchesStatus =
        status === "All statuses" || row.status === status;

      return matchesSearch && matchesKind && matchesStatus;
    });
  }, [rows, query, kind, status]);

  function clearFilters() {
    setQuery("");
    setKind(selectedKind ?? "All types");
    setStatus("All statuses");
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Search suppliers and subcontractors"
            className="field-input min-w-[220px] flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code, category or contact…"
          />

          <button
            type="button"
            onClick={clearFilters}
            className="btn-secondary"
          >
            Clear filters
          </button>
        </div>

        {/* Type toggle */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Type
          </span>

          <button
            type="button"
            onClick={() => setKind("All types")}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              kind === "All types"
                ? "border-navy bg-navy text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setKind("Supplier")}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              kind === "Supplier"
                ? "border-navy bg-navy text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Suppliers
          </button>

          <button
            type="button"
            onClick={() => setKind("Subcontractor")}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              kind === "Subcontractor"
                ? "border-navy bg-navy text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Subcontractors
          </button>
        </div>

        {/* Status toggle */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Status
          </span>

          <button
            type="button"
            onClick={() => setStatus("All statuses")}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              status === "All statuses"
                ? "border-navy bg-navy text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setStatus("Active")}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              status === "Active"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Active
          </button>

          <button
            type="button"
            onClick={() => setStatus("Inactive")}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              status === "Inactive"
                ? "border-slate-600 bg-slate-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">
                Category / specialty
              </th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <tr key={`${row.kind}-${row.id}`}>
                <td className="px-4 py-3">
                  <b>{row.name}</b>

                  <span className="block text-xs text-slate-400">
                    {row.id}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className="rounded-full bg-navy-50 px-2 py-1 text-xs text-navy">
                    {row.kind}
                  </span>
                </td>

                <td className="px-4 py-3">
                  {row.category}
                </td>

                <td className="px-4 py-3">
                  {row.phonenumber}

                  <span className="block text-xs">
                    {row.email}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.status === "Active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <EditPartnerRequest
                    kind={
                      row.kind === "Supplier"
                        ? "supplier"
                        : "subcontractor"
                    }
                    entityid={row.id}
                    partner={{
                      phonenumber: row.phonenumber,
                      email: row.email,
                      address: row.address,
                      ...(row.kind === "Supplier"
                        ? {
                            supplycategory:
                              row.supplycategory ??
                              row.category,
                          }
                        : {
                            tradespecialty:
                              row.tradespecialty ??
                              row.category,
                          }),
                      description: row.description,
                    }}
                  />
                </td>
              </tr>
            ))}

            {!filtered.length && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-400"
                >
                  No partners match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}