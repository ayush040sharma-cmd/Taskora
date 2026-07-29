import { useState } from "react";
import api from "../api/api";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../context/AuthContext";

const TIMEZONES = [
  "UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles",
  "America/Chicago", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
];

export default function AccountSettingsModal({ onClose, currentWorkspaceId, initialSection }) {
  const { theme, toggle, isDark } = useTheme();
  const { user } = useAuth();

  // Active section tab
  const [section, setSection] = useState(initialSection || "appearance");

  // ── Password change ──────────────────────────────────────────────────────────
  const [form, setForm]       = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // ── Notifications ────────────────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({
    email_digest:    localStorage.getItem("notif_email_digest")    !== "false",
    task_assigned:   localStorage.getItem("notif_task_assigned")   !== "false",
    task_comments:   localStorage.getItem("notif_task_comments")   !== "false",
    approval_alerts: localStorage.getItem("notif_approval_alerts") !== "false",
    overdue_alerts:  localStorage.getItem("notif_overdue_alerts")  !== "false",
  });
  const [notifSaved, setNotifSaved] = useState(false);

  const saveNotifPrefs = () => {
    Object.entries(notifPrefs).forEach(([k, v]) => localStorage.setItem(`notif_${k}`, String(v)));
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  // ── Regional ─────────────────────────────────────────────────────────────────
  const [timezone,   setTimezone]   = useState(localStorage.getItem("taskora-timezone") || "Asia/Kolkata");
  const [dateFormat, setDateFormat] = useState(localStorage.getItem("taskora-date-fmt") || "DD/MM/YYYY");
  const [regionalSaved, setRegionalSaved] = useState(false);

  const saveRegional = () => {
    localStorage.setItem("taskora-timezone", timezone);
    localStorage.setItem("taskora-date-fmt", dateFormat);
    setRegionalSaved(true);
    setTimeout(() => setRegionalSaved(false), 2000);
  };

  // ── Workspace preferences ────────────────────────────────────────────────────
  const [defaultView, setDefaultView] = useState(localStorage.getItem("taskora-default-view") || "board");
  const [compactMode, setCompactMode] = useState(localStorage.getItem("taskora-compact") === "true");
  const [prefSaved, setPrefSaved] = useState(false);

  const savePrefs = () => {
    localStorage.setItem("taskora-default-view", defaultView);
    localStorage.setItem("taskora-compact", String(compactMode));
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 2000);
  };

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
  const strengthColor = ["", "var(--tk-status-danger, #EF4444)", "var(--tk-status-warn, #F59E0B)", "var(--tk-accent, #3B82F6)", "#10b981"];
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

  const SECTIONS = [
    { id: "appearance",    label: "Appearance",    icon: "🎨" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "regional",      label: "Language & Region", icon: "🌍" },
    { id: "workspace",     label: "Display",       icon: "🖼️" },
    { id: "security",      label: "Security",      icon: "🔒" },
    { id: "demo",          label: "Demo Data",     icon: "🚀" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, padding: 0, display: "flex", flexDirection: "row", minHeight: 480 }}>
        {/* ── Left nav ── */}
        <div style={{
          width: 180, borderRight: "1px solid var(--border)", padding: "20px 0",
          background: "var(--column-bg)", borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)", flexShrink: 0,
        }}>
          <div style={{ padding: "0 16px 12px", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>Settings</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                width: "100%", textAlign: "left", padding: "9px 16px",
                background: section === s.id ? "var(--card-bg)" : "transparent",
                border: "none", cursor: "pointer",
                borderLeft: section === s.id ? "3px solid var(--primary)" : "3px solid transparent",
                color: section === s.id ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: section === s.id ? 600 : 400, fontSize: 13,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span>{s.icon}</span>{s.label}
            </button>
          ))}

          <div style={{ padding: "12px 16px 0", borderTop: "1px solid var(--border)", marginTop: "auto" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Logged in as
              <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginTop: 2 }}>{user?.name}</div>
              <div style={{ fontSize: 10, marginTop: 1 }}>{user?.role}</div>
            </div>
          </div>
        </div>

        {/* ── Right content ── */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto", position: "relative" }}>
          <button className="modal-close" onClick={onClose} style={{ position: "absolute", top: 16, right: 16 }}>✕</button>

          {/* ── APPEARANCE ── */}
          {section === "appearance" && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 20 }}>Appearance</h3>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>
                    {isDark ? "🌙 Dark mode" : "☀️ Light mode"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Switch between light and dark interface. Also accessible via the toolbar button.
                  </div>
                </div>
                <button
                  onClick={toggle}
                  style={{
                    position: "relative", width: 48, height: 26, borderRadius: 99,
                    background: isDark ? "var(--tk-accent, #3B82F6)" : "#cbd5e1",
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
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {section === "notifications" && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 20 }}>Notifications</h3>
              {[
                { key: "email_digest",    label: "Daily email digest",    desc: "Receive a daily summary of your tasks and team activity" },
                { key: "task_assigned",   label: "Task assignments",      desc: "Notify me when a task is assigned to me" },
                { key: "task_comments",   label: "Task comments",         desc: "Notify me when someone comments on my tasks" },
                { key: "approval_alerts", label: "Approval requests",     desc: "Notify me when approvals need my attention" },
                { key: "overdue_alerts",  label: "Overdue task alerts",   desc: "Alert me when my tasks become overdue" },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>
                  </div>
                  <button
                    onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
                    style={{
                      position: "relative", width: 44, height: 24, borderRadius: 99, flexShrink: 0,
                      background: notifPrefs[key] ? "var(--tk-accent, #3B82F6)" : "#cbd5e1",
                      border: "none", cursor: "pointer", transition: "background 0.2s",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 3, left: notifPrefs[key] ? 22 : 3,
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
                    }} />
                  </button>
                </div>
              ))}
              <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={saveNotifPrefs} style={{ background: "var(--tk-accent, #3B82F6)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  Save preferences
                </button>
                {notifSaved && <span style={{ fontSize: 13, color: "#10b981" }}>✓ Saved</span>}
              </div>
            </div>
          )}

          {/* ── LANGUAGE & REGION ── */}
          {section === "regional" && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 20 }}>Language & Region</h3>
              <div className="modal-field">
                <label className="modal-label">Timezone</label>
                <select className="modal-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="modal-field" style={{ marginTop: 14 }}>
                <label className="modal-label">Date format</label>
                <select className="modal-input" value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (India)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                  <option value="D MMM YYYY">D MMM YYYY (e.g. 25 Jun 2026)</option>
                </select>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={saveRegional} style={{ background: "var(--tk-accent, #3B82F6)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  Save
                </button>
                {regionalSaved && <span style={{ fontSize: 13, color: "#10b981" }}>✓ Saved</span>}
              </div>
            </div>
          )}

          {/* ── DISPLAY PREFERENCES ──
               Personal to this browser (localStorage-backed default view +
               card density) -- "Workspace Preferences" implied these were
               workspace-wide/shared, which they never were. ── */}
          {section === "workspace" && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 4 }}>Display Preferences</h3>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 20 }}>Personal to this browser — not shared with teammates.</p>
              <div className="modal-field">
                <label className="modal-label">Default view when opening workspace</label>
                <select className="modal-input" value={defaultView} onChange={e => setDefaultView(e.target.value)}>
                  <option value="board">Kanban Board</option>
                  <option value="summary">Summary Dashboard</option>
                  <option value="calendar">Calendar</option>
                  <option value="sprints">Sprints</option>
                  <option value="gantt">Gantt Chart</option>
                  <option value="workload">Workload</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>Compact task cards</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Show smaller task cards with less detail to fit more on screen</div>
                </div>
                <button
                  onClick={() => setCompactMode(v => !v)}
                  style={{
                    position: "relative", width: 44, height: 24, borderRadius: 99, flexShrink: 0,
                    background: compactMode ? "var(--tk-accent, #3B82F6)" : "#cbd5e1",
                    border: "none", cursor: "pointer", transition: "background 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: compactMode ? 22 : 3,
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
                  }} />
                </button>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={savePrefs} style={{ background: "var(--tk-accent, #3B82F6)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  Save preferences
                </button>
                {prefSaved && <span style={{ fontSize: 13, color: "#10b981" }}>✓ Saved</span>}
              </div>
            </div>
          )}

          {/* ── SECURITY / CHANGE PASSWORD ── */}
          {section === "security" && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 20 }}>Security</h3>
              <div className="modal-section-label" style={{ marginTop: 0 }}>Change Password</div>
              <form onSubmit={handleSave} className="modal-form" style={{ paddingTop: 0 }}>
                <div className="modal-field">
                  <label className="modal-label">Current password</label>
                  <div className="modal-input-wrap">
                    <input className="modal-input" type={showCurrent ? "text" : "password"}
                      value={form.current_password} onChange={set("current_password")}
                      placeholder="Enter current password" />
                    <button type="button" className="modal-eye" onClick={() => setShowCurrent(v => !v)}>{showCurrent ? "🙈" : "👁"}</button>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">New password</label>
                  <div className="modal-input-wrap">
                    <input className="modal-input" type={showNew ? "text" : "password"}
                      value={form.new_password} onChange={set("new_password")}
                      placeholder="Min. 8 characters" />
                    <button type="button" className="modal-eye" onClick={() => setShowNew(v => !v)}>{showNew ? "🙈" : "👁"}</button>
                  </div>
                  {pw.length > 0 && (
                    <div className="modal-strength">
                      <div className="modal-strength-bars">
                        {[1,2,3,4].map(i => (
                          <div key={i} className="modal-strength-bar" style={{ background: i <= s ? strengthColor[s] : "#e2e8f0" }} />
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

              <div className="modal-section-label" style={{ marginTop: 24 }}>Active Sessions</div>
              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Current session</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>This browser · {new Date().toLocaleDateString()}</div>
                  </div>
                  <span style={{ fontSize: 11, background: "var(--tk-status-ok-bg, rgba(34,197,94,0.15))", color: "var(--tk-status-ok, #22C55E)", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>Active</span>
                </div>
              </div>
            </div>
          )}

          {/* ── DEMO DATA ── */}
          {section === "demo" && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 8 }}>Demo Data</h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                Fill your current workspace with realistic sample tasks, a sprint, calendar events, comments, and AI risk scores.
                <strong style={{ color: "var(--text-primary)" }}> This will clear existing tasks.</strong>
              </p>
              {seedMsg && (
                <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--tk-status-ok, #22C55E)", marginBottom: 10 }}>
                  ✅ {seedMsg}
                </div>
              )}
              {seedError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--tk-status-danger, #EF4444)", marginBottom: 10 }}>
                  ❌ {seedError}
                </div>
              )}
              <button
                onClick={handleSeed}
                disabled={seeding}
                style={{
                  background: seeding ? "#e2e8f0" : "var(--tk-accent, #3B82F6)", color: seeding ? "#888" : "#fff",
                  border: "none", borderRadius: 8, padding: "9px 18px",
                  fontWeight: 600, fontSize: 13, cursor: seeding ? "not-allowed" : "pointer",
                }}
              >
                {seeding ? "⏳ Loading demo data…" : "🚀 Load demo data"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
