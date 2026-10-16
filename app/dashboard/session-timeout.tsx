"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  createClient,
} from "@/lib/supabase/client";

const LAST_ACTIVITY_KEY =
  "kcbl:last-activity";

const FORCE_LOGOUT_KEY =
  "kcbl:force-logout";

const TAB_SESSION_KEY =
  "kcbl:tab-session";

const SESSION_CHANNEL =
  "kcbl:session-channel";

type SessionMessage =
  | {
      type: "probe";
    }
  | {
      type: "active";
    }
  | {
      type: "logout";
      reason:
        | "timeout"
        | "session-ended";
    };

export default function SessionTimeout({
  minutes = 5,
  children,
}: {
  minutes?: number;
  children:
    React.ReactNode;
}) {
  const [
    ready,
    setReady,
  ] =
    useState(false);

  useEffect(() => {
    const supabase =
      createClient();

    let activeMinutes =
      Math.max(
        1,
        minutes,
      );

    let signingOut =
      false;

    let trackingStarted =
      false;

    let validated =
      false;

    let disposed =
      false;

    let memoryLastActivity =
      Date.now();

    let lastActivityWrite =
      0;

    let interval:
      number |
      undefined;

    let probeTimer:
      number |
      undefined;

    let channel:
      BroadcastChannel |
      null =
        null;

    function hasTabSession() {
      try {
        return (
          window.sessionStorage.getItem(
            TAB_SESSION_KEY,
          ) ===
          "active"
        );
      } catch {
        return false;
      }
    }

    function markTabSession() {
      try {
        window.sessionStorage.setItem(
          TAB_SESSION_KEY,
          "active",
        );
      } catch {
        // Ignore storage failures.
      }
    }

    function clearTabSession() {
      try {
        window.sessionStorage.removeItem(
          TAB_SESSION_KEY,
        );
      } catch {
        // Ignore storage failures.
      }
    }

    function readStoredActivity() {
      try {
        const value =
          Number(
            window.localStorage.getItem(
              LAST_ACTIVITY_KEY,
            ),
          );

        return Number.isFinite(
          value,
        ) &&
          value >
            0
          ? value
          : null;
      } catch {
        return null;
      }
    }

    function writeActivity(
      value: number,
    ) {
      memoryLastActivity =
        value;

      try {
        window.localStorage.setItem(
          LAST_ACTIVITY_KEY,
          String(
            value,
          ),
        );
      } catch {
        // Continue with in-memory tracking.
      }
    }

    function clearActivity() {
      try {
        window.localStorage.removeItem(
          LAST_ACTIVITY_KEY,
        );
      } catch {
        // Ignore storage failures.
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
      reason:
        | "timeout"
        | "session-ended",
      broadcast = true,
    ) {
      if (
        signingOut
      ) {
        return;
      }

      signingOut =
        true;

      clearTabSession();
      clearActivity();

      if (
        broadcast
      ) {
        try {
          window.localStorage.setItem(
            FORCE_LOGOUT_KEY,
            String(
              Date.now(),
            ),
          );
        } catch {
          // Ignore storage failures.
        }

        channel?.postMessage({
          type:
            "logout",
          reason,
        } satisfies SessionMessage);
      }

      try {
        await supabase.auth.signOut({
          scope:
            "local",
        });
      } finally {
        window.location.replace(
          `/login?reason=${reason}`,
        );
      }
    }

    function checkExpiry() {
      if (
        isExpired()
      ) {
        void signOut(
          "timeout",
        );

        return true;
      }

      return false;
    }

    function recordActivity() {
      if (
        !validated ||
        checkExpiry()
      ) {
        return;
      }

      const now =
        Date.now();

      if (
        now -
          lastActivityWrite <
        1000
      ) {
        return;
      }

      lastActivityWrite =
        now;

      writeActivity(
        now,
      );
    }

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          checkExpiry();
        }
      };

    const handleFocus =
      () => {
        checkExpiry();
      };

    const handleStorage =
      (
        event:
          StorageEvent,
      ) => {
        if (
          event.key ===
            FORCE_LOGOUT_KEY &&
          event.newValue
        ) {
          void signOut(
            "session-ended",
            false,
          );

          return;
        }

        if (
          event.key ===
            LAST_ACTIVITY_KEY &&
          event.newValue
        ) {
          const value =
            Number(
              event.newValue,
            );

          if (
            Number.isFinite(
              value,
            )
          ) {
            memoryLastActivity =
              value;
          }
        }
      };

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

    function startTracking() {
      if (
        trackingStarted ||
        disposed
      ) {
        return;
      }

      trackingStarted =
        true;

      validated =
        true;

      markTabSession();

      const storedActivity =
        readStoredActivity();

      if (
        storedActivity
      ) {
        memoryLastActivity =
          storedActivity;
      } else {
        writeActivity(
          Date.now(),
        );
      }

      if (
        checkExpiry()
      ) {
        return;
      }

      setReady(
        true,
      );

      events.forEach(
        (
          event,
        ) =>
          window.addEventListener(
            event,
            recordActivity,
            {
              passive:
                true,
            },
          ),
      );

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

      interval =
        window.setInterval(
          () => {
            checkExpiry();
          },
          5000,
        );

      fetch(
        "/api/session-timeout",
      )
        .then(
          (
            response,
          ) =>
            response.ok
              ? response.json()
              : null,
        )
        .then(
          (
            data,
          ) => {
            const configured =
              Number(
                data?.minutes,
              );

            if (
              Number.isFinite(
                configured,
              ) &&
              configured >=
                1
            ) {
              activeMinutes =
                configured;

              checkExpiry();
            }
          },
        )
        .catch(
          () =>
            undefined,
        );
    }

    if (
      "BroadcastChannel" in
      window
    ) {
      channel =
        new BroadcastChannel(
          SESSION_CHANNEL,
        );

      channel.onmessage =
        (
          event:
            MessageEvent<SessionMessage>,
        ) => {
          const message =
            event.data;

          if (
            message?.type ===
            "probe"
          ) {
            if (
              hasTabSession() &&
              !isExpired()
            ) {
              channel?.postMessage({
                type:
                  "active",
              } satisfies SessionMessage);
            }

            return;
          }

          if (
            message?.type ===
            "active" &&
            !validated
          ) {
            if (
              probeTimer
            ) {
              window.clearTimeout(
                probeTimer,
              );
            }

            startTracking();

            return;
          }

          if (
            message?.type ===
            "logout"
          ) {
            void signOut(
              message.reason,
              false,
            );
          }
        };
    }

    if (
      hasTabSession()
    ) {
      startTracking();
    } else if (
      channel
    ) {
      channel.postMessage({
        type:
          "probe",
      } satisfies SessionMessage);

      probeTimer =
        window.setTimeout(
          () => {
            if (
              !validated
            ) {
              void signOut(
                "session-ended",
                false,
              );
            }
          },
          750,
        );
    } else {
      void signOut(
        "session-ended",
        false,
      );
    }

    return () => {
      disposed =
        true;

      if (
        probeTimer
      ) {
        window.clearTimeout(
          probeTimer,
        );
      }

      if (
        interval
      ) {
        window.clearInterval(
          interval,
        );
      }

      events.forEach(
        (
          event,
        ) =>
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

      channel?.close();
    };
  }, [minutes]);

  if (
    !ready
  ) {
    return null;
  }

  return (
    <>
      {
        children
      }
    </>
  );
}
