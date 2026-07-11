import { setTokensCookie, clearTokensCookie } from "./actions/auth-cookies";
import { decodeJWT } from "./jwt";
import type { User } from "./types";

export { decodeJWT } from "./jwt";
export type { JWTPayload } from "./jwt";

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  user?: User
) {
  if (typeof window !== "undefined") {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    if (user) localStorage.setItem("user_info", JSON.stringify(user));
  }
  await setTokensCookie(accessToken, refreshToken);
}

export async function clearTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_info");
  }
  await clearTokensCookie();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;

  // Treat the session as logged-out if the access_token is missing or expired.
  // Without this check, localStorage user_info could outlive the JWT, causing
  // the navbar to keep showing the user even after the middleware (which reads
  // the httpOnly cookie) has started redirecting to /auth/login.
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  const payload = decodeJWT(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_info");
    return null;
  }

  const raw = localStorage.getItem("user_info");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}
