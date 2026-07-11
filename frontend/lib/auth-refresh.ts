import axios from "axios";
import { getRefreshToken, saveTokens } from "./auth";
import { createSingleFlight } from "./single-flight";
import { NoRefreshTokenError } from "./auth-session";

// Re-export the pure helpers so existing call sites keep importing from here.
export { isSessionDead, NoRefreshTokenError } from "./auth-session";
export { accessTokenSecondsLeft } from "./jwt";

async function doRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new NoRefreshTokenError();

  // Plain axios (not the `api` instance) so this call never re-enters the
  // response interceptor / refresh loop.
  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
    { refresh_token: refreshToken }
  );
  const newAccess: string = res.data.data.access_token;
  // Sliding session: backend now returns a fresh refresh_token too. Fall back to
  // the existing one for safety if an older backend omits it.
  const newRefresh: string = res.data.data.refresh_token ?? refreshToken;
  await saveTokens(newAccess, newRefresh);
  return newAccess;
}

/**
 * Refresh the access token, deduped: concurrent callers share one refresh.
 * Returns the new access token, or throws (NoRefreshTokenError / axios error).
 */
export const refreshAccessToken = createSingleFlight(doRefresh);
