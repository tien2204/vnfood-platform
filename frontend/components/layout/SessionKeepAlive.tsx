"use client";

import { useEffect } from "react";
import { getAccessToken, getRefreshToken } from "@/lib/auth";
import { refreshAccessToken, accessTokenSecondsLeft } from "@/lib/auth-refresh";

// Refresh once the access token has < this many seconds left...
const REFRESH_THRESHOLD_S = 120;
// ...and re-check on this cadence while the tab is visible.
const CHECK_INTERVAL_MS = 60_000;

/**
 * Keeps an active session alive. While the tab is open/focused it proactively
 * refreshes the access token before it expires, which (via saveTokens) also
 * re-writes the httpOnly cookie the middleware reads. This prevents the cookie
 * from going stale mid-session and stops the access/refresh tokens from dying
 * abruptly. Renders nothing. Real logout is still driven by the api interceptor.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    let cancelled = false;

    async function maybeRefresh() {
      if (cancelled || document.visibilityState !== "visible") return;
      if (!getRefreshToken()) return; // logged out — nothing to keep alive
      if (accessTokenSecondsLeft(getAccessToken()) > REFRESH_THRESHOLD_S) return;
      try {
        await refreshAccessToken();
      } catch {
        // A genuinely dead session is handled by the api interceptor on the next
        // real request; don't force a redirect from a background timer.
      }
    }

    maybeRefresh();
    const interval = setInterval(maybeRefresh, CHECK_INTERVAL_MS);
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, []);

  return null;
}
