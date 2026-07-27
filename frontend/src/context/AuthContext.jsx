import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../api/api";
import { resetSocket } from "../hooks/useSocket";

const AuthContext = createContext(null);
const DEMO_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [sidebarViews, setSidebarViews] = useState(() => {
    try {
      const stored = localStorage.getItem("sidebar-views");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const demoTimerRef = useRef(null); // holds an interval id
  const [demoSecondsLeft, setDemoSecondsLeft] = useState(null); // null = no active demo session

  const fetchSidebarViews = async () => {
    try {
      const { data } = await api.get("/auth/me/sidebar-views");
      const viewSet = new Set(data.views || []);
      localStorage.setItem("sidebar-views", JSON.stringify([...viewSet]));
      setSidebarViews(viewSet);
    } catch {
      setSidebarViews(new Set());
    }
  };

  // Clear any existing demo countdown
  const clearDemoTimer = () => {
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setDemoSecondsLeft(null);
  };

  const expireDemoSession = async () => {
    clearDemoTimer();
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("demo_session");
    setUser(null);
    window.location.href = "/login?demo_expired=1";
  };

  // Ticks every second while a demo session is active so the UI can show a
  // real countdown. Previously the session just ended with zero warning --
  // flagged as the single longest-standing unresolved issue across every
  // product audit since 2026-04-30. demoSecondsLeft is exposed via context
  // for DemoSessionBadge (or anything else) to render.
  const startDemoCountdown = (startTimestamp) => {
    clearDemoTimer();
    const tick = () => {
      const remaining = Math.max(0, DEMO_TIMEOUT_MS - (Date.now() - startTimestamp));
      setDemoSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) expireDemoSession();
    };
    tick(); // don't wait a full second for the first paint
    demoTimerRef.current = setInterval(tick, 1000);
  };

  // On mount: if a demo session was active, check if it's still valid
  useEffect(() => {
    const demoStart = localStorage.getItem("demo_session");
    if (demoStart) {
      const startTimestamp = parseInt(demoStart, 10);
      const elapsed = Date.now() - startTimestamp;
      if (elapsed >= DEMO_TIMEOUT_MS) {
        // Already expired
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("demo_session");
        setUser(null);
      } else {
        startDemoCountdown(startTimestamp);
      }
    }
    return () => clearDemoTimer();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    // Auth is the httpOnly cookie the server just set — the JWT in `data.token`
    // is a Bearer fallback for non-browser API clients and is never persisted
    // or read here; the browser has no JS-accessible copy of it.
    localStorage.setItem("user", JSON.stringify(data.user));
    resetSocket();
    setUser(data.user);
    fetchSidebarViews();
    return data.user;
  };

  const register = async (name, email, password, role = "manager") => {
    const { data } = await api.post("/auth/register", { name, email, password, role });
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    fetchSidebarViews();
    return data.user;
  };

  // Used by OAuth callback (and the demo flow) — the httpOnly cookie is
  // already set server-side by this point, so only the display user data
  // needs to reach client state.
  const loginWithToken = (_token, userData, isDemo = false) => {
    localStorage.setItem("user", JSON.stringify(userData));
    resetSocket();
    if (isDemo) {
      const startTimestamp = Date.now();
      localStorage.setItem("demo_session", String(startTimestamp));
      startDemoCountdown(startTimestamp);
    } else {
      localStorage.removeItem("demo_session");
      clearDemoTimer();
    }
    setUser(userData);
    fetchSidebarViews();
  };

  const updateUser = (updatedUser) => {
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const logout = async () => {
    clearDemoTimer();
    resetSocket();
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("token");      // legacy cleanup
    localStorage.removeItem("user");
    localStorage.removeItem("demo_session");
    localStorage.removeItem("sidebar-views");
    sessionStorage.removeItem("_sk");
    setUser(null);
    setSidebarViews(new Set());
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, loginWithToken, sidebarViews, refreshSidebarViews: fetchSidebarViews, demoSecondsLeft }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
