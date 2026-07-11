// Pure session-decision helpers — zero imports, so unit-testable in isolation.

/** Thrown when there is no refresh token to attempt a refresh with. */
export class NoRefreshTokenError extends Error {
  constructor() {
    super("no_refresh_token");
    this.name = "NoRefreshTokenError";
  }
}

/**
 * Decide whether a failed refresh means the session is truly dead (→ log out)
 * vs. a transient error (→ keep the session, just fail this request).
 *
 * Dead only when: no refresh token at all, or the refresh endpoint itself
 * rejected the credentials (401/403). Network blips, 5xx, timeouts → NOT dead.
 */
export function isSessionDead(err: unknown): boolean {
  if (err instanceof NoRefreshTokenError) return true;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}
