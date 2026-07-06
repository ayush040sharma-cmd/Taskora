import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import api from "../api/api";
import AccessControlPanel from "../components/AccessControlPanel";
import EnterpriseApprovalCenter from "../components/EnterpriseApprovalCenter";
import IntegrationsPanel from "../components/IntegrationsPanel";

// ── Permission gating ─────────────────────────────────────────────────────────
const ROLE_LEVELS = { team_member: 1, manager: 2, super_boss: 3 };
function atLeast(role, min) {
  return (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[min] || 0);
}

const TIMEZONES = [
  "UTC","Asia/Kolkata","America/New_York","America/Los_Angeles",
  "America/Chicago","Europe/London","Europe/Paris","Europe/Berlin",
  "Asia/Dubai","Asia/Singapore","Asia/Tokyo","Australia/Sydney",
];

// ── Settings section registry ─────────────────────────────────────────────────
function buildSections(role) {
  const all = [
    { id: "general",       label: "General",                         icon: "⚙️",  group: "PERSONAL",        minRole: null },
    { id: "notifications", label: "Notifications",                    icon: "🔔",  group: "PERSONAL",        minRole: null },
    { id: "regional",      label: "Language & Region",                icon: "🌍",  group: "PERSONAL",        minRole: null },
    { id: "security",      label: "Security",                         icon: "🔒",  group: "PERSONAL",        minRole: null },
    { id: "workspace",     label: "Workspace Preferences",            icon: "🖥️",  group: "WORKSPACE",       minRole: null },
    { id: "demo",          label: "Demo Data",                        icon: "🚀",  group: "WORKSPACE",       minRole: null },
    { id: "project",       label: "Project Settings",                 icon: "📋",  group: "TEAM",            minRole: "manager" },
    { id: "workflow",      label: "Workflow & Approvals",             icon: "🔄",  group: "TEAM",            minRole: "manager" },
    { id: "integrations",  label: "Integrations",                     icon: "🔗",  group: "TEAM",            minRole: "manager" },
    { id: "user-mgmt",     label: "User Management & Access Control", icon: "🔐",  group: "ADMINISTRATION",  minRole: "super_boss" },
  ];
  return all.filter(s => !s.minRole || atLeast(role, s.minRole));
}

// ── Toggle switch helper ──────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        position: "relative", width: 44, height: 24, borderRadius: 99, flexShrink: 0,
        background: on ? "var(--tk-accent, #3B82F6)" : "#cbd5e1", border: "none", cursor: "pointer",
        transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
      }} />
    </button>
  );
}

function SaveRow({ onSave, saved, label = "Save" }) {
  return (
    <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center" }}>
      <button
        onClick={onSave}
        style={{ background: "var(--tk-accent, #3B82F6)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
      >
        {label}
      </button>
      {saved && <span style={{ fontSize: 13, color: "#10b981" }}>✓ Saved</span>}
    </div>
  );
}

function SectionHeading({ title, desc }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
      {desc && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0 }}>{desc}</p>}
    </div>
  );
}

