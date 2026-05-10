import axios from "axios";
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from "./auth";

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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint =
      original?.url?.includes("/auth/login") ||
      original?.url?.includes("/auth/refresh");

    if (
      error.response?.status === 401 &&
      !original?._retry &&
      !isAuthEndpoint &&
      typeof window !== "undefined"
    ) {
      original._retry = true;
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const res = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
            { refresh_token: refreshToken }
          );
          const newToken: string = res.data.data.access_token;
          const newRefreshToken: string = res.data.data.refresh_token ?? refreshToken;
          await saveTokens(newToken, newRefreshToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          // refresh failed — fall through to logout
        }
      }
      await clearTokens();
      window.location.href = "/auth/login";
    }
    return Promise.reject(error);
  }
);

export default api;
