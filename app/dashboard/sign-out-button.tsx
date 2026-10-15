"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const LAST_ACTIVITY_KEY =
  "kcbl:last-activity";

const FORCE_LOGOUT_KEY =
  "kcbl:force-logout";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    try {
      window.localStorage.removeItem(
        LAST_ACTIVITY_KEY,
      );

      window.localStorage.setItem(
        FORCE_LOGOUT_KEY,
        String(Date.now()),
      );
    } catch {
      // Ignore storage failures.
    }

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy"
    >
      <LogOut
        size={16}
        strokeWidth={1.75}
      />
      Sign out
    </button>
  );
}
