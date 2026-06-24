import { useState } from "react";
import api from "../api/api";
import { useTheme } from "../hooks/useTheme";

export default function AccountSettingsModal({ onClose, currentWorkspaceId }) {
  const { theme, toggle, isDark } = useTheme();

  // ── Password change ──────────────────────────────────────────────────────────
  const [form, setForm]       = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // ── Demo seed ────────────────────────────────────────────────────────────────
  const [seeding, setSeeding]     = useState(false);
  const [seedMsg, setSeedMsg]     = useState("");
  const [seedError, setSeedError] = useState("");

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const strength = (pw) => {
    let s = 0;
    if (pw.length >= 6)  s++;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#6366f1", "#10b981"];
  const pw = form.new_password;
  const s = strength(pw);

  const handleSave = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (form.new_password !== form.confirm_password) { setError("Passwords do not match"); return; }
    if (form.new_password.length < 8) { setError("New password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.put("/auth/password", { current_password: form.current_password, new_password: form.new_password });
      setSuccess("Password changed successfully!");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password");
    } finally { setSaving(false); }
  };

  const handleSeed = async () => {
    if (!currentWorkspaceId) { setSeedError("No workspace selected. Open a workspace first."); return; }
    setSeeding(true); setSeedMsg(""); setSeedError("");
    try {
      const r = await api.post("/seed/demo", { workspace_id: currentWorkspaceId });
      const s = r.data.summary;
      setSeedMsg(`Done! Created ${s.tasks} tasks, ${s.sprint} sprint, ${s.calendar} calendar events, ${s.comments} comments, ${s.audit} activity entries.`);
    } catch (err) {
      setSeedError(err.response?.data?.message || "Seeding failed. Try again.");
    } finally { setSeeding(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Appearance ──────────────────────────────────────────────────── */}
        <div className="modal-section-label" style={{ marginTop: 0 }}>Appearance</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>
              {isDark ? "🌙 Dark mode" : "☀️ Light mode"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              Switch between light and dark interface
            </div>
          </div>
          <button
            onClick={toggle}
            style={{
              position: "relative", width: 48, height: 26, borderRadius: 99,
              background: isDark ? "#6366f1" : "#cbd5e1",
              border: "none", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
            }}
            aria-label="Toggle theme"
          >
            <span style={{
              position: "absolute", top: 3, left: isDark ? 25 : 3,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
            }}>
              {isDark ? "🌙" : "☀️"}
            </span>
          </button>
        </div>

        {/* ── Demo Data ───────────────────────────────────────────────────── */}
        <div className="modal-section-label">Demo Data</div>
        <div style={{ padding: "4px 0 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
            Fill your current workspace with realistic sample tasks, a sprint, calendar events, comments, and AI risk scores so you can explore every feature.
            <strong style={{ color: "var(--text-primary)" }}> This will clear existing tasks.</strong>
          </div>
          {seedMsg && (
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#16a34a", marginBottom: 10 }}>
              ✅ {seedMsg}
            </div>
          )}
          {seedError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#dc2626", marginBottom: 10 }}>
              ❌ {seedError}
            </div>
          )}
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{
              background: seeding ? "#e2e8f0" : "#6366f1", color: "#fff",
              border: "none", borderRadius: 8, padding: "9px 18px",
              fontWeight: 600, fontSize: 13, cursor: seeding ? "not-allowed" : "pointer",
            }}
          >
            {seeding ? "⏳ Loading demo data…" : "🚀 Load demo data"}
          </button>
        </div>

        {/* ── Password ────────────────────────────────────────────────────── */}
        <div className="modal-section-label">Change Password</div>
        <form onSubmit={handleSave} className="modal-form" style={{ paddingTop: 0 }}>
          <div className="modal-field">
            <label className="modal-label">Current password</label>
            <div className="modal-input-wrap">
              <input className="modal-input" type={showCurrent ? "text" : "password"}
                value={form.current_password} onChange={set("current_password")}
                placeholder="Enter current password" autoFocus />
              <button type="button" className="modal-eye" onClick={() => setShowCurrent(v => !v)}>
                {showCurrent ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">New password</label>
            <div className="modal-input-wrap">
              <input className="modal-input" type={showNew ? "text" : "password"}
                value={form.new_password} onChange={set("new_password")}
                placeholder="Min. 8 characters" />
              <button type="button" className="modal-eye" onClick={() => setShowNew(v => !v)}>
                {showNew ? "🙈" : "👁"}
              </button>
            </div>
            {pw.length > 0 && (
              <div className="modal-strength">
                <div className="modal-strength-bars">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="modal-strength-bar"
                      style={{ background: i <= s ? strengthColor[s] : "#e2e8f0" }} />
                  ))}
                </div>
                <span className="modal-strength-label" style={{ color: strengthColor[s] }}>{strengthLabel[s]}</span>
              </div>
            )}
          </div>

          <div className="modal-field">
            <label className="modal-label">Confirm new password</label>
            <input className="modal-input" type="password"
              value={form.confirm_password} onChange={set("confirm_password")}
              placeholder="Repeat new password" />
            {form.confirm_password && form.new_password !== form.confirm_password && (
              <div className="modal-hint modal-hint--err">Passwords don't match</div>
            )}
          </div>

          {error   && <div className="modal-error">{error}</div>}
          {success && <div className="modal-success">{success}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-modal-save" disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
