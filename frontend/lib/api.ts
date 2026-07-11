import axios from "axios";
import { getAccessToken, clearTokens } from "./auth";
import { refreshAccessToken, isSessionDead } from "./auth-refresh";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + "/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function redirectToLogin() {
  if (typeof window === "undefined") return;
  // Already on an auth page → don't loop.
  if (window.location.pathname.startsWith("/auth/")) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/auth/login?next=${next}`;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint =
      original?.url?.includes("/auth/login") ||
      original?.url?.includes("/auth/staff-login") ||
      original?.url?.includes("/auth/refresh");

    if (
      error.response?.status === 401 &&
      !original?._retry &&
      !isAuthEndpoint &&
      typeof window !== "undefined"
    ) {
      original._retry = true;
      try {
        // Single-flight: many parallel 401s collapse into ONE refresh.
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        // Only wipe the session when the refresh is *definitively* rejected
        // (no refresh token, or backend returned 401/403). A network blip or 5xx
        // must NOT nuke a possibly-valid session — just fail this one request.
        if (isSessionDead(refreshErr)) {
          await clearTokens();
          redirectToLogin();
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
