"use client";

import { useMemo, useState } from "react";
import { date, money } from "@/lib/client-utils";

type Item = Record<string, any>;

function formatDateTime(
  value: string | null | undefined,
  time?: string | null
) {
  if (!value) return "—";

  return (
    <>
      {date(value)}
      {time && <span className="block text-xs text-slate-400">{time}</span>}
    </>
  );
}

export default function AuditWorkspace({
  transactions,
  records,
  progressReports,
}: {
  transactions: Item[];
  records: Item[];
  progressReports: Item[];
}) {
  const [view, setView] = useState<
    "transactions" | "records" | "progress"
  >("transactions");

  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const source =
    view === "transactions"
      ? transactions
      : view === "records"
        ? records
        : progressReports;

  const rows = useMemo(() => {
    return source.filter((row) => {
      const eventDate =
        view === "transactions"
          ? row.initiatedDate
          : view === "records"
            ? row.date
            : row.submittedAt?.slice(0, 10);

      const matchesFrom = !from || (eventDate && eventDate >= from);
      const matchesTo = !to || (eventDate && eventDate <= to);

      const matchesSearch = JSON.stringify(row)
        .toLowerCase()
        .includes(query.toLowerCase());

      return matchesFrom && matchesTo && matchesSearch;
    });
  }, [source, query, from, to, view]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-4">
        <button
          className={view === "transactions" ? "btn-primary" : "btn-secondary"}
          onClick={() => setView("transactions")}
        >
          Transaction Audit
        </button>

        <button
          className={view === "records" ? "btn-primary" : "btn-secondary"}
          onClick={() => setView("records")}
        >
          Projects, Clients & Partners
        </button>

        <button
          className={view === "progress" ? "btn-primary" : "btn-secondary"}
          onClick={() => setView("progress")}
        >
          Progress Reports
        </button>
      </div>

      <div className="card mt-6 flex flex-wrap gap-3 p-4">
        <input
          className="field-input min-w-[240px] flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search any column: project, user, status, ID…"
        />

        <input
          className="field-input"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="Filter from date"
        />

        <input
          className="field-input"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="Filter to date"
        />

        <button
          className="btn-secondary"
          onClick={() => {
            setQuery("");
            setFrom("");
            setTo("");
          }}
        >
          Clear filters
        </button>
      </div>

      {view === "transactions" && <TransactionAudit rows={rows} />}
      {view === "records" && <RecordAudit rows={rows} />}
      {view === "progress" && <ProgressReportAudit rows={rows} />}
    </div>
  );
}

function TransactionAudit({ rows }: { rows: Item[] }) {
  return (
    <div className="mt-6 space-y-6">
      <TransactionGroup
        title="Cash Inflows"
        rows={rows.filter((row) => row.direction === "Inflow")}
        empty="No cash-inflow audit records match these filters."
      />

      <TransactionGroup
        title="Cash Outflows"
        rows={rows.filter((row) => row.direction === "Outflow")}
        empty="No cash-outflow audit records match these filters."
      />
    </div>
  );
}

function TransactionGroup({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Item[];
  empty: string;
}) {
  return (
    <section className="card overflow-x-auto">
      <div className="border-b border-slate-200 p-5">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Initiator and authorizer history by project.
        </p>
      </div>

      <table className="w-full min-w-[950px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Transaction / Project</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Initiated By</th>
            <th className="px-4 py-3">Initiated Date & Time</th>
            <th className="px-4 py-3">Authorized By</th>
            <th className="px-4 py-3">Authorized Date & Time</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <b>{row.id}</b>
                <span className="block text-xs text-slate-500">
                  {row.projectName ?? "No project"}
                </span>
              </td>

              <td className="px-4 py-3">{money(row.amount)}</td>
              <td className="px-4 py-3">{row.initiatorName}</td>

              <td className="px-4 py-3 text-xs">
                {formatDateTime(row.initiatedDate, row.initiatedTime)}
              </td>

              <td className="px-4 py-3">
                {row.authorizerName ?? "Awaiting authorization"}
              </td>

              <td className="px-4 py-3 text-xs">
                {formatDateTime(
                  row.authorizedDate,
                  row.authorizedTime
                )}
              </td>

              <td className="px-4 py-3">
                <span className="rounded-full bg-navy-50 px-2 py-1 text-xs text-navy">
                  {row.status}
                </span>
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-slate-400"
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function RecordAudit({ rows }: { rows: Item[] }) {
  return (
    <section className="card mt-6 overflow-x-auto">
      <div className="border-b border-slate-200 p-5">
        <h2 className="font-semibold">Record Creation History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Projects, clients, suppliers, and subcontractors added to the system.
        </p>
      </div>

      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Record</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Added By</th>
            <th className="px-4 py-3">Date & Time</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.logid}>
              <td className="px-4 py-3">
                <b>{row.id}</b>
              </td>

              <td className="px-4 py-3">{row.type}</td>
              <td className="px-4 py-3">{row.userName}</td>

              <td className="px-4 py-3 text-xs">
                {formatDateTime(row.date, row.time)}
              </td>

              <td className="px-4 py-3 text-slate-500">
                {row.comments ?? "Created"}
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-10 text-center text-slate-400"
              >
                No records match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ProgressReportAudit({ rows }: { rows: Item[] }) {
  return (
    <section className="card mt-6 overflow-x-auto">
      <div className="border-b border-slate-200 p-5">
        <h2 className="font-semibold">Progress Report Audit History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Submission, supervisor review, mandatory progress percentage, and MD
          Office authorization history.
        </p>
      </div>

      <table className="w-full min-w-[1150px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Project / Report</th>
            <th className="px-4 py-3">Submitted By</th>
            <th className="px-4 py-3">Supervisor Review</th>
            <th className="px-4 py-3">% Progress</th>
            <th className="px-4 py-3">MD Office Authorization</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Comments</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <b>{row.projectName}</b>
                <span className="block text-xs text-slate-500">
                  {row.filename} · {date(row.month)}
                </span>
              </td>

              <td className="px-4 py-3">
                {row.submittedBy}
                <span className="block text-xs text-slate-400">
                  {formatDateTime(row.submittedAt)}
                </span>
              </td>

              <td className="px-4 py-3">
                {row.reviewedBy ?? "Awaiting review"}
                <span className="block text-xs text-slate-400">
                  {formatDateTime(row.reviewedAt)}
                </span>
              </td>

              <td className="px-4 py-3">
                {row.progress ?? "—"}
                {row.progress !== null && row.progress !== undefined
                  ? "%"
                  : ""}
              </td>

              <td className="px-4 py-3">
                {row.authorizedBy ?? "Awaiting MD Office"}
                <span className="block text-xs text-slate-400">
                  {formatDateTime(row.authorizedAt)}
                </span>
              </td>

              <td className="px-4 py-3">
                <span className="rounded-full bg-navy-50 px-2 py-1 text-xs text-navy">
                  {row.status}
                </span>
              </td>

              <td className="px-4 py-3 text-slate-500">
                {row.comments ?? "—"}
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-slate-400"
              >
                No Progress Report audit records match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}