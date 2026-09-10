"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Client = {
  clientid: string; email: string; address: string;
  idtype: string | null; idnumber: string | null;
  issuingauthority: string | null; idexpirydate: string | null;
};

export default function EditClientRequest({ client }: { client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: client.email ?? "",
    address: client.address ?? "",
    idtype: client.idtype ?? "",
    idnumber: client.idnumber ?? "",
    issuingauthority: client.issuingauthority ?? "",
    idexpirydate: client.idexpirydate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const changes: Record<string, string> = {};
    (Object.keys(form) as (keyof typeof form)[]).forEach((key) => {
      const original = (client as any)[key] ?? "";
      if (form[key] !== original) changes[key] = form[key];
    });

    if (!Object.keys(changes).length) {
      setSaving(false);
      return setMsg("No changes to submit.");
    }

    const res = await fetch("/api/edit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entitytype: "client", entityid: client.clientid, changes }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) return setMsg(result.error);
    setMsg("Update request submitted for approval.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-navy hover:underline">
        Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <p className="section-title">Request update — {client.clientid}</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="field-label">Email address</label>
            <input className="field-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Address</label>
            <input className="field-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="field-label">ID type</label>
            <select className="field-input" value={form.idtype} onChange={(e) => setForm({ ...form, idtype: e.target.value })}>
              <option value="">—</option>
              <option>National ID</option>
              <option>International Passport</option>
              <option>Driver's License</option>
              <option>NIN</option>
              <option>Voter's Card</option>
              <option>Others</option>
            </select>
          </div>
          <div>
            <label className="field-label">ID number</label>
            <input className="field-input" value={form.idnumber} onChange={(e) => setForm({ ...form, idnumber: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Issuing authority</label>
            <input className="field-input" value={form.issuingauthority} onChange={(e) => setForm({ ...form, issuingauthority: e.target.value })} />
          </div>
          <div>
            <label className="field-label">ID expiry date</label>
            <input className="field-input" type="date" value={form.idexpirydate} onChange={(e) => setForm({ ...form, idexpirydate: e.target.value })} />
          </div>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Submitting…" : "Submit for approval"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}