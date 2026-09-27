"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = params.get("error");

    if (!loginError) {
      return;
    }

    if (loginError === "staff-access-expired") {
      const supabase = createClient();

      // Expired temporary staff are cleared from the local session as soon as
      // they reach the login screen after the server-side access check blocks them.
      void supabase.auth.signOut({ scope: "local" });

      setError(
        "Your temporary staff access period has expired. Contact an administrator if your engagement has been extended.",
      );
      return;
    }

    if (loginError === "pending-approval") {
      setError("Your account is not active yet. Please contact an administrator.");
      return;
    }

    if (loginError === "profile") {
      setError("Your user profile could not be loaded. Please contact an administrator.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    // A timeout or blocked temporary-staff session can leave an expired local
    // token in browser storage. Clear it locally before starting a fresh session.
    await supabase.auth.signOut({ scope: "local" });

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "Email or password is incorrect. Check both and try again."
          : signInError.message,
      );
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function forgotPassword() {
    setError(null);
    setResetNotice(null);

    if (!email) {
      return setError(
        "Enter your email address first, then select Forgot password.",
      );
    }

    setLoading(true);

    const supabase = createClient();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/login/reset-password`,
      },
    );

    setLoading(false);

    if (resetError) {
      return setError(resetError.message);
    }

    setResetNotice(
      "If this email belongs to an active account, a password-reset link has been sent.",
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="email" className="field-label">
          Email address
        </label>

        <div className="relative">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field-input"
            placeholder="you@kcbl.com"
          />
        </div>
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="field-label">
          Password
        </label>

        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field-input pr-11"
            placeholder="••••••••"
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-500 hover:bg-slate-100"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={forgotPassword}
        disabled={loading}
        className="mb-5 text-sm font-medium text-navy hover:underline"
      >
        Forgot password?
      </button>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {resetNotice && (
        <p
          role="status"
          className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
        >
          {resetNotice}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
