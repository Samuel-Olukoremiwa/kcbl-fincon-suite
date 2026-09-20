"use client";

import { useMemo, useState } from "react";
import ClientKycForm from "./client-kyc-form";
import EditClientRequest from "./edit-client-request";

type Client = Record<string, any>;

function clientTypeBadgeClass(type: string) {
  return type === "Corporate"
    ? "badge-brand"
    : "badge bg-navy-50 text-navy";
}

function expiryBadge(idexpirydate: string | null | undefined) {
  if (!idexpirydate) return null;

  const daysLeft = Math.ceil(
    (new Date(idexpirydate).getTime() - Date.now()) /
      (1000 * 60 * 60 * 24),
  );

  if (daysLeft < 0) {
    return <span className="badge-danger">ID expired</span>;
  }

  if (daysLeft <= 30) {
    return (
      <span className="badge-warning">
        ID expiring soon
      </span>
    );
  }

  return null;
}

export default function ClientWorkspace({
  clients,
  currentUserId,
  clientUsers,
  canCreate,
}: {
  clients: Client[];
  currentUserId: string;
  clientUsers: {
    userid: string;
    fullname: string;
    email: string;
  }[];
  canCreate: boolean;
}) {
  const [view, setView] = useState<"existing" | "new">(
    "existing",
  );
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "All" | "Individual" | "Corporate" | "Other"
  >("All");

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesType =
        typeFilter === "All" ||
        client.clienttype === typeFilter;

      const matchesSearch =
        !search ||
        `${client.clientid} ${client.fullnameorcompanyname} ${client.email}`
          .toLowerCase()
          .includes(search);

      return matchesType && matchesSearch;
    });
  }, [clients, query, typeFilter]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          className={
            view === "existing"
              ? "btn-primary"
              : "btn-secondary"
          }
          onClick={() => setView("existing")}
        >
          Existing clients
        </button>

        {canCreate && (
          <button
            type="button"
            className={
              view === "new"
                ? "btn-primary"
                : "btn-secondary"
            }
            onClick={() => setView("new")}
          >
            Create new client
          </button>
        )}
      </div>

      {view === "new" && canCreate ? (
        <div className="card mt-6 max-w-3xl p-6">
          <ClientKycForm
            currentUserId={currentUserId}
            existingIds={clients.map((c) => c.clientid)}
            clientUsers={clientUsers}
          />
        </div>
      ) : (
        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <input
                className="field-input max-w-md"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by client code, name or email…"
              />

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "All",
                    "Individual",
                    "Corporate",
                    "Other",
                  ] as const
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={
                      typeFilter === type
                        ? "btn-primary"
                        : "btn-secondary"
                    }
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Showing {rows.length} of {clients.length}{" "}
              clients
              {typeFilter !== "All"
                ? ` · ${typeFilter} clients`
                : ""}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">
                    Client information
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr
                    key={c.clientid}
                    className="row-interactive"
                  >
                    <td className="px-4 py-3">
                      <b>{c.fullnameorcompanyname}</b>
                      <span className="block text-xs text-slate-400">
                        {c.clientid}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={clientTypeBadgeClass(
                          c.clienttype,
                        )}
                      >
                        {c.clienttype}
                      </span>

                      {expiryBadge(c.idexpirydate) && (
                        <span className="ml-1.5">
                          {expiryBadge(c.idexpirydate)}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {c.email}
                      <span className="block text-xs">
                        {c.phonenumber}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {c.preferredpaymentmethod}
                    </td>

                    <td className="px-4 py-3">
                      <EditClientRequest client={c as any} />
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      No matching clients.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}