import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "X-XSRF-TOKEN";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: CSRF_COOKIE_NAME,
  xsrfHeaderName: CSRF_HEADER_NAME,
  headers: {
    "Content-Type": "application/json",
  },
});

const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const token = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!token) {
    return null;
  }
  return decodeURIComponent(token.substring(name.length + 1));
};

let refreshInFlight: Promise<void> | null = null;

const refreshSession = async () => {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post("/api/auth/refresh")
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

api.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toUpperCase();
  const needsCsrf = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

  if (!needsCsrf) {
    return config;
  }

  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  if (!csrfToken) {
    return config;
  }

  const headersWithSetter = config.headers as { set?: (name: string, value: string) => void };
  if (typeof headersWithSetter.set === "function") {
    headersWithSetter.set(CSRF_HEADER_NAME, csrfToken);
  } else {
    (config.headers as Record<string, string>)[CSRF_HEADER_NAME] = csrfToken;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (!error.config || !error.response) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const requestUrl = originalRequest.url || "";
    const isAuthEndpoint =
      requestUrl.includes("/api/auth/login") ||
      requestUrl.includes("/api/auth/refresh") ||
      requestUrl.includes("/api/auth/logout");

    if (error.response.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        await refreshSession();
        return api(originalRequest);
      } catch {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;
