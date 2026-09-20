"use client";

import { useEffect, useMemo, useState } from "react";

type ViewerPermissions = {
  canSubmit: boolean;
  canFinanceReview: boolean;
  canMdReview: boolean;
};

type Batch = {
  archiveid: number;
  financialyear: number;
  halfyear: 1 | 2;
  archivedat: string;
  archivedbyuserid: string;
};

type ArchiveRequest = {
  requestid: string;
  financialyear: number;
  halfyear: 1 | 2;
  requestedbyuserid: string;
  requestedat: string;
  financereviewedbyuserid: string | null;
  financereviewedat: string | null;
  financeremarks: string | null;
  mdreviewedbyuserid: string | null;
  mdreviewedat: string | null;
  mdremarks: string | null;
  status: string;
  archiveid: number | null;
};

type RestorationRequest = {
  requestid: string;
  archiveid: number;
  requestedbyuserid: string;
  requestedat: string;
  financereviewedbyuserid: string | null;
  financereviewedat: string | null;
  financeremarks: string | null;
  mdreviewedbyuserid: string | null;
  mdreviewedat: string | null;
  mdremarks: string | null;
  status: string;
  restoredat: string | null;
};

type ArchiveRecords = {
  batch: Batch;
  clients: any[];
  projects: any[];
  suppliers: any[];
  subcontractors: any[];
  inflows: any[];
  outflows: any[];
};

type Props = {
  role: string;
  department: string | null;
  canArchive: boolean;
};

