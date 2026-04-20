import { useState } from "react";
import api from "../api/api";

export default function AccountSettingsModal({ onClose }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const strength = (pw) => {
    let s = 0;
    if (pw.length >= 6)  s++;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s; // 0-4
  };

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#6366f1", "#10b981"];
  const pw = form.new_password;
  const s = strength(pw);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match");
      return;
    }
    if (form.new_password.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setSuccess("Password changed successfully!");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Account Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="modal-section-label">Change Password</div>

          <div className="modal-field">
            <label className="modal-label">Current password</label>
            <div className="modal-input-wrap">
              <input
                className="modal-input"
                type={showCurrent ? "text" : "password"}
                value={form.current_password}
                onChange={set("current_password")}
                placeholder="Enter current password"
                autoFocus
              />
              <button type="button" className="modal-eye" onClick={() => setShowCurrent(v => !v)}>
                {showCurrent ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">New password</label>
            <div className="modal-input-wrap">
              <input
                className="modal-input"
                type={showNew ? "text" : "password"}
                value={form.new_password}
                onChange={set("new_password")}
                placeholder="Min. 6 characters"
              />
              <button type="button" className="modal-eye" onClick={() => setShowNew(v => !v)}>
                {showNew ? "🙈" : "👁"}
              </button>
            </div>
            {pw.length > 0 && (
              <div className="modal-strength">
                <div className="modal-strength-bars">
                  {[1,2,3,4].map(i => (
                    <div
                      key={i}
                      className="modal-strength-bar"
                      style={{ background: i <= s ? strengthColor[s] : "#e2e8f0" }}
                    />
                  ))}
                </div>
                <span className="modal-strength-label" style={{ color: strengthColor[s] }}>
                  {strengthLabel[s]}
                </span>
              </div>
            )}
          </div>

          <div className="modal-field">
            <label className="modal-label">Confirm new password</label>
            <input
              className="modal-input"
              type="password"
              value={form.confirm_password}
              onChange={set("confirm_password")}
              placeholder="Repeat new password"
            />
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
