import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TaskoraLogo from "../components/TaskoraLogo";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="auth-split">
      {/* ── Left Panel ── */}
      <div className="auth-panel-left">
        <div className="auth-panel-brand">
          <TaskoraLogo size={32} color="#ffffff" showName nameColor="#ffffff" />
        </div>

        <div className="auth-panel-center">
          <h2 className="auth-panel-headline">
            Your projects.<br />
            Your team.<br />
            <span>One workspace.</span>
          </h2>
          <p className="auth-panel-sub">
            Join thousands of teams who use Taskora to plan, track, and
            deliver work on time — without the chaos.
          </p>

          <div className="auth-panel-stats">
            <div className="auth-stat-item">
              <span className="auth-stat-num">Free</span>
              <span className="auth-stat-label">Forever plan</span>
            </div>
            <div className="auth-stat-item">
              <span className="auth-stat-num">30s</span>
              <span className="auth-stat-label">Setup time</span>
            </div>
            <div className="auth-stat-item">
              <span className="auth-stat-num">∞</span>
              <span className="auth-stat-label">Tasks & boards</span>
            </div>
          </div>

          <div className="auth-board-preview">
            <div className="auth-board-col">
              <div className="auth-board-col-title">
                <div className="auth-board-col-dot" style={{ background: "#94a3b8" }} />
                To Do
              </div>
              <div className="auth-task-chip">Write user stories</div>
              <div className="auth-task-chip">
                API design
                <div><span className="auth-task-chip-badge" style={{ background: "rgba(251,113,133,0.2)", color: "#fda4af" }}>High</span></div>
              </div>
            </div>
            <div className="auth-board-col">
              <div className="auth-board-col-title">
                <div className="auth-board-col-dot" style={{ background: "#60a5fa" }} />
                In Progress
              </div>
              <div className="auth-task-chip">
                Frontend build
                <div><span className="auth-task-chip-badge" style={{ background: "rgba(96,165,250,0.2)", color: "#93c5fd" }}>Medium</span></div>
              </div>
            </div>
            <div className="auth-board-col">
              <div className="auth-board-col-title">
                <div className="auth-board-col-dot" style={{ background: "#34d399" }} />
                Done
              </div>
              <div className="auth-task-chip">
                DB schema
                <div><span className="auth-task-chip-badge" style={{ background: "rgba(52,211,153,0.2)", color: "#6ee7b7" }}>✓</span></div>
              </div>
              <div className="auth-task-chip">Auth setup</div>
            </div>
          </div>
        </div>

        <div className="auth-panel-footer">
          © {new Date().getFullYear()} Taskora. All rights reserved.
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="auth-panel-right">
        <div className="auth-form-logo">
          <div className="auth-form-logo-mark">
            <TaskoraLogo size={22} color="#ffffff" showName={false} />
          </div>
          <span className="auth-form-logo-name">Taskora</span>
        </div>

        <h2 className="auth-form-title">Create your account</h2>
        <p className="auth-form-sub">Start for free — no credit card required</p>

        {error && <div className="auth-error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Alex Johnson"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Repeat your password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "Creating account…" : "Create free account →"}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: 24 }}>
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
