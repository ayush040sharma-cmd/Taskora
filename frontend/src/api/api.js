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
});

// Also attach Bearer token from localStorage as a fallback
// (supports existing sessions until cookie is set on next login)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear any stale localStorage data; cookie will be cleared server-side
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("demo_session");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
