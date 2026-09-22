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

export default function CreateUserAccountPanel({
  onboardingid,
  staff,
  projects,
  canAssignSuperUser,
}: {
  onboardingid: number;
  staff: {
    fullname: string;
    email: string;
    phonenumber: string;
  };
  projects: Project[];
  canAssignSuperUser: boolean;
}) {
  const router = useRouter();

  const roleOptions = canAssignSuperUser
    ? [...STANDARD_STAFF_ROLES, SUPER_USER_ROLE]
    : [...STANDARD_STAFF_ROLES];

  const [role, setRole] = useState("Initiator");
  const [department, setDepartment] = useState("");
  const [projectid, setProjectid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/staff-onboarding/${onboardingid}/create-account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, department, projectid }),
        },
      );

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Could not create the system account.");
        return;
      }

      setMessage(
        body.emailSent
          ? `System account ${body.userId} created. Password setup instructions were sent to ${staff.email}. MD Office approval is still required before sign-in.`
          : `System account ${body.userId} created. MD Office approval is still required before sign-in, but the password setup email could not be sent${body.emailError ? `: ${body.emailError}` : "."}`,
      );

      router.refresh();

      setTimeout(() => {
        router.push(`/dashboard/users/${body.userId}`);
      }, 900);
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border border-green-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-title">Create FinCon Suite User Account</p>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            This onboarding record is verified. The staff member can now be
            granted application access if their role requires it. Their name,
            email and phone number will be taken directly from the verified
            personnel record.
          </p>
        </div>
        <span className="badge-success">Verified onboarding</span>
      </div>

      <div className="mt-5 grid gap-3 rounded-md bg-slate-50 p-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Name</p>
          <p className="mt-1 font-medium text-ink">{staff.fullname}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Email</p>
          <p className="mt-1 break-words font-medium text-ink">{staff.email}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Phone</p>
          <p className="mt-1 font-medium text-ink">{staff.phonenumber}</p>
        </div>
      </div>

      <form onSubmit={createAccount} className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="account-role">
            Role
          </label>
          <select
            id="account-role"
            className="field-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {roleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="account-department">
            Department
          </label>
          <select
            id="account-department"
            className="field-input"
            required
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setProjectid("");
            }}
          >
            <option value="">Select department…</option>
            {STAFF_DEPARTMENTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {department === "Operations" && (
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="account-project">
              Operations project assignment
            </label>
            <select
              id="account-project"
              className="field-input"
              value={projectid}
              required
              onChange={(event) => setProjectid(event.target.value)}
            >
              <option value="">Select project…</option>
              {projects.map((project) => (
                <option key={project.projectid} value={project.projectid}>
                  {project.projectid} · {project.projecttitle}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              The project assignment will still follow the existing MD Office
              authorization workflow.
            </p>
          </div>
        )}

        <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Access level
          </p>
          <p className="mt-1 text-sm font-medium text-ink">
            System managed — derived from Department + Role
          </p>
        </div>

        {error && <p className="field-error md:col-span-2">{error}</p>}
        {message && (
          <p className="rounded-md bg-green-50 p-3 text-sm text-green-700 md:col-span-2">
            {message}
          </p>
        )}

        <div className="md:col-span-2">
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Creating account…" : "Create User Account"}
          </button>
        </div>
      </form>
    </section>
  );
}
