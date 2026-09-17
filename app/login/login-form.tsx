"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // A timeout can leave an expired local token in browser storage. Clear it
    // locally before starting a fresh password session.
    await supabase.auth.signOut({ scope: "local" });

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email or password is incorrect. Check both and try again." : error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function forgotPassword() {
    setError(null); setResetNotice(null);
    if (!email) return setError("Enter your email address first, then select Forgot password.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login/reset-password` });
    setLoading(false);
    if (error) return setError(error.message);
    setResetNotice("If this email belongs to an active account, a password-reset link has been sent.");
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field-input"
          placeholder="you@kcbl.com"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input"
          placeholder="••••••••"
        />
      </div>

      <button type="button" onClick={forgotPassword} disabled={loading} className="mb-5 text-sm font-medium text-navy hover:underline">
        Forgot password?
      </button>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {resetNotice && <p role="status" className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{resetNotice}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
