"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { date, money } from "@/lib/client-utils";

type Item = any;

export default function ApprovalQueue({ viewer, inflows, outflows }: { viewer: { userId: string; roleName: string }; inflows: Item[]; outflows: Item[] }) {
  const router = useRouter();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState<Record<string, boolean>>({});
  const [overrideReason, setOverrideReason] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  const canApprove = ["Authorizer", "MD", "Super User"].includes(viewer.roleName);
  const pending = [
    ...inflows.map((row) => ({ ...row, kind: "Cash Inflow", table: "cashinflowreceivables" })),
    ...outflows.map((row) => ({ ...row, kind: "Expense Request", table: "cashoutflowexpenditure" })),
  ].filter((row) => row.approvalstatus === "Pending");

  async function decide(row: Item, status: "Approved" | "Rejected", withOverride = false) {
    if (status === "Rejected" && !reason[row.transactionid]) {
      return setMessage("A rejection reason is required.");
    }
    if (withOverride && !overrideReason[row.transactionid]) {
      return setMessage("An override reason is required.");
    }

    setMessage(null);
    setSubmitting((s) => ({ ...s, [row.transactionid]: true }));

    const response = await fetch("/api/transactions/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: row.table,
        transactionid: row.transactionid,
        status,
        reason: reason[row.transactionid] || null,
        kind: row.kind,
        makeruserid: row.makeruserid,
        ...(withOverride
          ? { override: true, overridereason: overrideReason[row.transactionid] }
          : {}),
      }),
    });
    const result = await response.json();
    setSubmitting((s) => ({ ...s, [row.transactionid]: false }));

    if (!response.ok) {
      if (result.requiresOverride) {
        setNeedsOverride((s) => ({ ...s, [row.transactionid]: true }));
        setMessage(null);
        return;
      }
      return setMessage(result.error);
    }

    router.refresh();
  }

  return (
    <section className="mt-6 card overflow-hidden">
      <div className="border-b p-5">
        <p className="section-title">Pending approvals</p>
        <p className="mt-1 text-sm text-slate-500">Review all request details before authorizing or rejecting.</p>
      </div>
      {!canApprove ? (
        <p className="p-6 text-sm text-amber-700">Only an Authorizer, MD, or Super User can approve transactions.</p>
      ) : (
        <div className="divide-y">
          {pending.map((row) => (
            <article key={row.transactionid} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <b>{row.kind} · {row.transactionid}</b>
                  <p className="mt-1 text-sm text-slate-500">{money(row.amount)} · Initiated by {row.makeruserid}</p>
                </div>
                <span className="badge-warning">Pending</span>
              </div>

              <details className="mt-4 rounded-md border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-navy">View request details</summary>
                <div className="grid gap-4 border-t border-slate-200 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Project" value={row.projectname ?? row.projectid ?? "No project"} />
                  <Detail label="Payee" value={row.payeename ?? "Client payment"} />
                  <Detail label="Category" value={row.expenditurecategory ?? "Cash inflow"} />
                  <Detail label="Amount" value={money(row.amount)} />
                  <Detail label="Request date" value={date(row.transactiondate)} />
                  <Detail label="Payment method" value={row.paymentmethod} />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Detail label="Description" value={row.description || "No description supplied"} />
                  </div>
                </div>
              </details>

              {needsOverride[row.transactionid] ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-800">
                    This project&apos;s status is Pending. Approving this expense requires an override.
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    The override and your reason will be recorded separately in the Audit Trail.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={overrideReason[row.transactionid] ?? ""}
                      onChange={(event) =>
                        setOverrideReason({ ...overrideReason, [row.transactionid]: event.target.value })
                      }
                      placeholder="Reason for overriding the Pending project status"
                      className="field-input max-w-sm"
                    />
                    <button
                      onClick={() => decide(row, "Approved", true)}
                      disabled={row.makeruserid === viewer.userId || submitting[row.transactionid]}
                      className="btn-primary"
                    >
                      {submitting[row.transactionid] ? "Overriding…" : "Confirm override & approve"}
                    </button>
                    <button
                      onClick={() =>
                        setNeedsOverride((s) => ({ ...s, [row.transactionid]: false }))
                      }
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    value={reason[row.transactionid] ?? ""}
                    onChange={(event) => setReason({ ...reason, [row.transactionid]: event.target.value })}
                    placeholder="Rejection reason (required only to reject)"
                    className="field-input max-w-sm"
                  />
                  <button
                    onClick={() => decide(row, "Approved")}
                    disabled={row.makeruserid === viewer.userId || submitting[row.transactionid]}
                    className="btn-primary"
                  >
                    {submitting[row.transactionid] ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={() => decide(row, "Rejected")}
                    disabled={row.makeruserid === viewer.userId || submitting[row.transactionid]}
                    className="btn-secondary"
                  >
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
          {!pending.length && <p className="p-10 text-center text-slate-400">No pending transactions.</p>}
        </div>
      )}
      {message && <p className="px-5 pb-5 text-sm text-red-600">{message}</p>}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}