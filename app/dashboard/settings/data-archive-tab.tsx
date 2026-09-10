"use client";
import { useEffect, useState } from "react";

type Batch = { archiveid: number; financialyear: number; halfyear: 1 | 2; archivedat: string; archivedbyuserid: string };
type ArchiveRecords = {
  clients: any[]; projects: any[]; suppliers: any[]; subcontractors: any[]; inflows: any[]; outflows: any[];
};

export default function DataArchiveTab({ canArchive }: { canArchive: boolean }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [half, setHalf] = useState<1 | 2>(1);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedBatch, setSelectedBatch] = useState<number | "">("");
  const [records, setRecords] = useState<ArchiveRecords | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);

  async function load() {
    const res = await fetch("/api/archive");
    const result = await res.json();
    if (res.ok) setBatches(result.batches);
  }
  useEffect(() => { load(); }, []);

  async function runArchive() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ financialyear: year, halfyear: half }),
    });
    const result = await res.json();
    setSaving(false);
    setConfirming(false);
    if (!res.ok) return setMessage(result.error);
    setMessage(res.status === 207 ? result.error : `Archived ${year} H${half} successfully.`);
    load();
  }

  async function viewBatch(archiveid: number | "") {
    setSelectedBatch(archiveid);
    setRecords(null);
    if (archiveid === "") return;
    setLoadingRecords(true);
    const res = await fetch(`/api/archive/${archiveid}`);
    const result = await res.json();
    setLoadingRecords(false);
    if (res.ok) setRecords(result);
  }

  return (
    <div>
      <p className="section-title">Archive a financial period</p>
      <p className="mt-1 text-sm text-slate-500">
        Financial year runs January–December. Archiving locks all matching records as read-only. This cannot be undone.
      </p>

      {canArchive ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Financial year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="field-input w-32" />
          </div>
          <div>
            <label className="field-label">Half</label>
            <select value={half} onChange={(e) => setHalf(Number(e.target.value) as 1 | 2)} className="field-input">
              <option value={1}>H1 — Jan to Jun</option>
              <option value={2}>H2 — Jul to Dec</option>
            </select>
          </div>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="btn-primary">Archive this period</button>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2">
              <span className="text-sm text-amber-700">This is permanent. Confirm?</span>
              <button onClick={runArchive} disabled={saving} className="btn-primary">
                {saving ? "Archiving…" : "Yes, archive"}
              </button>
              <button onClick={() => setConfirming(false)} className="btn-secondary">Cancel</button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-amber-700">Only the Super User can archive a period. You can view archived records below.</p>
      )}

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}

      <p className="section-title mt-8">Archive history</p>
      <div className="card mt-3 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Archived on</th>
              <th className="px-4 py-3">Archived by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((b) => (
              <tr key={b.archiveid}>
                <td className="px-4 py-3"><b>{b.financialyear} — H{b.halfyear}</b></td>
                <td className="px-4 py-3">{new Date(b.archivedat).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-500">{b.archivedbyuserid}</td>
              </tr>
            ))}
            {!batches.length && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No periods archived yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="section-title mt-8">View archived records</p>
      <div className="mt-3">
        <label className="field-label">Select a period</label>
        <select
          value={selectedBatch}
          onChange={(e) => viewBatch(e.target.value === "" ? "" : Number(e.target.value))}
          className="field-input max-w-xs"
        >
          <option value="">Select an archived period…</option>
          {batches.map((b) => (
            <option key={b.archiveid} value={b.archiveid}>{b.financialyear} — H{b.halfyear}</option>
          ))}
        </select>
      </div>

      {loadingRecords && <p className="mt-4 text-sm text-slate-400">Loading records…</p>}

      {records && (
        <div className="mt-6 space-y-6">
          <RecordSection title="Clients" rows={records.clients} columns={["clientid", "fullnameorcompanyname", "clienttype"]} />
          <RecordSection title="Projects" rows={records.projects} columns={["projectid", "projecttitle", "estimatedvalue", "status"]} />
          <RecordSection title="Suppliers" rows={records.suppliers} columns={["supplierid", "suppliername", "supplycategory"]} />
          <RecordSection title="Subcontractors" rows={records.subcontractors} columns={["subcontractorid", "subcontractorname", "tradespecialty"]} />
          <RecordSection title="Cash Inflow" rows={records.inflows} columns={["transactionid", "amount", "transactiondate", "approvalstatus"]} />
          <RecordSection title="Cash Outflow" rows={records.outflows} columns={["transactionid", "amount", "transactiondate", "approvalstatus"]} />
        </div>
      )}
    </div>
  );
}

function RecordSection({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title} ({rows.length})</p>
      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{columns.map((c) => <th key={c} className="px-4 py-2">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => <td key={c} className="px-4 py-2 text-slate-600">{String(row[c] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}