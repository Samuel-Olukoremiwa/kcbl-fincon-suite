"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["Super Admin", "Maker", "Checker", "Client"];

export default function CreateUserForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("Maker");
  const [tempPassword, setTempPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const userType = role === "Client" ? "Client" : "Staff";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const res = await fetch("/api/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        phone,
        role,
        tempPassword,
      }),
    });

    const body = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(body.error ?? "Something went wrong creating this user.");
      return;
    }

    setSuccess(`${fullName} was created as ${role}.`);
    setFullName("");
    setEmail("");
    setPhone("");
    setTempPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="fullName" className="field-label">Full name</label>
        <input
          id="fullName"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="email" className="field-label">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="phone" className="field-label">Phone number</label>
        <input
          id="phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+234..."
          className="field-input"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="role" className="field-label">Role</label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="field-input"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          User type is set automatically: {userType}.
        </p>
      </div>

      <div className="mb-6">
        <label htmlFor="tempPassword" className="field-label">Temporary password</label>
        <input
          id="tempPassword"
          type="text"
          required
          minLength={8}
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          className="field-input"
          placeholder="Shared with the user securely, outside this app"
        />
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
