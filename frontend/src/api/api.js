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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
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
