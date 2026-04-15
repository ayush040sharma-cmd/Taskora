import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TaskoraLogo from "../components/TaskoraLogo";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split">
      {/* ── Left Panel ── */}
      <div className="auth-panel-left">
        <div className="auth-panel-brand">
          <TaskoraLogo size={32} color="#ffffff" showName nameColor="#ffffff" />
        </div>

        <div className="auth-panel-center">
          <h2 className="auth-panel-headline">
            Everything your<br />
            team needs to<br />
            <span>ship faster.</span>
          </h2>
          <p className="auth-panel-sub">
            Plan, track, and deliver work across your entire team —
            all in one place. No complexity, just clarity.
          </p>

          <div className="auth-panel-stats">
            <div className="auth-stat-item">
              <span className="auth-stat-num">3×</span>
              <span className="auth-stat-label">Faster delivery</span>
            </div>
            <div className="auth-stat-item">
              <span className="auth-stat-num">100%</span>
              <span className="auth-stat-label">Free to start</span>
            </div>
            <div className="auth-stat-item">
              <span className="auth-stat-num">∞</span>
              <span className="auth-stat-label">Workspaces</span>
            </div>
          </div>

          {/* Mini board preview */}
          <div className="auth-board-preview">
            <div className="auth-board-col">
              <div className="auth-board-col-title">
                <div className="auth-board-col-dot" style={{ background: "#94a3b8" }} />
                To Do
              </div>
              <div className="auth-task-chip">
                Research competitors
                <div><span className="auth-task-chip-badge" style={{ background: "rgba(148,163,184,0.25)", color: "#94a3b8" }}>Low</span></div>
              </div>
              <div className="auth-task-chip">Update docs</div>
            </div>
            <div className="auth-board-col">
              <div className="auth-board-col-title">
                <div className="auth-board-col-dot" style={{ background: "#60a5fa" }} />
                In Progress
              </div>
              <div className="auth-task-chip">
                Build auth flow
                <div><span className="auth-task-chip-badge" style={{ background: "rgba(96,165,250,0.2)", color: "#93c5fd" }}>High</span></div>
              </div>
            </div>
            <div className="auth-board-col">
              <div className="auth-board-col-title">
                <div className="auth-board-col-dot" style={{ background: "#34d399" }} />
                Done
              </div>
              <div className="auth-task-chip">
                Setup project
                <div><span className="auth-task-chip-badge" style={{ background: "rgba(52,211,153,0.2)", color: "#6ee7b7" }}>✓ Done</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-panel-footer">
          © {new Date().getFullYear()} Taskora. All rights reserved.
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="auth-panel-right">
        {/* Logo on mobile / top of form */}
        <div className="auth-form-logo">
          <div className="auth-form-logo-mark">
            <TaskoraLogo size={22} color="#ffffff" showName={false} />
          </div>
          <span className="auth-form-logo-name">Taskora</span>
        </div>

        <h2 className="auth-form-title">Welcome back</h2>
        <p className="auth-form-sub">Sign in to your workspace to continue</p>

        {error && <div className="auth-error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: 24 }}>
          Don't have an account?{" "}
          <Link to="/register">Create one free</Link>
        </div>
      </div>
    </div>
  );
}
