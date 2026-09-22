"use client";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router =
    useRouter();

  const [
    ready,
    setReady,
  ] =
    useState(false);

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    done,
    setDone,
  ] =
    useState(false);

  useEffect(() => {
    const supabase =
      createClient();

    const params =
      new URLSearchParams(
        window.location.search,
      );

    const code =
      params.get(
        "code",
      );

    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
        ) => {
          if (
            event ===
            "PASSWORD_RECOVERY"
          ) {
            setError(
              null,
            );

            setReady(
              true,
            );
          }
        },
      );

    if (code) {
      supabase.auth
        .exchangeCodeForSession(
          code,
        )
        .then(
          ({
            error:
              exchangeError,
          }) => {
            if (
              exchangeError
            ) {
              setError(
                "This reset link is invalid or has expired. Please request a new one.",
              );
            } else {
              setError(
                null,
              );

              setReady(
                true,
              );
            }
          },
        );
    } else {
      const timeout =
        setTimeout(
          () => {
            setReady(
              (
                current,
              ) => {
                if (
                  !current
                ) {
                  setError(
                    "This reset link is invalid or has expired. Please request a new one.",
                  );
                }

                return current;
              },
            );
          },
          5000,
        );

      return () => {
        clearTimeout(
          timeout,
        );

        listener.subscription.unsubscribe();
      };
    }

    return () =>
      listener.subscription.unsubscribe();
  }, []);

  async function submit(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    setError(null);

    if (
      password.length <
      8
    ) {
      return setError(
        "Password must be at least 8 characters.",
      );
    }

    if (
      !/[0-9]/.test(
        password,
      ) ||
      !/[^a-zA-Z0-9]/.test(
        password,
      )
    ) {
      return setError(
        "Password must include at least one number and one special character.",
      );
    }

    if (
      password !==
      confirmPassword
    ) {
      return setError(
        "Passwords do not match.",
      );
    }

    setSaving(true);

    const supabase =
      createClient();

    const {
      error:
        updateError,
    } =
      await supabase.auth.updateUser({
        password,
      });

    setSaving(false);

    if (
      updateError
    ) {
      return setError(
        updateError.message,
      );
    }

    setDone(true);

    setTimeout(
      () =>
        router.push(
          "/login",
        ),
      2000,
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Image
          src="/kcbl-mark.png"
          alt=""
          width={
            90
          }
          height={
            90
          }
        />

        <h1 className="mt-4 text-2xl font-bold text-white">
          FinCon Suite
        </h1>

        <p className="mt-1 text-sm text-white/60">
          Project Financial Control &amp; Performance Management
        </p>
      </div>

      <div className="w-full max-w-md rounded-lg border-l-4 border-amber bg-white p-8 shadow-lg">
        {done ? (
          <p
            role="status"
            className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            Password updated. Redirecting to sign in…
          </p>
        ) : !ready ? (
          error ? (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {
                error
              }
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Verifying your reset link…
            </p>
          )
        ) : (
          <form
            onSubmit={
              submit
            }
            noValidate
          >
            <div className="mb-4">
              <label
                htmlFor="password"
                className="field-label"
              >
                New password
              </label>

              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={
                  password
                }
                onChange={(
                  e,
                ) =>
                  setPassword(
                    e
                      .target
                      .value,
                  )
                }
                className="field-input"
                placeholder="••••••••"
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="confirmPassword"
                className="field-label"
              >
                Confirm new password
              </label>

              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={
                  confirmPassword
                }
                onChange={(
                  e,
                ) =>
                  setConfirmPassword(
                    e
                      .target
                      .value,
                  )
                }
                className="field-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {
                  error
                }
              </p>
            )}

            <button
              type="submit"
              disabled={
                saving
              }
              className="btn-primary w-full"
            >
              {saving
                ? "Saving…"
                : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}