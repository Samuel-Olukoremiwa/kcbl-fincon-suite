"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["Super User","Initiator","Authorizer","Client","MD","MD Office","Executive Director","Non-Executive Director","Finance & Admin","Business Development","Operations","Internal Control"];
const DEPARTMENTS = ["MD","MD Office","Finance & Admin","Business Development","Operations","Audit/Internal Control"];

export default function EditUserAccess({
  userid, currentRoleId, currentRoleName, currentDepartment, currentAccessLevel, roleOptions,
}: {
  userid: string; currentRoleId: number; currentRoleName: string;
  currentDepartment: string | null; currentAccessLevel: string;
  roleOptions: { roleid: number; rolename: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roleid, setRoleid] = useState(currentRoleId);
  const [department, setDepartment] = useState(currentDepartment ?? "");
  const [accesslevel, setAccesslevel] = useState(currentAccessLevel);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selectedRoleName = roleOptions.find((r) => r.roleid === roleid)?.rolename ?? currentRoleName;
  const isClientRole = selectedRoleName === "Client";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/users/update-access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userid, roleid, department: isClientRole ? null : department, accesslevel: isClientRole ? null : accesslevel }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) return setMsg(result.error);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-sm text-navy hover:underline">Edit access</button>;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <p className="section-title">Edit access — {userid}</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="field-label">Role</label>
            <select className="field-input" value={roleid} onChange={(e) => setRoleid(Number(e.target.value))}>
              {roleOptions.map((r) => <option key={r.roleid} value={r.roleid}>{r.rolename}</option>)}
            </select>
          </div>
          {!isClientRole && (
            <>
              <div>
                <label className="field-label">Department</label>
                <select className="field-input" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">Select…</option>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Access level</label>
                <select className="field-input" value={accesslevel} onChange={(e) => setAccesslevel(e.target.value)}>
                  <option>Read & Write</option>
                  <option>Read Only</option>
                </select>
              </div>
            </>
          )}
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}