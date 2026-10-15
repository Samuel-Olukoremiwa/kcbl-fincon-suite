"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const LAST_ACTIVITY_KEY =
  "kcbl:last-activity";

const FORCE_LOGOUT_KEY =
  "kcbl:force-logout";

export default function SessionTimeout({
  minutes = 5,
}: {
  minutes?: number;
}) {
  useEffect(() => {
    const supabase = createClient();

    let activeMinutes = Math.max(
      1,
      minutes,
    );

    let signingOut = false;

    let memoryLastActivity =
      Date.now();

    let lastActivityWrite = 0;

    function readStoredActivity() {
      try {
        const value = Number(
          window.localStorage.getItem(
            LAST_ACTIVITY_KEY,
          ),
        );

        return Number.isFinite(value) &&
          value > 0
          ? value
          : null;
      } catch {
        return null;
      }
    }

    function writeActivity(
      value: number,
    ) {
      memoryLastActivity = value;

      try {
        window.localStorage.setItem(
          LAST_ACTIVITY_KEY,
          String(value),
        );
      } catch {
        // Continue with in-memory tracking if storage is unavailable.
      }
    }

    function readLastActivity() {
      return (
        readStoredActivity() ??
        memoryLastActivity
      );
    }

    function isExpired() {
      const elapsed =
        Date.now() -
        readLastActivity();

      return (
        elapsed >=
        activeMinutes *
          60 *
          1000
      );
    }

    async function signOut(
      broadcast = true,
    ) {
      if (signingOut) {
        return;
      }

      signingOut = true;

      try {
        if (broadcast) {
          try {
            window.localStorage.setItem(
              FORCE_LOGOUT_KEY,
              String(Date.now()),
            );
          } catch {
            // Ignore storage failures.
          }
        }

        try {
          window.localStorage.removeItem(
            LAST_ACTIVITY_KEY,
          );
        } catch {
          // Ignore storage failures.
        }

        await supabase.auth.signOut({
          scope: "local",
        });
      } finally {
        window.location.replace(
          "/login?reason=timeout",
        );
      }
    }

    function checkExpiry() {
      if (isExpired()) {
        void signOut();
        return true;
      }

      return false;
    }

    function recordActivity() {
      if (checkExpiry()) {
        return;
      }

      const now = Date.now();

      if (
        now - lastActivityWrite <
        1000
      ) {
        return;
      }

      lastActivityWrite = now;
      writeActivity(now);
    }

    const existingActivity =
      readStoredActivity();

    if (existingActivity) {
      memoryLastActivity =
        existingActivity;

      if (checkExpiry()) {
        return;
      }
    } else {
      writeActivity(Date.now());
    }

    const events = [
      "pointerdown",
      "pointermove",
      "mousemove",
      "keydown",
      "input",
      "focusin",
      "touchstart",
      "scroll",
      "wheel",
    ];

    events.forEach((event) =>
      window.addEventListener(
        event,
        recordActivity,
        {
          passive: true,
        },
      ),
    );

    const handleVisibility = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        checkExpiry();
      }
    };

    const handleFocus = () => {
      checkExpiry();
    };

    const handleStorage = (
      event: StorageEvent,
    ) => {
      if (
        event.key ===
          FORCE_LOGOUT_KEY &&
        event.newValue
      ) {
        void signOut(false);
        return;
      }

      if (
        event.key ===
          LAST_ACTIVITY_KEY &&
        event.newValue
      ) {
        const value = Number(
          event.newValue,
        );

        if (Number.isFinite(value)) {
          memoryLastActivity = value;
        }
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    window.addEventListener(
      "storage",
      handleStorage,
    );

    const interval =
      window.setInterval(
        () => {
          checkExpiry();
        },
        5000,
      );

    fetch("/api/session-timeout")
      .then((response) =>
        response.ok
          ? response.json()
          : null,
      )
      .then((data) => {
        const configured = Number(
          data?.minutes,
        );

        if (
          Number.isFinite(configured) &&
          configured >= 1
        ) {
          activeMinutes =
            configured;

          checkExpiry();
        }
      })
      .catch(() => undefined);

    return () => {
      window.clearInterval(interval);

      events.forEach((event) =>
        window.removeEventListener(
          event,
          recordActivity,
        ),
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      window.removeEventListener(
        "storage",
        handleStorage,
      );
    };
  }, [minutes]);

  return null;
}
