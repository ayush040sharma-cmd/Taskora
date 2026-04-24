import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../api/api";

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
  const demoTimerRef = useRef(null);

  // Clear any existing demo timer
  const clearDemoTimer = () => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  };

  // Auto-logout for demo sessions after 5 minutes
  const startDemoTimer = () => {
    clearDemoTimer();
    demoTimerRef.current = setTimeout(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("demo_session");
      setUser(null);
      window.location.href = "/login?demo_expired=1";
    }, DEMO_TIMEOUT_MS);
  };

  // On mount: if a demo session was active, check if it's still valid
  useEffect(() => {
    const demoStart = localStorage.getItem("demo_session");
    if (demoStart) {
      const elapsed = Date.now() - parseInt(demoStart, 10);
      if (elapsed >= DEMO_TIMEOUT_MS) {
        // Already expired
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("demo_session");
        setUser(null);
      } else {
        // Resume timer for remaining time
        const remaining = DEMO_TIMEOUT_MS - elapsed;
        demoTimerRef.current = setTimeout(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("demo_session");
          setUser(null);
          window.location.href = "/login?demo_expired=1";
        }, remaining);
      }
    }
    return () => clearDemoTimer();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password, role = "manager") => {
    const { data } = await api.post("/auth/register", { name, email, password, role });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  // Used by OAuth callback — token + user already determined by backend
  const loginWithToken = (token, userData, isDemo = false) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    if (isDemo) {
      localStorage.setItem("demo_session", String(Date.now()));
      startDemoTimer();
    } else {
      localStorage.removeItem("demo_session");
      clearDemoTimer();
    }
    setUser(userData);
  };

  const updateUser = (updatedUser) => {
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const logout = () => {
    clearDemoTimer();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("demo_session");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, loginWithToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
