"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewStaffOnboardingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const fullname = String(form.get("fullname") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phonenumber = String(form.get("phonenumber") ?? "").trim();

    try {
      const response = await fetch("/api/staff-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullname, email, phonenumber }),
      });

      const body = await response.json();

      if (!response.ok) {
        if (body.onboardingid) {
          router.push(`/dashboard/users/onboarding/${body.onboardingid}`);
          return;
        }

        setError(body.error ?? "Could not start staff onboarding.");
        return;
      }

      router.push(`/dashboard/users/onboarding/${body.onboardingid}`);
      router.refresh();
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="fullname" className="field-label">
          Full name
        </label>
        <input id="fullname" name="fullname" className="field-input" required />
      </div>

      <div>
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field-input"
          required
        />
      </div>

      <div>
        <label htmlFor="phonenumber" className="field-label">
          Phone number
        </label>
        <input id="phonenumber" name="phonenumber" className="field-input" required />
      </div>

      <p className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        Department and Initiator/Authorizer role are intentionally not selected
        here. Those are system-access permissions and are assigned only if a
        FinCon Suite user account is created after onboarding verification.
      </p>

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Starting onboarding…" : "Start Staff Onboarding"}
      </button>
    </form>
  );
}