function Row({ label, desc, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Section: General ─────────────────────────────────────────────────────────
function GeneralSection({ workspaceId }) {
  const { isDark, toggle } = useTheme();
  const [defaultView, setDefaultView] = useState(localStorage.getItem("taskora-default-view") || "board");
  const [compact, setCompact]         = useState(localStorage.getItem("taskora-compact") === "true");
  const [saved, setSaved]             = useState(false);

  function save() {
    localStorage.setItem("taskora-default-view", defaultView);
    localStorage.setItem("taskora-compact", String(compact));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <SectionHeading title="General" desc="Appearance and default behavior for your Taskora session." />

      <Row label={isDark ? "🌙 Dark mode" : "☀️ Light mode"} desc="Switch between light and dark interface.">
        <Toggle on={isDark} onChange={toggle} />
      </Row>

      <Row label="Compact task cards" desc="Smaller cards with less detail to fit more on screen.">
        <Toggle on={compact} onChange={setCompact} />
      </Row>

      <div style={{ paddingTop: 12 }}>
        <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>
          Default view when opening workspace
        </label>
        <select
          value={defaultView}
          onChange={e => setDefaultView(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)", width: "100%", maxWidth: 260 }}
        >
          {[
            ["board","Kanban Board"], ["summary","Summary Dashboard"], ["calendar","Calendar"],
            ["sprints","Sprints"], ["gantt","Gantt Chart"], ["workload","Team Workload"],
          ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <SaveRow onSave={save} saved={saved} label="Save preferences" />
    </div>
  );
}

// ── Section: Notifications ───────────────────────────────────────────────────
function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    email_digest:    localStorage.getItem("notif_email_digest")    !== "false",
    task_assigned:   localStorage.getItem("notif_task_assigned")   !== "false",
    task_comments:   localStorage.getItem("notif_task_comments")   !== "false",
    approval_alerts: localStorage.getItem("notif_approval_alerts") !== "false",
    overdue_alerts:  localStorage.getItem("notif_overdue_alerts")  !== "false",
  });
  const [saved, setSaved] = useState(false);

  function save() {
    Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(`notif_${k}`, String(v)));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const ITEMS = [
    { key: "email_digest",    label: "Daily email digest",    desc: "Receive a daily summary of your tasks and team activity." },
    { key: "task_assigned",   label: "Task assignments",      desc: "Alert when a task is assigned to me." },
    { key: "task_comments",   label: "Task comments",         desc: "Alert when someone comments on my tasks." },
    { key: "approval_alerts", label: "Approval requests",     desc: "Alert when approvals need my attention." },
    { key: "overdue_alerts",  label: "Overdue alerts",        desc: "Alert when my tasks become overdue." },
  ];

  return (
    <div>
      <SectionHeading title="Notifications" desc="Choose which events trigger in-app and email notifications." />
      {ITEMS.map(({ key, label, desc }) => (
        <Row key={key} label={label} desc={desc}>
          <Toggle on={prefs[key]} onChange={v => setPrefs(p => ({ ...p, [key]: v }))} />
        </Row>
      ))}
      <SaveRow onSave={save} saved={saved} label="Save preferences" />
    </div>
  );
}

// ── Section: Language & Region ───────────────────────────────────────────────
function RegionalSection() {
  const [timezone,   setTimezone]   = useState(localStorage.getItem("taskora-timezone") || "Asia/Kolkata");
  const [dateFormat, setDateFormat] = useState(localStorage.getItem("taskora-date-fmt") || "DD/MM/YYYY");
  const [saved, setSaved] = useState(false);

  function save() {
    localStorage.setItem("taskora-timezone", timezone);
    localStorage.setItem("taskora-date-fmt", dateFormat);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <SectionHeading title="Language & Region" desc="Set your timezone and how dates are displayed." />

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>Timezone</label>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)", width: "100%", maxWidth: 280 }}
        >
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div>
        <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>Date format</label>
        <select
          value={dateFormat}
          onChange={e => setDateFormat(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)", width: "100%", maxWidth: 280 }}
        >
          <option value="DD/MM/YYYY">DD/MM/YYYY (India)</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
          <option value="D MMM YYYY">D MMM YYYY (e.g. 26 Jun 2026)</option>
        </select>
      </div>

      <SaveRow onSave={save} saved={saved} />
    </div>
  );
}

// ── Section: Security ────────────────────────────────────────────────────────
function SecuritySection() {
  const [form, setForm]     = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const strengthScore = pw => {
    let s = 0;
    if (pw.length >= 6)  s++;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };
  const STRENGTH_LABEL = ["","Weak","Fair","Good","Strong"];
  const STRENGTH_COLOR = ["","#ef4444","#f59e0b","var(--tk-accent, #3B82F6)","#10b981"];
  const pw = form.new_password;
  const s  = strengthScore(pw);

  async function handleSave(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (form.new_password !== form.confirm_password) { setError("Passwords do not match"); return; }
    if (form.new_password.length < 8) { setError("New password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.put("/auth/password", { current_password: form.current_password, new_password: form.new_password });
      setSuccess("Password updated successfully.");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update password.");
    } finally { setSaving(false); }
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 8,
    padding: "9px 12px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)",
  };

  return (
    <div>
      <SectionHeading title="Security" desc="Change your password and review active sessions." />

      <form onSubmit={handleSave} style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>Current password</label>
          <div style={{ position: "relative" }}>
            <input style={inputStyle} type={showCur ? "text" : "password"} value={form.current_password} onChange={set("current_password")} placeholder="Enter current password" />
            <button type="button" onClick={() => setShowCur(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>{showCur ? "🙈" : "👁"}</button>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>New password</label>
          <div style={{ position: "relative" }}>
            <input style={inputStyle} type={showNew ? "text" : "password"} value={form.new_password} onChange={set("new_password")} placeholder="Min. 8 characters" />
            <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>{showNew ? "🙈" : "👁"}</button>
          </div>
          {pw.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <div style={{ display: "flex", gap: 3, flex: 1 }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= s ? STRENGTH_COLOR[s] : "#e2e8f0" }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: STRENGTH_COLOR[s], fontWeight: 600 }}>{STRENGTH_LABEL[s]}</span>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>Confirm new password</label>
          <input style={inputStyle} type="password" value={form.confirm_password} onChange={set("confirm_password")} placeholder="Repeat new password" />
          {form.confirm_password && form.new_password !== form.confirm_password && (
            <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>Passwords don't match</div>
          )}
        </div>

        {error   && <div style={{ fontSize: 13, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
        {success && <div style={{ fontSize: 13, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "8px 12px" }}>{success}</div>}

        <div>
          <button
            type="submit"
            disabled={saving}
            style={{ background: saving ? "#e2e8f0" : "var(--tk-accent, #3B82F6)", color: saving ? "#888" : "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}>Active Sessions</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Current session</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>This browser · {new Date().toLocaleDateString()}</div>
          </div>
          <span style={{ fontSize: 11, background: "#dcfce7", color: "#16a34a", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>Active</span>
        </div>
      </div>
    </div>
  );
}

// ── Section: Workspace Preferences ───────────────────────────────────────────
function WorkspacePreferencesSection({ workspaceId }) {
  const [taskPrefix,      setTaskPrefix]      = useState(localStorage.getItem("taskora-task-prefix") || "TASK");
  const [sprintDuration,  setSprintDuration]  = useState(localStorage.getItem("taskora-sprint-days") || "14");
  const [defaultPriority, setDefaultPriority] = useState(localStorage.getItem("taskora-default-priority") || "medium");
  const [autoArchiveDays, setAutoArchiveDays] = useState(localStorage.getItem("taskora-auto-archive-days") || "30");
  const [showCompleted,   setShowCompleted]   = useState(localStorage.getItem("taskora-show-completed") !== "false");
  const [saved,           setSaved]           = useState(false);

  function save() {
    localStorage.setItem("taskora-task-prefix",        taskPrefix.trim() || "TASK");
    localStorage.setItem("taskora-sprint-days",        sprintDuration);
    localStorage.setItem("taskora-default-priority",   defaultPriority);
    localStorage.setItem("taskora-auto-archive-days",  autoArchiveDays);
    localStorage.setItem("taskora-show-completed",     String(showCompleted));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <SectionHeading title="Workspace Preferences" desc="Configure workspace-level defaults and task behavior." />

      <Row label="Task ID prefix" desc="Short prefix shown before task numbers (e.g. TASK-001, ENG-042).">
        <input
          value={taskPrefix}
          onChange={e => setTaskPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          maxLength={6}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)", width: 80, textAlign: "center", fontWeight: 700, letterSpacing: 1 }}
        />
      </Row>

      <Row label="Default sprint duration (days)" desc="How many days a new sprint spans when created.">
        <select
          value={sprintDuration}
          onChange={e => setSprintDuration(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)" }}
        >
          {["7","10","14","21","28"].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </Row>

      <Row label="Default task priority" desc="Priority assigned to new tasks when none is explicitly set.">
        <select
          value={defaultPriority}
          onChange={e => setDefaultPriority(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)" }}
        >
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🟢 Low</option>
        </select>
      </Row>

      <Row label="Show completed tasks on board" desc="Toggle whether Done column is visible in Kanban view by default.">
        <Toggle on={showCompleted} onChange={setShowCompleted} />
      </Row>

      <Row label="Auto-archive done tasks after (days)" desc="Automatically remove done tasks from active view after this many days.">
        <select
          value={autoArchiveDays}
          onChange={e => setAutoArchiveDays(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)" }}
        >
          <option value="0">Never</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
        </select>
      </Row>

      <SaveRow onSave={save} saved={saved} label="Save workspace preferences" />
    </div>
  );
}

// ── Section: Demo Data ───────────────────────────────────────────────────────
function DemoSection({ workspaceId }) {
  const [seeding, setSeeding]   = useState(false);
  const [seedMsg, setSeedMsg]   = useState("");
  const [seedErr, setSeedErr]   = useState("");

  async function handleSeed() {
    if (!workspaceId) { setSeedErr("No workspace selected. Open a workspace first."); return; }
    setSeeding(true); setSeedMsg(""); setSeedErr("");
    try {
      const r = await api.post("/seed/demo", { workspace_id: workspaceId });
      const s = r.data.summary;
      setSeedMsg(`Done! Created ${s.tasks} tasks, ${s.sprint} sprint, ${s.calendar} calendar events, ${s.comments} comments, ${s.audit} activity entries.`);
    } catch (err) {
      setSeedErr(err.response?.data?.message || "Seeding failed. Try again.");
    } finally { setSeeding(false); }
  }

  return (
    <div>
      <SectionHeading title="Demo Data" desc="Fill your current workspace with realistic sample tasks, a sprint, calendar events, and comments. This will clear existing tasks." />
      {seedMsg && <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#22c55e", marginBottom: 12 }}>✅ {seedMsg}</div>}
      {seedErr && <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#ef4444", marginBottom: 12 }}>❌ {seedErr}</div>}
      <button
        onClick={handleSeed}
        disabled={seeding}
        style={{ background: seeding ? "#e2e8f0" : "var(--tk-accent, #3B82F6)", color: seeding ? "#888" : "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: seeding ? "not-allowed" : "pointer" }}
      >
        {seeding ? "⏳ Loading demo data…" : "🚀 Load demo data"}
      </button>
    </div>
  );
}

// ── Section: Project Settings ────────────────────────────────────────────────
const DEFAULT_STATUSES = [
  { id: 1, label: "Backlog",     color: "#94a3b8" },
  { id: 2, label: "To Do",       color: "var(--tk-accent, #3B82F6)" },
  { id: 3, label: "In Progress", color: "#f59e0b" },
  { id: 4, label: "Review",      color: "#8b5cf6" },
  { id: 5, label: "Done",        color: "#10b981" },
];

const DEFAULT_PRIORITIES = [
  { label: "Critical", color: "#ef4444" },
  { label: "High",     color: "#f97316" },
  { label: "Medium",   color: "#f59e0b" },
  { label: "Low",      color: "var(--tk-accent, #3B82F6)" },
];

function ProjectSection() {
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <SectionHeading title="Project Settings" desc="Configure default task statuses, priorities, and labels for this workspace." />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 10 }}>Task Statuses</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DEFAULT_STATUSES.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--column-bg)", borderRadius: 6, padding: "2px 8px" }}>System</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 10 }}>Priority Levels</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DEFAULT_PRIORITIES.map(p => (
            <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 12px", borderRadius: 99, background: p.color + "20", color: p.color, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
              {p.label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>
          Custom statuses and labels coming soon.
        </div>
      </div>
    </div>
  );
}

// ── Section: Workflow & Approvals ────────────────────────────────────────────
function WorkflowSection() {
  return (
    <div>
      <SectionHeading title="Workflow & Approvals" desc="Manage all approval requests — review, approve, decline, or escalate from one place." />
      <EnterpriseApprovalCenter />
    </div>
  );
}

// ── Section: Integrations ────────────────────────────────────────────────────
function IntegrationsSection({ workspaceId }) {
  return (
    <div>
      <SectionHeading title="Integrations" desc="Connect Taskora to external tools and services." />
      <IntegrationsPanel workspaceId={workspaceId} />
    </div>
  );
}

// ── Section: User Management & Access Control ─────────────────────────────────
function UserMgmtSection({ workspaceId }) {
  return (
    <div>
      <SectionHeading
        title="User Management & Access Control"
        desc="Create users, assign roles, configure permissions, manage departments and teams, and review the audit log."
      />
      <AccessControlPanel hideHeader workspaceId={workspaceId} />
    </div>
  );
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
const GROUP_LABELS = {
  PERSONAL:       "Personal",
  WORKSPACE:      "Workspace",
  TEAM:           "Team & Project",
  ADMINISTRATION: "Administration",
};

function SettingsNav({ sections, active, onSelect }) {
  const groups = [...new Set(sections.map(s => s.group))];
  return (
    <div style={{
      width: 220, flexShrink: 0, borderRight: "1px solid var(--border)",
      background: "var(--column-bg)", overflowY: "auto", paddingBottom: 16,
    }}>
      <div style={{ padding: "20px 16px 12px", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
        Settings
      </div>
      {groups.map(group => {
        const items = sections.filter(s => s.group === group);
        return (
          <div key={group} style={{ marginBottom: 4 }}>
            <div style={{ padding: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {GROUP_LABELS[group]}
            </div>
            {items.map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                style={{
                  width: "100%", textAlign: "left", padding: "8px 16px",
                  background: active === s.id ? "var(--card-bg)" : "transparent",
                  border: "none", cursor: "pointer",
                  borderLeft: active === s.id ? "3px solid var(--tk-accent, #3B82F6)" : "3px solid transparent",
                  color: active === s.id ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: active === s.id ? 600 : 400,
                  fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function SettingsPage({ currentWorkspaceId }) {
  const { user } = useAuth();
  const role     = user?.role || "team_member";
  const sections = buildSections(role);
  const [active, setActive] = useState(sections[0]?.id || "general");

  // Ensure active section is always visible for this role
  useEffect(() => {
    if (!sections.find(s => s.id === active)) {
      setActive(sections[0]?.id || "general");
    }
  }, [role]);

  function renderContent() {
    switch (active) {
      case "general":       return <GeneralSection workspaceId={currentWorkspaceId} />;
      case "notifications": return <NotificationsSection />;
      case "regional":      return <RegionalSection />;
      case "security":      return <SecuritySection />;
      case "workspace":     return <WorkspacePreferencesSection workspaceId={currentWorkspaceId} />;
      case "demo":          return <DemoSection workspaceId={currentWorkspaceId} />;
      case "project":       return <ProjectSection />;
      case "workflow":      return <WorkflowSection />;
      case "integrations":  return <IntegrationsSection workspaceId={currentWorkspaceId} />;
      case "user-mgmt":     return <UserMgmtSection workspaceId={currentWorkspaceId} />;
      default:              return null;
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      <SettingsNav sections={sections} active={active} onSelect={setActive} />
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        <div style={{ maxWidth: 860 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
