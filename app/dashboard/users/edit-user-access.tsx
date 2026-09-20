"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STAFF_DEPARTMENTS } from "@/lib/roles";

type RoleOption = {
  roleid: number;
  rolename: string;
};

export default function EditUserAccess({
  userid,
  currentRoleId,
  currentRoleName,
  currentDepartment,
  roleOptions,
}: {
  userid: string;
  currentRoleId: number;
  currentRoleName: string;
  currentDepartment: string | null;
  roleOptions: RoleOption[];
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [roleid, setRoleid] = useState(currentRoleId);
  const [department, setDepartment] = useState(currentDepartment ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const currentRoleIsAssignable = roleOptions.some(
    (role) => role.roleid === currentRoleId,
  );

  const selectedRoleName = useMemo(
    () =>
      roleOptions.find((role) => role.roleid === roleid)?.rolename ??
      (roleid === currentRoleId ? currentRoleName : ""),
    [roleOptions, roleid, currentRoleId, currentRoleName],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMsg(null);

    if (!department) {
      setMsg("Select a department.");
      return;
    }

    if (!roleOptions.some((role) => role.roleid === roleid)) {
      setMsg(
        "This is a legacy role. Select Initiator, Authorizer, or Super User before saving.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/users/update-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userid,
          roleid,
          department,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMsg(result.error ?? "Could not update access.");
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-navy hover:underline"
      >
        Edit access
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <p className="section-title">
          Edit access — {userid}
        </p>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="field-label">Role</label>

            <select
              className="field-input"
              value={roleid}
              onChange={(event) => setRoleid(Number(event.target.value))}
            >
              {!currentRoleIsAssignable && (
                <option value={currentRoleId} disabled>
                  {currentRoleName} — legacy role
                </option>
              )}

              {roleOptions.map((role) => (
                <option key={role.roleid} value={role.roleid}>
                  {role.rolename}
                </option>
              ))}
            </select>

            {selectedRoleName === "Super User" && (
              <p className="mt-1 text-xs text-amber-700">
                Super User grants administrative access across the system. Only
                a current Super User can make this assignment.
              </p>
            )}
          </div>

          <div>
            <label className="field-label">Department</label>

            <select
              className="field-input"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              required
            >
              <option value="">Select…</option>

              {STAFF_DEPARTMENTS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Access level
            </p>

            <p className="mt-1 text-sm font-medium text-ink">
              System managed — Read &amp; Write
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Access is derived from Department + Role and cannot be manually
              selected.
            </p>
          </div>

          {msg && (
            <p className="text-sm text-red-600">
              {msg}
            </p>
          )}

          <div className="flex gap-2">
            <button
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}