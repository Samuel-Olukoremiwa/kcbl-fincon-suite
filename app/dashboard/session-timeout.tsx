"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SessionTimeout({ minutes = 5 }: { minutes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>; let activeMinutes = minutes;
    const signOut = async () => { await createClient().auth.signOut(); router.replace("/login?reason=timeout"); router.refresh(); };
    const reset = () => { clearTimeout(timer); timer = setTimeout(signOut, activeMinutes * 60 * 1000); };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    fetch("/api/session-timeout").then((response) => response.ok ? response.json() : null).then((data) => { if (data?.minutes) { activeMinutes = Number(data.minutes); reset(); } }).catch(() => undefined);
    return () => { clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, reset)); };
  }, [minutes, router]);
  return null;
}
