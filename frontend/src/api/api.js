import axios from "axios";

// In dev: Vite proxy forwards /api → localhost:3001
// In prod: VITE_API_URL is set to the deployed backend URL
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // send httpOnly cookie on every request
  timeout: 40000, // Render free tier can take 30-60s to cold-start
});

// Attach Bearer token as a fallback for environments where cross-origin cookies
// aren't forwarded (e.g. some mobile browsers, SSR). Reads from sessionStorage
// (_sk) which is cleared on tab close, not the persistent localStorage JWT.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("_sk") || localStorage.getItem("token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Public auth endpoints legitimately return 401 as part of normal flow (e.g.
// a wrong password on /auth/login) -- that's not "your session expired,"
// it's the caller's own form validation to handle. Without this exclusion,
// the global redirect below fired on every one of these too: a wrong
// password would clear storage and hard-navigate the login page to itself
// at the same moment Login.jsx's local catch block tried to render an
// inline error, interrupting it with a reload instead.
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/demo", "/auth/forgot-password", "/auth/reset-password"];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some(p => err.config?.url?.startsWith(p));
    if (err.response?.status === 401 && !isPublicAuthRequest) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("demo_session");
      const current = window.location.pathname + window.location.search;
      window.location.href = current === "/" || current.startsWith("/login")
        ? "/login"
        : `/login?redirect=${encodeURIComponent(current)}`;
    }
    return Promise.reject(err);
  }
);

export default api;
