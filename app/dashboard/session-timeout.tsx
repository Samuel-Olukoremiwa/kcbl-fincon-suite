"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SessionTimeout({ minutes = 5 }: { minutes?: number }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let activeMinutes = Math.max(1, minutes);
    let lastReset = 0;
    const signOut = async () => { await createClient().auth.signOut({ scope: "local" }); window.location.replace("/login?reason=timeout"); };
    const reset = (force = false) => { const now = Date.now(); if (!force && now - lastReset < 1000) return; lastReset = now; clearTimeout(timer); timer = setTimeout(signOut, activeMinutes * 60 * 1000); };
    const onActivity = () => reset();
    const onVisibility = () => { if (document.visibilityState === "visible") reset(true); };
    const events = ["pointerdown", "pointermove", "mousemove", "keydown", "input", "focusin", "touchstart", "scroll", "wheel"];
    events.forEach(event => window.addEventListener(event, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    reset(true);
    fetch("/api/session-timeout").then(response => response.ok ? response.json() : null).then(data => { const configured = Number(data?.minutes); if (Number.isFinite(configured) && configured >= 1) { activeMinutes = configured; reset(true); } }).catch(() => undefined);
    return () => { clearTimeout(timer); events.forEach(event => window.removeEventListener(event, onActivity)); document.removeEventListener("visibilitychange", onVisibility); };
  }, [minutes]);
  return null;
}
