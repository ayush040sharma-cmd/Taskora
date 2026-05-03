import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithToken } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  // If VITE_GOOGLE_ENABLED=true is set at build time (Vercel env vars), show immediately.
  // Otherwise ask the backend — falls back to false if backend unreachable (e.g. local dev, no config).
  const [googleConfigured, setGoogleConfigured] = useState(
    import.meta.env.VITE_GOOGLE_ENABLED === "true" ? true : null
  );

  useEffect(() => {
    if (searchParams.get("demo_expired") === "1") {
      setInfo("Your demo session has expired (5-minute limit). Sign in to continue.");
    }
    // Show error sent back from failed OAuth redirect
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
    }
    // Only do the runtime check when not already decided by build-time env
    if (import.meta.env.VITE_GOOGLE_ENABLED !== "true") {
      api.get("/auth/google/status")
        .then(({ data }) => setGoogleConfigured(data.configured === true))
        .catch(() => setGoogleConfigured(false));
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    setError(""); setInfo("");
    try {
      const { data } = await api.post("/auth/demo");
      loginWithToken(data.token, data.user, true); // isDemo=true → 5-min timer
      navigate("/dashboard");
    } catch (err) {
      setError("Could not start demo. Please try again.");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleGoogle = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  };

  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail.trim() });
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setForgotLoading(false);
      setForgotSent(true);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.blob1} />
      <div style={styles.blob2} />

      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="10" width="4" height="12" rx="1.5" fill="#fff"/>
              <rect x="10" y="6" width="4" height="16" rx="1.5" fill="#fff"/>
              <rect x="18" y="2" width="4" height="20" rx="1.5" fill="#fff"/>
            </svg>
          </div>
          <span style={styles.logoText}>Taskora</span>
          <span style={styles.logoBadge}>AI</span>
        </div>

        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.subtext}>Sign in to continue to your workspace</p>

        {info && (
          <div style={styles.infoBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {info}
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Google SSO — only shown when configured */}
        {googleConfigured && (
          <button style={styles.googleBtn} onClick={handleGoogle}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        )}

        {/* Demo button */}
        <button style={styles.demoBtn} onClick={handleDemo} disabled={demoLoading}>
          {demoLoading ? "Loading demo…" : "🚀 Try demo (5-min session)"}
        </button>

        {googleConfigured && (
          <div style={styles.orDivider}>
            <div style={styles.orLine} />
            <span style={styles.orText}>or sign in with email</span>
            <div style={styles.orLine} />
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email address</label>
            <input
              type="email"
              style={styles.input}
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoFocus
              onFocus={e => e.target.style.borderColor = "#6366f1"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"}
            />
          </div>

          <div style={styles.field}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={styles.label}>Password</label>
              <button type="button" style={styles.forgotLink} onClick={() => setShowForgot(true)}>
                Forgot password?
              </button>
            </div>
            <div style={styles.passWrap}>
              <input
                type={showPass ? "text" : "password"}
                style={{...styles.input, paddingRight: 44}}
                placeholder="Enter your password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"}
              />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPass(v => !v)}>
                {showPass
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          <button
            type="submit"
            style={loading ? {...styles.submitBtn, opacity: 0.7} : styles.submitBtn}
            disabled={loading}
          >
            {loading ? (
              <span style={styles.btnInner}>
                <svg style={styles.spinner} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                </svg>
                Signing in…
              </span>
            ) : "Sign in →"}
          </button>
        </form>

        <div style={styles.divider}><span>Don't have an account?</span></div>
        <Link to="/register" style={styles.switchLink}>
          Create a free account
        </Link>

        <div style={styles.helpRow}>
          <a href="/privacy" style={styles.helpLink}>Privacy</a>
          <span style={styles.helpDot}>·</span>
          <a href="/terms" style={styles.helpLink}>Terms</a>
          <span style={styles.helpDot}>·</span>
          <a href="/contact" style={styles.helpLink}>Help</a>
        </div>
      </div>

      {/* Floating feature pills */}
      <div style={styles.pills}>
        <div style={styles.pill}>📋 Kanban boards</div>
        <div style={styles.pill}>🏃 Sprint planning</div>
        <div style={styles.pill}>📅 Calendar view</div>
        <div style={styles.pill}>👥 Team workload</div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setShowForgot(false)}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Reset your password</span>
              <button style={styles.modalClose} onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}>✕</button>
            </div>
            {forgotSent ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📨</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>Check your inbox</div>
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                  If an account exists for <strong>{forgotEmail}</strong>, we've sent a password reset link.
                </div>
                <button style={{ ...styles.submitBtn, marginTop: 20 }} onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword}>
                <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>
                <div style={styles.field}>
                  <label style={styles.label}>Email address</label>
                  <input
                    type="email"
                    style={styles.input}
                    placeholder="you@company.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                    onFocus={e => e.target.style.borderColor = "#6366f1"}
                    onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                  />
                </div>
                <button type="submit" style={{ ...styles.submitBtn, marginTop: 8, opacity: forgotLoading ? 0.7 : 1 }} disabled={forgotLoading}>
                  {forgotLoading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    padding: "24px", position: "relative", overflow: "hidden",
    flexDirection: "column", gap: "24px",
  },
  blob1: { position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)", top: "-100px", left: "-100px", pointerEvents: "none" },
  blob2: { position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)", bottom: "-80px", right: "-80px", pointerEvents: "none" },
  card: {
    background: "#ffffff", borderRadius: 20, padding: "40px 44px",
    width: "100%", maxWidth: 420,
    boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
    position: "relative", zIndex: 1,
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28 },
  logoMark: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  logoText: { fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", flex: 1 },
  logoBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "rgba(99,102,241,0.1)", borderRadius: 4, padding: "2px 5px" },
  heading: { fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.5px" },
  subtext: { fontSize: 14, color: "#64748b", margin: "0 0 20px" },
  infoBox: { display: "flex", alignItems: "center", gap: 8, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 500, marginBottom: 18 },
  errorBox: { display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 500, marginBottom: 18 },
  googleBtn: {
    width: "100%", padding: "11px 16px",
    background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#374151",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    gap: 10, marginBottom: 10, transition: "all 0.15s",
  },
  demoBtn: {
    width: "100%", padding: "11px 16px",
    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
    border: "1.5px solid #bbf7d0",
    borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#059669",
    cursor: "pointer", marginBottom: 4,
  },
  orDivider: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0" },
  orLine: { flex: 1, height: 1, background: "#f1f5f9" },
  orText: { fontSize: 12, color: "#94a3b8", fontWeight: 500, flexShrink: 0 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  input: { width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", transition: "border-color 0.15s", boxSizing: "border-box", fontFamily: "inherit" },
  passWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" },
  submitBtn: { width: "100%", padding: "13px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4, letterSpacing: "0.2px", transition: "opacity 0.15s" },
  btnInner: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  spinner: { animation: "spin 0.7s linear infinite" },
  divider: { textAlign: "center", margin: "20px 0 14px", fontSize: 13, color: "#94a3b8" },
  switchLink: { display: "block", textAlign: "center", padding: "11px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#6366f1", textDecoration: "none" },
  helpRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  helpLink: { fontSize: 12, color: "#94a3b8", textDecoration: "none" },
  helpDot: { fontSize: 12, color: "#cbd5e1" },
  forgotLink: { background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6366f1", fontWeight: 600, padding: 0 },
  pills: { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", position: "relative", zIndex: 1 },
  pill: { background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 99, padding: "6px 14px", fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  modalCard: { background: "#fff", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 400, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 700, color: "#0f172a" },
  modalClose: { background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8", padding: 4, lineHeight: 1 },
};
