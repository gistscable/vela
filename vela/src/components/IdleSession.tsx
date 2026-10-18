"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { expireIdleSessionAction, touchSessionAction } from "@/lib/actions";
import {
  SESSION_ACTIVITY_STORAGE_KEY,
  SESSION_IDLE_EXPIRED_VALUE,
  SESSION_IDLE_LABEL,
  SESSION_IDLE_MS,
  SESSION_IDLE_NOTICE,
  SESSION_IDLE_WARNING_MS,
} from "@/lib/session";
import { Button } from "./ui";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "click", "touchstart", "scroll"] as const;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes > 0) return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  return `${total} second${total === 1 ? "" : "s"}`;
}

function readStoredActivity(now: number): number | typeof SESSION_IDLE_EXPIRED_VALUE {
  try {
    const raw = localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY);
    if (raw === SESSION_IDLE_EXPIRED_VALUE) return SESSION_IDLE_EXPIRED_VALUE;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : now;
  } catch {
    return now;
  }
}

function writeStoredActivity(value: string) {
  try {
    localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, value);
  } catch {
    /* private mode */
  }
}

/**
 * Signs the member out after a quiet period. Shared preview skips this (see AppShell).
 * `onExpire` is for tests; in the app we send the browser to the sign-in page.
 */
export function IdleSession({
  enabled,
  idleMs = SESSION_IDLE_MS,
  warningMs = SESSION_IDLE_WARNING_MS,
  checkMs = 1000,
  touchEveryMs = 30_000,
  onExpire,
}: {
  enabled: boolean;
  idleMs?: number;
  warningMs?: number;
  checkMs?: number;
  touchEveryMs?: number;
  onExpire?: (url: string) => void;
}) {
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(idleMs);
  const lastActivity = useRef(0);
  const lastTouch = useRef(0);
  const expiring = useRef(false);
  const warningRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const touchEveryMsRef = useRef(touchEveryMs);
  onExpireRef.current = onExpire;
  touchEveryMsRef.current = touchEveryMs;

  const expire = useCallback(async () => {
    if (expiring.current) return;
    expiring.current = true;
    warningRef.current = false;
    setWarning(false);
    writeStoredActivity(SESSION_IDLE_EXPIRED_VALUE);
    try {
      await expireIdleSessionAction();
    } catch {
      /* still leave the session */
    }
    const url = `/login?notice=${SESSION_IDLE_NOTICE}`;
    if (onExpireRef.current) onExpireRef.current(url);
    else window.location.assign(url);
  }, []);

  const markActivity = useCallback(
    (opts?: { forceTouch?: boolean }) => {
      if (expiring.current || warningRef.current) return;
      const t = Date.now();
      lastActivity.current = t;
      writeStoredActivity(String(t));
      if (opts?.forceTouch || t - lastTouch.current >= touchEveryMsRef.current) {
        lastTouch.current = t;
        void touchSessionAction().then((res) => {
          if (!res?.ok) void expire();
        });
      }
    },
    [expire],
  );

  const staySignedIn = useCallback(() => {
    warningRef.current = false;
    setWarning(false);
    markActivity({ forceTouch: true });
  }, [markActivity]);

  useEffect(() => {
    if (!enabled) return;
    expiring.current = false;
    const now = Date.now();
    const stored = readStoredActivity(now);
    // A leftover "expired" flag is from a previous sign-out; this shell only mounts
    // when the server already accepted a session, so start a fresh idle window.
    if (stored === SESSION_IDLE_EXPIRED_VALUE) {
      lastActivity.current = now;
    } else {
      lastActivity.current = stored;
      if (now - stored >= idleMs) {
        void expire();
        return;
      }
    }
    markActivity({ forceTouch: true });

    const tick = () => {
      if (expiring.current) return;
      const idleFor = Date.now() - lastActivity.current;
      setRemainingMs(Math.max(0, idleMs - idleFor));
      if (idleFor >= idleMs) {
        void expire();
        return;
      }
      if (idleFor >= warningMs) {
        warningRef.current = true;
        setWarning(true);
      } else if (warningRef.current) {
        warningRef.current = false;
        setWarning(false);
      }
    };
    tick();
    const id = window.setInterval(tick, checkMs);

    const onEvent = () => markActivity();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onEvent, { passive: true });

    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_ACTIVITY_STORAGE_KEY) return;
      if (!event.newValue || event.newValue === SESSION_IDLE_EXPIRED_VALUE) {
        void expire();
        return;
      }
      const n = Number(event.newValue);
      if (Number.isFinite(n)) lastActivity.current = n;
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(id);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onEvent);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, idleMs, warningMs, checkMs, markActivity, expire]);

  if (!enabled || !warning) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-session-title"
        className="w-full max-w-md border border-gray-300 bg-white shadow-panel"
      >
        <div className="border-b border-gray-200 bg-bank-sand px-5 py-3.5">
          <h2 id="idle-session-title" className="text-[16px] font-bold text-bank-navy">
            Are you still there?
          </h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-gray-700">
            For your protection, we sign you out after {SESSION_IDLE_LABEL} of inactivity.
          </p>
          <p className="text-[13px] font-semibold text-bank-navy" aria-live="polite">
            Your session will end in {formatRemaining(remainingMs)}.
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => void expire()}>
              Sign out
            </Button>
            <Button type="button" variant="red" onClick={staySignedIn}>
              Stay signed in
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