export default function DataArchiveTab({
  role,
  department,
  canArchive,
}: Props) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [requests, setRequests] = useState<ArchiveRequest[]>([]);
  const [restorations, setRestorations] = useState<RestorationRequest[]>([]);
  const [permissions, setPermissions] = useState<ViewerPermissions>({
    canSubmit: false,
    canFinanceReview: false,
    canMdReview: false,
  });

  const [year, setYear] = useState(new Date().getFullYear());
  const [half, setHalf] = useState<1 | 2>(1);

  const [selectedBatch, setSelectedBatch] = useState<number | "">("");
  const [records, setRecords] = useState<ArchiveRecords | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  const [financeComments, setFinanceComments] = useState<
    Record<string, string>
  >({});

  const [mdComments, setMdComments] = useState<Record<string, string>>({});

  const [restoreFinanceComments, setRestoreFinanceComments] = useState<
    Record<string, string>
  >({});

  const [restoreMdComments, setRestoreMdComments] = useState<
    Record<string, string>
  >({});

  async function load() {
    setLoading(true);

    const res = await fetch("/api/archive", {
      cache: "no-store",
    });

    const result = await res.json();

    setLoading(false);

    if (!res.ok) {
      setMessage(result.error ?? "Unable to load archive data.");
      return;
    }

    setBatches(result.batches ?? []);
    setRequests(result.requests ?? []);
    setRestorations(result.restorations ?? []);
    setPermissions(
      result.permissions ?? {
        canSubmit: false,
        canFinanceReview: false,
        canMdReview: false,
      },
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function postAction(body: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage(result.error ?? "Archive operation failed.");
        return false;
      }

      setMessage("Action completed successfully.");
      await load();
      return true;
    } catch {
      setMessage("Unable to complete archive operation.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitArchiveRequest() {
    if (
      !window.confirm(
        `Submit ${year} H${half} for the three-stage archive approval process?`,
      )
    ) {
      return;
    }

    await postAction({
      action: "submit",
      financialyear: year,
      halfyear: half,
    });
  }

  async function reviewArchive(
    requestid: string,
    approved: boolean,
    finalStage: boolean,
  ) {
    const comments = finalStage
      ? mdComments[requestid] ?? ""
      : financeComments[requestid] ?? "";

    if (!approved && !comments.trim()) {
      setMessage("A rejection reason is required.");
      return;
    }

    await postAction({
      action: finalStage ? "md-review" : "finance-review",
      requestid,
      approved,
      comments: comments.trim() || null,
    });
  }

  async function submitRestoreRequest(archiveid: number) {
    if (
      !window.confirm(
        `Submit archive batch ${archiveid} for restoration approval?`,
      )
    ) {
      return;
    }

    await postAction({
      action: "restore-submit",
      archiveid,
    });
  }

  async function reviewRestoration(
    requestid: string,
    approved: boolean,
    finalStage: boolean,
  ) {
    const comments = finalStage
      ? restoreMdComments[requestid] ?? ""
      : restoreFinanceComments[requestid] ?? "";

    if (!approved && !comments.trim()) {
      setMessage("A rejection reason is required.");
      return;
    }

    await postAction({
      action: finalStage
        ? "restore-md-review"
        : "restore-finance-review",
      requestid,
      approved,
      comments: comments.trim() || null,
    });
  }

  async function viewBatch(archiveid: number | "") {
    setSelectedBatch(archiveid);
    setRecords(null);

    if (archiveid === "") return;

    setLoadingRecords(true);

    const res = await fetch(`/api/archive/${archiveid}`, {
      cache: "no-store",
    });

    const result = await res.json();

    setLoadingRecords(false);

    if (!res.ok) {
      setMessage(result.error ?? "Unable to load archived records.");
      return;
    }

    setRecords(result);
  }

  const pendingFinanceArchives = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "Pending Finance",
      ),
    [requests],
  );

  const pendingMdArchives = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "Pending MD Office",
      ),
    [requests],
  );

  const pendingFinanceRestorations = useMemo(
    () =>
      restorations.filter(
        (request) => request.status === "Pending Finance",
      ),
    [restorations],
  );

  const pendingMdRestorations = useMemo(
    () =>
      restorations.filter(
        (request) => request.status === "Pending MD Office",
      ),
    [restorations],
  );

  if (loading) {
    return (
      <p className="text-sm text-slate-400">
        Loading archive workflow…
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="section-title">Data Archive</p>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Financial records move through Audit/Internal Control,
          Finance &amp; Admin, and MD Office before the system archives
          the approved period.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StageCard
            number="1"
            title="Audit/Internal Control"
            description="Submit the financial period for archive review."
            active={department === "Audit/Internal Control"}
          />

          <StageCard
            number="2"
            title="Finance & Admin"
            description="Review and approve or reject the archive request."
            active={department === "Finance & Admin"}
          />

          <StageCard
            number="3"
            title="MD Office"
            description="Provide final approval. The system then archives the records."
            active={department === "MD Office"}
          />
        </div>
      </section>

      {permissions.canSubmit && (
        <section className="card p-6">
          <p className="section-title">Submit archive request</p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="field-label">Financial year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) =>
                  setYear(Number(event.target.value))
                }
                className="field-input w-32"
              />
            </div>

            <div>
              <label className="field-label">Half-year</label>
              <select
                value={half}
                onChange={(event) =>
                  setHalf(Number(event.target.value) as 1 | 2)
                }
                className="field-input"
              >
                <option value={1}>H1 — Jan to Jun</option>
                <option value={2}>H2 — Jul to Dec</option>
              </select>
            </div>

            <button
              type="button"
              onClick={submitArchiveRequest}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
        </section>
      )}

      {permissions.canFinanceReview && (
        <section className="card overflow-hidden">
          <div className="border-b p-5">
            <p className="section-title">
              Finance &amp; Admin — Archive approvals
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Review archive requests submitted by Audit/Internal
              Control.
            </p>
          </div>

          <div className="divide-y">
            {pendingFinanceArchives.map((request) => (
              <ApprovalRow
                key={request.requestid}
                title={`${request.financialyear} — H${request.halfyear}`}
                reference={request.requestid}
                comments={financeComments[request.requestid] ?? ""}
                onComments={(value) =>
                  setFinanceComments((current) => ({
                    ...current,
                    [request.requestid]: value,
                  }))
                }
                onApprove={() =>
                  reviewArchive(request.requestid, true, false)
                }
                onReject={() =>
                  reviewArchive(request.requestid, false, false)
                }
                disabled={saving}
              />
            ))}

            {!pendingFinanceArchives.length && (
              <Empty text="No archive requests awaiting Finance & Admin review." />
            )}
          </div>
        </section>
      )}

      {permissions.canMdReview && (
        <section className="card overflow-hidden">
          <div className="border-b p-5">
            <p className="section-title">
              MD Office — Final archive approvals
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Final approval creates the archive batch and locks the
              approved financial records to that archive.
            </p>
          </div>

          <div className="divide-y">
            {pendingMdArchives.map((request) => (
              <ApprovalRow
                key={request.requestid}
                title={`${request.financialyear} — H${request.halfyear}`}
                reference={request.requestid}
                comments={mdComments[request.requestid] ?? ""}
                onComments={(value) =>
                  setMdComments((current) => ({
                    ...current,
                    [request.requestid]: value,
                  }))
                }
                onApprove={() =>
                  reviewArchive(request.requestid, true, true)
                }
                onReject={() =>
                  reviewArchive(request.requestid, false, true)
                }
                disabled={saving}
              />
            ))}

            {!pendingMdArchives.length && (
              <Empty text="No archive requests awaiting MD Office approval." />
            )}
          </div>
        </section>
      )}

      <section>
        <p className="section-title">Archive history</p>

        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Archive</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Archived on</th>
                <th className="px-4 py-3">Archived by</th>
                <th className="px-4 py-3">Restore</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => {
                const restoration = restorations.find(
                  (item) => item.archiveid === batch.archiveid,
                );

                return (
                  <tr key={batch.archiveid}>
                    <td className="px-4 py-3 font-semibold">
                      ARC-{batch.archiveid}
                    </td>

                    <td className="px-4 py-3">
                      <b>
                        {batch.financialyear} — H{batch.halfyear}
                      </b>
                    </td>

                    <td className="px-4 py-3">
                      {formatDate(batch.archivedat)}
                    </td>

                    <td className="px-4 py-3 text-slate-500">
                      {batch.archivedbyuserid}
                    </td>

                    <td className="px-4 py-3">
                      {permissions.canSubmit &&
                      !restoration ? (
                        <button
                          type="button"
                          onClick={() =>
                            submitRestoreRequest(batch.archiveid)
                          }
                          disabled={saving}
                          className="btn-secondary"
                        >
                          Request restoration
                        </button>
                      ) : restoration ? (
                        <span
                          className={statusClass(restoration.status)}
                        >
                          {restoration.status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!batches.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No archived periods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {permissions.canFinanceReview && (
        <section className="card overflow-hidden">
          <div className="border-b p-5">
            <p className="section-title">
              Finance &amp; Admin — Restoration approvals
            </p>
          </div>

          <div className="divide-y">
            {pendingFinanceRestorations.map((request) => (
              <ApprovalRow
                key={request.requestid}
                title={`Archive ${request.archiveid}`}
                reference={request.requestid}
                comments={
                  restoreFinanceComments[request.requestid] ?? ""
                }
                onComments={(value) =>
                  setRestoreFinanceComments((current) => ({
                    ...current,
                    [request.requestid]: value,
                  }))
                }
                onApprove={() =>
                  reviewRestoration(
                    request.requestid,
                    true,
                    false,
                  )
                }
                onReject={() =>
                  reviewRestoration(
                    request.requestid,
                    false,
                    false,
                  )
                }
                disabled={saving}
              />
            ))}

            {!pendingFinanceRestorations.length && (
              <Empty text="No restoration requests awaiting Finance & Admin review." />
            )}
          </div>
        </section>
      )}

      {permissions.canMdReview && (
        <section className="card overflow-hidden">
          <div className="border-b p-5">
            <p className="section-title">
              MD Office — Final restoration approvals
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Final approval removes the archive lock from the
              approved financial records. Their original financial
              approval status is preserved.
            </p>
          </div>

          <div className="divide-y">
            {pendingMdRestorations.map((request) => (
              <ApprovalRow
                key={request.requestid}
                title={`Archive ${request.archiveid}`}
                reference={request.requestid}
                comments={restoreMdComments[request.requestid] ?? ""}
                onComments={(value) =>
                  setRestoreMdComments((current) => ({
                    ...current,
                    [request.requestid]: value,
                  }))
                }
                onApprove={() =>
                  reviewRestoration(
                    request.requestid,
                    true,
                    true,
                  )
                }
                onReject={() =>
                  reviewRestoration(
                    request.requestid,
                    false,
                    true,
                  )
                }
                disabled={saving}
              />
            ))}

            {!pendingMdRestorations.length && (
              <Empty text="No restoration requests awaiting MD Office approval." />
            )}
          </div>
        </section>
      )}

      {message && (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {message}
        </div>
      )}

      <section>
        <p className="section-title">View archived records</p>

        <div className="mt-3">
          <label className="field-label">Select a period</label>

          <select
            value={selectedBatch}
            onChange={(event) =>
              viewBatch(
                event.target.value === ""
                  ? ""
                  : Number(event.target.value),
              )
            }
            className="field-input max-w-xs"
          >
            <option value="">Select an archived period…</option>

            {batches.map((batch) => (
              <option
                key={batch.archiveid}
                value={batch.archiveid}
              >
                {batch.financialyear} — H{batch.halfyear}
              </option>
            ))}
          </select>
        </div>

        {loadingRecords && (
          <p className="mt-4 text-sm text-slate-400">
            Loading records…
          </p>
        )}

        {records && (
          <div className="mt-6 space-y-6">
            <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold text-ink">
                  Archive {records.batch.archiveid}
                </p>
                <p className="text-sm text-slate-500">
                  {records.batch.financialyear} — H
                  {records.batch.halfyear}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadArchive(
                    records,
                    selectedBatch,
                  )
                }
                className="btn-secondary"
              >
                Download archived data
              </button>
            </div>

            <RecordSection
              title="Clients"
              rows={records.clients}
              columns={[
                "clientid",
                "fullnameorcompanyname",
                "clienttype",
              ]}
            />

            <RecordSection
              title="Projects"
              rows={records.projects}
              columns={[
                "projectid",
                "projecttitle",
                "estimatedvalue",
                "status",
              ]}
            />

            <RecordSection
              title="Suppliers"
              rows={records.suppliers}
              columns={[
                "supplierid",
                "suppliername",
                "supplycategory",
              ]}
            />

            <RecordSection
              title="Subcontractors"
              rows={records.subcontractors}
              columns={[
                "subcontractorid",
                "subcontractorname",
                "tradespecialty",
              ]}
            />

            <RecordSection
              title="Cash Inflow"
              rows={records.inflows}
              columns={[
                "transactionid",
                "amount",
                "transactiondate",
                "paymentmethod",
                "approvalstatus",
              ]}
            />

            <RecordSection
              title="Cash Outflow"
              rows={records.outflows}
              columns={[
                "transactionid",
                "amount",
                "transactiondate",
                "paymentmethod",
                "approvalstatus",
              ]}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function StageCard({
  number,
  title,
  description,
  active,
}: {
  number: string;
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 " +
        (active
          ? "border-navy bg-navy/[0.03]"
          : "border-slate-200 bg-white")
      }
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
          {number}
        </span>

        <p className="font-semibold text-ink">{title}</p>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

function ApprovalRow({
  title,
  reference,
  comments,
  onComments,
  onApprove,
  onReject,
  disabled,
}: {
  title: string;
  reference: string;
  comments: string;
  onComments: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs text-slate-400">
            Request: {reference}
          </p>
        </div>

        <span className="badge-warning">
          Awaiting approval
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={comments}
          onChange={(event) =>
            onComments(event.target.value)
          }
          placeholder="Rejection reason / approval comments"
          className="field-input min-w-[280px] flex-1"
          maxLength={255}
        />

        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="btn-primary"
        >
          Approve
        </button>

        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="btn-secondary"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="p-10 text-center text-sm text-slate-400">
      {text}
    </p>
  );
}

function statusClass(status: string) {
  if (status === "Restored") return "badge-success";
  if (status.includes("Rejected")) return "badge-danger";
  if (status.includes("Pending")) return "badge-warning";
  return "badge-neutral";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function downloadArchive(
  records: ArchiveRecords,
  archiveid: number | "",
) {
  const rows = Object.entries(records)
    .filter(([key]) => key !== "batch")
    .flatMap(([area, values]) =>
      (values as Record<string, unknown>[]).map(
        (row) => ({
          area,
          ...row,
        }),
      ),
    );

  if (!rows.length) return;

  const headers = [
    ...new Set(
      rows.flatMap((row) => Object.keys(row)),
    ),
  ];

  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) =>
          escape(
            row[header as keyof typeof row],
          ),
        )
        .join(","),
    ),
  ].join("\n");

  const url = URL.createObjectURL(
    new Blob([csv], {
      type: "text/csv;charset=utf-8",
    }),
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = `kcbl-archive-${archiveid}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

function RecordSection({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: any[];
  columns: string[];
}) {
  if (!rows.length) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} ({rows.length})
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-4 py-2"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td
                      key={column}
                      className="px-4 py-2 text-slate-600"
                    >
                      {String(
                        row[column] ?? "—",
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}