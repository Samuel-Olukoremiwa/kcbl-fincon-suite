"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      return setError("Password must be at least 8 characters.");
    }

    if (!/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      return setError(
        "Password must include at least one number and one special character.",
      );
    }

    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    setSaving(true);
    const supabase = createClient();

    const response = await fetch("/api/auth/complete-password-change", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();

    if (!response.ok) {
      setSaving(false);
      return setError(
        result.error ??
          "Could not update your password. Please try again.",
      );
    }

    await supabase.auth.signOut({ scope: "local" });
    setSaving(false);
    setDone(true);

    setTimeout(() => {
      router.replace("/login?passwordChanged=1");
    }, 1500);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Image
          src="/kcbl-mark.png"
          alt=""
          width={90}
          height={90}
          priority
        />
        <h1 className="mt-4 text-2xl font-bold text-white">FinCon Suite</h1>
        <p className="mt-1 text-sm text-white/60">
          First-time password setup
        </p>
      </div>

      <div className="w-full max-w-md rounded-lg border-l-4 border-amber bg-white p-8 shadow-lg">
        {done ? (
          <p
            role="status"
            className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            Password changed successfully. Redirecting to sign in…
          </p>
        ) : !ready ? (
          <p className="text-sm text-slate-500">Verifying your account…</p>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-ink">
                Create your password
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Your first sign-in was successful. You must create your own
                password before accessing FinCon Suite.
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="field-label">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="field-label">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="field-input pr-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword((current) => !current)
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-500 hover:bg-slate-100"
                  aria-label={
                    showConfirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <p className="mb-4 text-xs text-slate-500">
              Use at least 8 characters, including at least one number and one
              special character.
            </p>

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving ? "Updating password…" : "Create password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
