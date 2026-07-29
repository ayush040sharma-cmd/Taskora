import { create } from "zustand";

const stored = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const useStore = create((set) => ({
  user:              stored("admin_user", null),
  token:             localStorage.getItem("admin_token") || null,
  activePage:        "dashboard",
  sidebarCollapsed:  false,
  theme:             "dark",

  setAuth: (user, token) => {
    localStorage.setItem("admin_token", token);
    localStorage.setItem("admin_user", JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    set({ user: null, token: null, activePage: "dashboard" });
  },

  setPage: (page) => set({ activePage: page }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toggleTheme: () => {
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    });
  },
}));

export default useStore;
