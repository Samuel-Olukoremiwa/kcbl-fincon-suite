"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  STAFF_DEPARTMENTS,
  STANDARD_STAFF_ROLES,
  SUPER_USER_ROLE,
} from "@/lib/roles";

type Project = {
  projectid: string;
  projecttitle: string;
};

export default function CreateUserForm({
  projects,
  canAssignSuperUser,
}: {
  projects: Project[];
  canAssignSuperUser: boolean;
}) {
  const router = useRouter();

  const roleOptions = canAssignSuperUser
    ? [...STANDARD_STAFF_ROLES, SUPER_USER_ROLE]
    : [...STANDARD_STAFF_ROLES];

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "Initiator",
    department: "",
    projectid: "",
  });

  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!confirmed) {
      setError(
        "Confirm that you are authorised to submit this staff member's details.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Could not submit the user request.");
        return;
      }

      setSuccess(
        `${form.fullName} has been submitted for MD Office approval. The account cannot sign in until approved.`,
      );

      setForm({
        fullName: "",
        email: "",
        phone: "",
        role: "Initiator",
        department: "",
        projectid: "",
      });

      setConfirmed(false);
      router.refresh();
    } catch {
      setError("Could not submit the user request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-4">
        <Field
          label="Full name"
          value={form.fullName}
          onChange={(value) => set("fullName", value)}
          required
        />

        <Field
          label="Contact email"
          type="email"
          value={form.email}
          onChange={(value) => set("email", value)}
          required
        />

        <Field
          label="Phone number"
          value={form.phone}
          onChange={(value) => set("phone", value)}
          required
        />

        <div>
          <label className="field-label">Role</label>

          <select
            className="field-input"
            value={form.role}
            onChange={(event) => set("role", event.target.value)}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          {canAssignSuperUser && (
            <p className="mt-1 text-xs text-slate-500">
              Super User is a special administrative role and can only be
              assigned by an existing Super User.
            </p>
          )}
        </div>

        <div>
          <label className="field-label">Department</label>

          <select
            className="field-input"
            value={form.department}
            onChange={(event) => {
              set("department", event.target.value);
              set("projectid", "");
            }}
            required
          >
            <option value="">Select department…</option>

            {STAFF_DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </div>

        {form.department === "Operations" && (
          <div>
            <label className="field-label">Assigned project code</label>

            <select
              className="field-input"
              value={form.projectid}
              onChange={(event) => set("projectid", event.target.value)}
              required
            >
              <option value="">Select assigned project…</option>

              {projects.map((project) => (
                <option key={project.projectid} value={project.projectid}>
                  {project.projectid} · {project.projecttitle}
                </option>
              ))}
            </select>

            <p className="mt-1 text-xs text-slate-500">
              Operations users can access only projects approved for their
              assignment.
            </p>
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Access level
          </p>

          <p className="mt-1 text-sm font-medium text-ink">
            System managed — Read &amp; Write
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Module access is derived from the selected Department and Role. It
            cannot be manually overridden.
          </p>
        </div>

        <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Business Development submits staff-user requests. MD Office must
          approve the request before the staff account can sign in. Client
          portal accounts are created separately through Clients &amp; KYC.
        </p>

        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />

          <span>
            I confirm I am authorised to submit this staff member’s business
            contact details for account setup and approval.
          </span>
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}

      {success && (
        <p className="mt-4 text-sm text-green-700">
          {success}
        </p>
      )}

      <button
        disabled={busy || !confirmed}
        className="btn-primary mt-6 w-full"
      >
        {busy ? "Submitting…" : "Submit for MD Office approval"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>

      <input
        className="field-input"
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}