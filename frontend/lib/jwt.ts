// Pure JWT helpers — no Next/server imports, so this is safe to unit-test and
// to import from anywhere (client, middleware-style code, tests).

export interface JWTPayload {
  sub: string;
  role: string;
  exp: number;
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JWTPayload;
  } catch {
    return null;
  }
}

/** Seconds remaining before the access token expires (0 if none/invalid). */
export function accessTokenSecondsLeft(token: string | null): number {
  if (!token) return 0;
  const payload = decodeJWT(token);
  if (!payload) return 0;
  return Math.floor(payload.exp - Date.now() / 1000);
}
