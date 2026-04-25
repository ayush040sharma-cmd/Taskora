import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../api/api";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword]       = useState("");
  const [confirm,  setConfirm]        = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [loading,  setLoading]        = useState(false);
  const [error,    setError]          = useState("");
  const [success,  setSuccess]        = useState(false);

  useEffect(() => {
    if (!token) setError("Invalid or missing reset token. Please request a new reset link.");
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 8)  return setError("Password must be at least 8 characters.");
    if (!/[A-Z]/.test(password)) return setError("Password must contain at least one uppercase letter.");
    if (!/[0-9]/.test(password)) return setError("Password must contain at least one number.");

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.blob1} />
      <div style={styles.blob2} />
      <div style={styles.card}>
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

        {success ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
            <h2 style={styles.heading}>Password updated!</h2>
            <p style={styles.subtext}>Redirecting you to sign in…</p>
            <Link to="/login" style={styles.submitBtn}>Go to Sign In</Link>
          </div>
        ) : (
          <>
            <h1 style={styles.heading}>Set new password</h1>
            <p style={styles.subtext}>Choose a strong password for your account.</p>

            {error && (
              <div style={styles.errorBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>New password</label>
                <div style={styles.passWrap}>
                  <input
                    type={showPass ? "text" : "password"}
                    style={{ ...styles.input, paddingRight: 44 }}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
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
                <div style={styles.hints}>
                  {[
                    { label: "8+ characters", ok: password.length >= 8 },
                    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
                    { label: "Number", ok: /[0-9]/.test(password) },
                  ].map(h => (
                    <span key={h.label} style={{ color: h.ok ? "#10b981" : "#94a3b8" }}>
                      {h.ok ? "✓" : "○"} {h.label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Confirm password</label>
                <input
                  type="password"
                  style={{ ...styles.input, borderColor: confirm && confirm !== password ? "#fca5a5" : "#e2e8f0" }}
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  onFocus={e => e.target.style.borderColor = "#6366f1"}
                  onBlur={e => e.target.style.borderColor = confirm && confirm !== password ? "#fca5a5" : "#e2e8f0"}
                />
              </div>

              <button
                type="submit"
                style={{ ...styles.submitBtn, opacity: loading || !token ? 0.7 : 1 }}
                disabled={loading || !token}
              >
                {loading ? "Updating…" : "Update password →"}
              </button>
            </form>

            <div style={styles.backRow}>
              <Link to="/login" style={styles.backLink}>← Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", padding: "24px", position: "relative", overflow: "hidden" },
  blob1: { position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)", top: "-100px", left: "-100px", pointerEvents: "none" },
  blob2: { position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)", bottom: "-80px", right: "-80px", pointerEvents: "none" },
  card: { background: "#fff", borderRadius: 20, padding: "40px 44px", width: "100%", maxWidth: 420, boxShadow: "0 25px 60px rgba(0,0,0,0.4)", position: "relative", zIndex: 1 },
  logoRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28 },
  logoMark: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  logoText: { fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", flex: 1 },
  logoBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "rgba(99,102,241,0.1)", borderRadius: 4, padding: "2px 5px" },
  heading: { fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.5px" },
  subtext: { fontSize: 14, color: "#64748b", margin: "0 0 20px" },
  errorBox: { display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 500, marginBottom: 18 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  input: { width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", transition: "border-color 0.15s", boxSizing: "border-box", fontFamily: "inherit" },
  passWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" },
  hints: { display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap", marginTop: 4 },
  submitBtn: { display: "block", textAlign: "center", width: "100%", padding: "13px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4, letterSpacing: "0.2px", textDecoration: "none", boxSizing: "border-box" },
  backRow: { textAlign: "center", marginTop: 20 },
  backLink: { fontSize: 13, color: "#6366f1", textDecoration: "none", fontWeight: 600 },
};
