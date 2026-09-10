"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Request = {
  requestid: number; entitytype: string; entityid: string;
  changes: Record<string, any>; previousvalues: Record<string, any>;
  requestedbyuserid: string; status: string;
};

export default function EditRequestsClient({ viewer }: { viewer: { userId: string; roleName: string } }) {
  const r = useRouter();
  const [requests, setRequests] = useState<Request[]>([]);
  const [reason, setReason] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const canDecide = ["Authorizer", "Super User"].includes(viewer.roleName);

  async function load() {
    const res = await fetch("/api/edit-requests?status=Pending");
    const result = await res.json();
    if (res.ok) setRequests(result.requests);
  }
  useEffect(() => { load(); }, []);

  async function decide(requestid: number, status: "Approved" | "Rejected") {
    if (status === "Rejected" && !reason[requestid]) return setMsg("A rejection reason is required.");
    const res = await fetch(`/api/edit-requests/${requestid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comments: reason[requestid] || null }),
    });
    const result = await res.json();
    if (!res.ok) return setMsg(result.error);
    load();
    r.refresh();
  }

  return (
    <div className="mt-8 card overflow-hidden">
      {!canDecide && <p className="p-4 text-sm text-amber-700">You can view pending requests here. Only an Authorizer or Super User can approve them.</p>}
      {msg && <p className="p-4 text-sm text-red-600">{msg}</p>}
      <div className="divide-y">
        {requests.map((req) => (
          <div key={req.requestid} className="p-5">
            <b>{req.entitytype.toUpperCase()} · {req.entityid}</b>
            <p className="mt-1 text-sm text-slate-500">Requested by {req.requestedbyuserid}</p>
            <div className="mt-3 grid gap-1 text-sm">
              {Object.entries(req.changes).map(([field, value]) => (
                <p key={field}>
                  <span className="text-slate-500">{field}:</span>{" "}
                  <span className="line-through text-slate-400">{String((req.previousvalues as any)[field] ?? "—")}</span>
                  {" → "}
                  <b>{String(value)}</b>
                </p>
              ))}
            </div>
            {canDecide && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={reason[req.requestid] ?? ""}
                  onChange={(e) => setReason({ ...reason, [req.requestid]: e.target.value })}
                  placeholder="Rejection reason (required only to reject)"
                  className="field-input max-w-sm"
                />
                <button onClick={() => decide(req.requestid, "Approved")} className="btn-primary">Approve</button>
                <button onClick={() => decide(req.requestid, "Rejected")} className="btn-secondary">Reject</button>
              </div>
            )}
          </div>
        ))}
        {!requests.length && <p className="p-10 text-center text-slate-400">No pending update requests.</p>}
      </div>
    </div>
  );
}