/**
 * Manager Dashboard
 * Full team workload view: utilization, SLA tracking, audit log,
 * team capacity editor, AI prediction warnings.
 */
import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import WorkloadDashboard from "./WorkloadDashboard";
import MembersPanel from "./MembersPanel";
import AnalyticsDashboard from "./AnalyticsDashboard";
import CollaborationScore from "./CollaborationScore";
import ChannelView from "./ChannelView";
import ManagerOverview from "./ManagerOverview";

const STATUS_COLOR = {
  available:  "#10b981",
  moderate:   "#f59e0b",
  overloaded: "#ef4444",
  on_leave:   "#94a3b8",
};
const STATUS_BG = {
  available:  "#f0fdf4",
  moderate:   "#fffbeb",
  overloaded: "#fef2f2",
  on_leave:   "#f8fafc",
};
const RISK_COLOR = { low: "#10b981", medium: "#f59e0b", high: "#ef4444", on_leave: "#94a3b8" };

function LoadBar({ pct, color }) {
  const c = color || (pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct || 0, 100)}%`, height: "100%", background: c, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: c, minWidth: 36 }}>{pct ?? "—"}%</span>
    </div>
  );
}

function MemberCard({ m, onEdit }) {
  const color = STATUS_COLOR[m.status] || "#6366f1";
  return (
    <div className="mgr-member-card" style={{ borderLeft: `4px solid ${color}`, background: STATUS_BG[m.status] }}>
      <div className="mgr-member-top">
        <div className="mgr-member-avatar" style={{ background: color }}>
          {m.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mgr-member-name">{m.name}</span>
            <span className={`mgr-role-pill mgr-role-pill--${m.role}`}>{m.role?.replace("_", " ")}</span>
            {m.travel_mode && <span className="mgr-badge mgr-badge--travel">✈ Travel</span>}
            {m.on_leave    && <span className="mgr-badge mgr-badge--leave">🏖 Leave</span>}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.email}</div>
        </div>
        <button className="mgr-edit-btn" onClick={() => onEdit(m)} title="Edit capacity">⚙</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <LoadBar pct={m.load_percent} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
          <span>{m.task_count} active task{m.task_count !== 1 ? "s" : ""}</span>
          <span>{m.total_remaining_hours}h remaining · {m.daily_capacity}h/day capacity</span>
        </div>
      </div>

      {/* Type breakdown */}
      {m.by_type && Object.keys(m.by_type).length > 0 && (
        <div className="mgr-type-row">
          {Object.entries(m.by_type).map(([type, info]) => (
            <span key={type} className="mgr-type-chip">
              {type} <strong>{info.count}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Capacity Edit Modal ───────────────────────────────────────────────────────
function CapacityEditModal({ member, workspaceId, onClose, onSaved }) {
  const [form, setForm] = useState({
    daily_hours:       member.daily_capacity || 8,
    travel_mode:       member.travel_mode || false,
    travel_hours:      2,
    on_leave:          member.on_leave || false,
    leave_start:       member.leave_start || "",
    leave_end:         member.leave_end   || "",
    max_rfp:           member.limits?.max_rfp || 1,
    max_proposals:     member.limits?.max_proposals || 2,
    max_presentations: member.limits?.max_presentations || 2,
    max_upgrades:      member.limits?.max_upgrades || 2,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.put(`/capacity/team/${workspaceId}/${member.user_id}`, form);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2 className="modal-title">Capacity — {member.name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form" style={{ gap: 14 }}>
          <div className="mgr-edit-row">
            <label className="modal-label">Daily capacity (hours)</label>
            <input className="modal-input" type="number" min={0} max={24} step={0.5} value={form.daily_hours} onChange={set("daily_hours")} />
          </div>

          <div className="mgr-edit-section">Status</div>
          <label className="mgr-toggle">
            <input type="checkbox" checked={form.travel_mode} onChange={set("travel_mode")} />
            <span>✈ Travel mode</span>
            {form.travel_mode && (
              <input className="modal-input" type="number" min={0} max={24} step={0.5}
                value={form.travel_hours} onChange={set("travel_hours")}
                style={{ width: 80, marginLeft: 8 }} placeholder="hrs/day" />
            )}
          </label>
          <label className="mgr-toggle">
            <input type="checkbox" checked={form.on_leave} onChange={set("on_leave")} />
            <span>🏖 On leave</span>
          </label>
          {form.on_leave && (
            <div style={{ display: "flex", gap: 10 }}>
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">From</label>
                <input className="modal-input" type="date" value={form.leave_start} onChange={set("leave_start")} />
              </div>
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">To</label>
                <input className="modal-input" type="date" value={form.leave_end} onChange={set("leave_end")} />
              </div>
            </div>
          )}

          <div className="mgr-edit-section">Allocation limits</div>
          {[["max_rfp","Max RFPs"],["max_proposals","Max proposals"],["max_presentations","Max presentations"],["max_upgrades","Max upgrades"]].map(([k, label]) => (
            <div className="mgr-edit-row" key={k}>
              <label className="modal-label">{label}</label>
              <input className="modal-input" type="number" min={0} max={20} value={form[k]} onChange={set(k)} style={{ width: 80 }} />
            </div>
          ))}

          {error && <div className="modal-error">{error}</div>}
          <div className="modal-actions">
            <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-modal-save" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Prediction Panel ───────────────────────────────────────────────────────
function PredictionPanel({ predictions }) {
  if (!predictions || !predictions.length) return null;
  const at_risk = predictions.filter(p => p.prediction.risk === "high" || p.prediction.burnout_risk);

  return (
    <div className="mgr-predict-panel">
      <div className="mgr-panel-title">🤖 AI Workload Prediction (14 days)</div>
      {predictions.map(p => (
        <div key={p.user_id} className="mgr-predict-row">
          <div className="mgr-predict-name">{p.name}</div>
          <div className="mgr-predict-sparkline">
            {p.prediction.days?.map((d, i) => (
              <div key={i} className="mgr-spark"
                style={{ height: `${Math.max(2, d.load_percent)}%`, background: RISK_COLOR[p.prediction.risk] }}
                title={`${d.date}: ${d.load_percent}%`}
              />
            ))}
          </div>
          <span className="mgr-predict-badge" style={{ background: RISK_COLOR[p.prediction.risk] + "22", color: RISK_COLOR[p.prediction.risk] }}>
            {p.prediction.risk === "on_leave" ? "On leave" : `${p.prediction.peak_load}% peak`}
          </span>
          {p.prediction.burnout_risk && <span className="mgr-burnout-tag">🔥 burnout risk</span>}
        </div>
      ))}
      {at_risk.length > 0 && (
        <div className="mgr-alert">
          ⚠️ {at_risk.map(p => p.name).join(", ")} {at_risk.length === 1 ? "is" : "are"} likely overloaded next week
        </div>
      )}
    </div>
  );
}

// ── Approvals Panel ───────────────────────────────────────────────────────────
function ApprovalsPanel({ workspaceId, onRefresh }) {
  const [approvals, setApprovals] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.get(`/approvals/pending`)
      .then(r => setApprovals(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const resolve = async (id, action, reason = "") => {
    try {
      await api.put(`/approvals/${id}/${action}`, { rejection_reason: reason });
      setApprovals(prev => prev.filter(a => a.id !== id));
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.message || "Failed");
    }
  };

  if (loading) return <div className="mgr-loading">Loading approvals…</div>;
  if (!approvals.length) return <div className="mgr-empty-note">No pending approvals</div>;

  return (
    <div className="mgr-approvals-list">
      {approvals.map(a => (
        <div key={a.id} className="mgr-approval-card">
          <div className="mgr-approval-info">
            <div className="mgr-approval-task">📋 {a.task_title}</div>
            <div className="mgr-approval-meta">
              {a.requested_by_name} → assign to <strong>{a.assigned_to_name}</strong>
              {a.justification && <span className="mgr-justification">"{a.justification}"</span>}
            </div>
          </div>
          <div className="mgr-approval-actions">
            <button className="mgr-btn-approve" onClick={() => resolve(a.id, "approve")}>✓ Approve</button>
            <button className="mgr-btn-reject" onClick={() => {
              const reason = window.prompt("Rejection reason:");
              if (reason !== null) resolve(a.id, "reject", reason);
            }}>✗ Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
function AuditLog({ workspaceId }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/audit?workspace_id=${workspaceId}&limit=30`)
      .then(r => setLogs(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return <div className="mgr-loading">Loading audit log…</div>;
  if (!logs.length) return <div className="mgr-empty-note">No audit records yet</div>;

  const ACTION_ICON = {
    task_assigned: "📋", approval_requested: "⏳", approval_approved: "✅",
    approval_rejected: "❌", capacity_changed: "⚙️", travel_mode_on: "✈️", leave_started: "🏖️",
  };

  return (
    <div className="mgr-audit-list">
      {logs.map(l => (
        <div key={l.id} className="mgr-audit-row">
          <span className="mgr-audit-icon">{ACTION_ICON[l.action] || "📝"}</span>
          <div className="mgr-audit-body">
            <span className="mgr-audit-actor">{l.actor_name}</span>
            <span className="mgr-audit-action"> {l.action?.replace(/_/g, " ")}</span>
            {l.meta?.task_title && <span className="mgr-audit-target"> "{l.meta.task_title}"</span>}
          </div>
          <span className="mgr-audit-time">
            {new Date(l.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgoShort(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)        return "just now";
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeDueDate(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 86400)     return "Yesterday";
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Manager Overview Dashboard View ──────────────────────────────────────────
function ManagerDashView({ workspaceId, workspaceName }) {
  const [tasks,           setTasks]           = useState([]);
  const [activity,        setActivity]        = useState([]);
  const [tasksLoading,    setTasksLoading]    = useState(true);
  const [actLoading,      setActLoading]      = useState(true);
  const [overdueOpen,     setOverdueOpen]     = useState(true);
  const [activityOpen,    setActivityOpen]    = useState(true);
  const [dayGroupsOpen,   setDayGroupsOpen]   = useState({});
  const [refreshedAt,     setRefreshedAt]     = useState(Date.now());

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return;
    setTasksLoading(true);
    try {
      const r = await api.get(`/tasks/workspace/${workspaceId}`);
      setTasks(r.data);
      setRefreshedAt(Date.now());
    } catch {}
    finally { setTasksLoading(false); }
  }, [workspaceId]);

  const loadActivity = useCallback(async () => {
    if (!workspaceId) return;
    setActLoading(true);
    try {
      const r = await api.get(`/audit?workspace_id=${workspaceId}&limit=20`);
      setActivity(r.data);
    } catch {}
    finally { setActLoading(false); }
  }, [workspaceId]);

  useEffect(() => { loadTasks(); loadActivity(); }, [loadTasks, loadActivity]);

  // Compute week range
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const relevant = tasks.filter(t => {
    if (!t.due_date || t.status === "done") return false;
    return new Date(t.due_date) <= endOfWeek;
  });
  const overdue   = relevant.filter(t => new Date(t.due_date) < today);
  const upcoming  = relevant.filter(t => new Date(t.due_date) >= today);

  const dayGroups = {};
  upcoming.forEach(t => {
    const label = new Date(t.due_date).toLocaleDateString("en-US", { weekday: "long" });
    if (!dayGroups[label]) dayGroups[label] = [];
    dayGroups[label].push(t);
  });

  const minAgo = Math.floor((Date.now() - refreshedAt) / 60000);
  const refreshLabel = minAgo === 0 ? "Just now" : `${minAgo}m ago`;
  const PRIORITY_ICON = { high: "🔴", medium: "🟡", low: "🟢" };

  function TaskRow({ task, isOverdue }) {
    return (
      <div className="mgr-dash-row" style={{ background: isOverdue ? "#fff8f8" : undefined }}>
        <div className="mgr-dash-cell mgr-dash-name">
          <span className="mgr-dash-task-name">{task.title}</span>
        </div>
        <div className="mgr-dash-cell mgr-dash-assignee">
          {task.assignee_name ? (
            <div className="mgr-dash-avatar" title={task.assignee_name}>
              {task.assignee_name.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div className="mgr-dash-avatar mgr-dash-avatar--empty" title="Unassigned">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          )}
        </div>
        <div className="mgr-dash-cell mgr-dash-due" style={{ color: isOverdue ? "#ef4444" : "#374151", fontWeight: isOverdue ? 700 : 400 }}>
          {isOverdue
            ? relativeDueDate(task.due_date)
            : new Date(task.due_date).toLocaleDateString("en-US", { weekday: "short" })}
        </div>
        <div className="mgr-dash-cell mgr-dash-priority">
          {task.priority ? (PRIORITY_ICON[task.priority] || "") : ""}
        </div>
      </div>
    );
  }

  function SectionHeader({ label, count, open, onToggle, isOverdue }) {
    return (
      <div className={`mgr-dash-section ${isOverdue ? "mgr-dash-section--overdue" : ""}`} onClick={onToggle}>
        <span className="mgr-dash-chevron" style={{ color: isOverdue ? "#ef4444" : "#374151" }}>
          {open ? "▼" : "▶"}
        </span>
        <span className="mgr-dash-section-label" style={{ color: isOverdue ? "#ef4444" : "#172b4d" }}>
          {label}
        </span>
        <span className="mgr-dash-count">{count}</span>
      </div>
    );
  }

  return (
    <div className="mgr-dash-layout">
      {/* ── Left: Tasks Due Widget ── */}
      <div className="mgr-dash-widget">
        {/* Toolbar */}
        <div className="mgr-dash-toolbar">
          <div className="mgr-dash-toolbar-left">
            <span className="mgr-dash-pill">Group: Due date</span>
            <span className="mgr-dash-pill">Subtasks</span>
            <span className="mgr-dash-pill">Columns</span>
          </div>
          <div className="mgr-dash-toolbar-right">
            <span className="mgr-dash-refreshed">Refreshed {refreshLabel}</span>
            <button className="mgr-dash-icon-btn" onClick={loadTasks} title="Refresh">↻</button>
          </div>
        </div>

        {/* Column headers */}
        <div className="mgr-dash-col-header">
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: 52 }}>Assignee</span>
          <span style={{ width: 84 }}>Due date</span>
          <span style={{ width: 52 }}>Priority</span>
        </div>

        {tasksLoading ? (
          <div className="mgr-loading" style={{ padding: "32px 0" }}>Loading tasks…</div>
        ) : relevant.length === 0 ? (
          <div className="mgr-dash-empty">
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600, color: "#172b4d" }}>All caught up!</div>
            <div style={{ color: "#64748b", marginTop: 4 }}>No overdue or upcoming tasks this week.</div>
          </div>
        ) : (
          <>
            {overdue.length > 0 && (
              <>
                <SectionHeader label="Overdue" count={overdue.length} open={overdueOpen}
                  onToggle={() => setOverdueOpen(v => !v)} isOverdue />
                {overdueOpen && overdue.map(t => <TaskRow key={t.id} task={t} isOverdue />)}
                {overdueOpen && <div className="mgr-dash-add-row">+ Add Task</div>}
              </>
            )}
            {Object.entries(dayGroups).map(([day, dayTasks]) => (
              <div key={day}>
                <SectionHeader label={day} count={dayTasks.length}
                  open={dayGroupsOpen[day] !== false}
                  onToggle={() => setDayGroupsOpen(p => ({ ...p, [day]: p[day] === false ? true : false }))} />
                {dayGroupsOpen[day] !== false && dayTasks.map(t => <TaskRow key={t.id} task={t} />)}
                {dayGroupsOpen[day] !== false && <div className="mgr-dash-add-row">+ Add Task</div>}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Right: Latest Activity ── */}
      <div className="mgr-dash-activity">
        <div className="mgr-dash-activity-header">
          <span>Latest Activity</span>
          <button className="mgr-dash-icon-btn" onClick={() => setActivityOpen(v => !v)}>
            {activityOpen ? "▾" : "▸"}
          </button>
        </div>
        {activityOpen && (
          <div className="mgr-dash-activity-body">
            <div className="mgr-dash-upgrade-banner">
              <div className="mgr-dash-upgrade-title">
                Only the last 24 hours of activity is available on your current plan
              </div>
              <div className="mgr-dash-upgrade-cta">
                Upgrade to <strong>Pro</strong> to unlock 7 days of Activity
              </div>
            </div>
            {actLoading ? (
              <div className="mgr-loading" style={{ padding: "20px 16px" }}>Loading…</div>
            ) : activity.length === 0 ? (
              <div style={{ padding: "20px 16px", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                No recent activity
              </div>
            ) : activity.slice(0, 15).map(e => (
              <div key={e.id} className="mgr-dash-act-row">
                <div className="mgr-dash-act-avatar">
                  {(e.actor_name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="mgr-dash-act-body">
                  <div>
                    <span className="mgr-dash-act-actor">{e.actor_name || "Someone"}</span>
                    {" "}<span className="mgr-dash-act-action">{e.action?.replace(/_/g, " ")}</span>
                    {e.meta?.task_title && (
                      <span className="mgr-dash-act-task"> "{e.meta.task_title}"</span>
                    )}
                  </div>
                  <div className="mgr-dash-act-time">{timeAgoShort(e.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ManagerDashboard({ workspaceId, workspaceName, onNavigate }) {
  const { user } = useAuth();
  const [team,        setTeam]        = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editMember,  setEditMember]  = useState(null);
  const [activeTab,   setActiveTab]   = useState("dashboard");

  const canManage = !!user;

  const loadTeam = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    setLoading(true);
    try {
      const [teamR, predR] = await Promise.all([
        api.get(`/capacity/team/${workspaceId}`),
        api.get(`/capacity/predict/${workspaceId}?days=14`),
      ]);
      setTeam(teamR.data);
      setPredictions(predR.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, canManage]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  if (!canManage) {
    return (
      <div className="mgr-access-denied">
        <div className="mgr-denied-icon">🔒</div>
        <div className="mgr-denied-title">Manager access required</div>
        <div className="mgr-denied-body">This view is only available to managers and super bosses.</div>
      </div>
    );
  }

  if (loading) return <div className="wl-loading">Loading team dashboard…</div>;

  const overloaded  = team.filter(m => m.status === "overloaded").length;
  const onLeave     = team.filter(m => m.on_leave).length;
  const avgLoad     = team.length
    ? Math.round(team.filter(m => !m.on_leave).reduce((s, m) => s + (m.load_percent || 0), 0) / Math.max(1, team.filter(m => !m.on_leave).length))
    : 0;

  const TABS = ["dashboard", "workload", "members", "predictions", "approvals", "collab", "channel"];
  const TAB_LABELS = {
    dashboard:   "🗂️ Overview",
    workload:    "👥 Workload & Capacity",
    members:     "👤 Members",
    predictions: "🤖 AI Predictions",
    approvals:   "✅ Approvals",
    collab:      "🤝 Collaboration",
    channel:     "💬 Channel",
  };

  return (
    <div className="mgr-root">
      {/* Stats strip */}
      <div className="mgr-stats">
        <div className="mgr-stat">
          <div className="mgr-stat-value">{team.length}</div>
          <div className="mgr-stat-label">Team members</div>
        </div>
        <div className="mgr-stat">
          <div className="mgr-stat-value" style={{ color: overloaded > 0 ? "#ef4444" : "#10b981" }}>{overloaded}</div>
          <div className="mgr-stat-label">Overloaded</div>
        </div>
        <div className="mgr-stat">
          <div className="mgr-stat-value" style={{ color: "#f59e0b" }}>{onLeave}</div>
          <div className="mgr-stat-label">On leave</div>
        </div>
        <div className="mgr-stat">
          <div className="mgr-stat-value">{avgLoad}%</div>
          <div className="mgr-stat-label">Avg utilization</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mgr-tabs">
        {TABS.map(t => (
          <button key={t} className={`mgr-tab ${activeTab === t ? "mgr-tab--active" : ""}`} onClick={() => setActiveTab(t)}>
            {TAB_LABELS[t]}
            {t === "approvals" && <span className="mgr-tab-badge"> </span>}
          </button>
        ))}
      </div>

      {/* Overview — new redesigned dashboard */}
      {activeTab === "dashboard" && (
        <ManagerOverview
          workspaceId={workspaceId}
          team={team}
          onNavigateToSimulate={() => {
            // navigate to the Simulate view in the sidebar
            if (onNavigate) onNavigate("simulate");
          }}
        />
      )}

      {/* Workload & Capacity (merged) */}
      {activeTab === "workload" && (
        <div>
          <WorkloadDashboard workspaceId={workspaceId} />
          <div style={{ marginTop: 24 }}>
            <div className="mgr-panel-title" style={{ marginBottom: 12, paddingLeft: 4 }}>⚙️ Team Capacity</div>
            <div className="mgr-team-grid">
              {team.map(m => (
                <MemberCard key={m.user_id} m={m} onEdit={setEditMember} />
              ))}
              {team.length === 0 && (
                <div className="mgr-empty-note">No team members found. Invite people to your workspace.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members */}
      {activeTab === "members" && (
        <MembersPanel workspaceId={workspaceId} />
      )}

      {/* AI Predictions */}
      {activeTab === "predictions" && (
        <PredictionPanel predictions={predictions} />
      )}

      {/* Approvals */}
      {activeTab === "approvals" && (
        <div className="mgr-panel">
          <div className="mgr-panel-title">Pending Approvals</div>
          <ApprovalsPanel workspaceId={workspaceId} onRefresh={loadTeam} />
        </div>
      )}

      {/* Collaboration */}
      {activeTab === "collab" && (
        <CollaborationScore workspaceId={workspaceId} />
      )}

      {/* Channel */}
      {activeTab === "channel" && (
        <ChannelView workspaceId={workspaceId} workspaceName={workspaceName} onNavigate={onNavigate} />
      )}

      {/* Edit capacity modal */}
      {editMember && (
        <CapacityEditModal
          member={editMember}
          workspaceId={workspaceId}
          onClose={() => setEditMember(null)}
          onSaved={loadTeam}
        />
      )}
    </div>
  );
}
