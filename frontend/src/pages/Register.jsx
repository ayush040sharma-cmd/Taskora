import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
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
              <path d="M18 8l2.5-2.5M21 5.5l-1 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={styles.logoText}>Taskora</span>
        </div>

        <h1 style={styles.heading}>Create your account</h1>
        <p style={styles.subtext}>Free forever · No credit card required</p>

        {error && (
          <div style={styles.errorBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Full name</label>
            <input
              type="text"
              style={styles.input}
              placeholder="Alex Johnson"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
              onFocus={e => e.target.style.borderColor = "#6366f1"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email address</label>
            <input
              type="email"
              style={styles.input}
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              onFocus={e => e.target.style.borderColor = "#6366f1"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"}
            />
          </div>

          <div style={styles.twoCol}>
            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <div style={styles.passWrap}>
                <input
                  type={showPass ? "text" : "password"}
                  style={{...styles.input, paddingRight: 40}}
                  placeholder="Min. 6 chars"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  onFocus={e => e.target.style.borderColor = "#6366f1"}
                  onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                />
                <button type="button" style={styles.eyeBtn} onClick={() => setShowPass(v => !v)}>
                  {showPass
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Confirm password</label>
              <input
                type={showPass ? "text" : "password"}
                style={styles.input}
                placeholder="Repeat password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"}
              />
            </div>
          </div>

          {/* Password strength */}
          {form.password.length > 0 && (
            <div style={styles.strengthWrap}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  ...styles.strengthBar,
                  background: form.password.length >= i * 3
                    ? (form.password.length < 6 ? "#f59e0b" : form.password.length < 10 ? "#6366f1" : "#10b981")
                    : "#e2e8f0"
                }} />
              ))}
              <span style={{fontSize:11, color: form.password.length < 6 ? "#f59e0b" : form.password.length < 10 ? "#6366f1" : "#10b981"}}>
                {form.password.length < 6 ? "Weak" : form.password.length < 10 ? "Good" : "Strong"}
              </span>
            </div>
          )}

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
                Creating account…
              </span>
            ) : "Create free account →"}
          </button>
        </form>

        <div style={styles.divider}><span>Already have an account?</span></div>

        <Link to="/login" style={styles.switchLink}>
          Sign in instead
        </Link>
      </div>

      <div style={styles.pills}>
        <div style={styles.pill}>📋 Kanban boards</div>
        <div style={styles.pill}>🏃 Sprint planning</div>
        <div style={styles.pill}>📅 Calendar view</div>
        <div style={styles.pill}>👥 Team workload</div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
    flexDirection: "column",
    gap: "24px",
  },
  blob1: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)",
    top: "-100px",
    left: "-100px",
    pointerEvents: "none",
  },
  blob2: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)",
    bottom: "-80px",
    right: "-80px",
    pointerEvents: "none",
  },
  card: {
    background: "#ffffff",
    borderRadius: 20,
    padding: "40px 44px",
    width: "100%",
    maxWidth: 460,
    boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
    position: "relative",
    zIndex: 1,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.5px",
  },
  heading: {
    fontSize: 26,
    fontWeight: 800,
    color: "#0f172a",
    margin: "0 0 6px",
    letterSpacing: "-0.5px",
  },
  subtext: {
    fontSize: 14,
    color: "#64748b",
    margin: "0 0 24px",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 18,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 14,
    color: "#0f172a",
    background: "#f8fafc",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  passWrap: {
    position: "relative",
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
  },
  strengthWrap: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: -4,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 99,
    transition: "background 0.3s",
  },
  submitBtn: {
    width: "100%",
    padding: "13px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
    letterSpacing: "0.2px",
    transition: "opacity 0.15s",
  },
  btnInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  spinner: {
    animation: "spin 0.7s linear infinite",
  },
  divider: {
    textAlign: "center",
    margin: "22px 0 16px",
    fontSize: 13,
    color: "#94a3b8",
  },
  switchLink: {
    display: "block",
    textAlign: "center",
    padding: "11px",
    border: "1.5px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    color: "#6366f1",
    textDecoration: "none",
    transition: "all 0.15s",
  },
  pills: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
  },
  pill: {
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 99,
    padding: "6px 14px",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: 500,
  },
};
