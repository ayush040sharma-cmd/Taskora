import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import WorkloadDashboard from "./WorkloadDashboard";
import MembersPanel from "./MembersPanel";
import AnalyticsDashboard from "./AnalyticsDashboard";
import CollaborationScore from "./CollaborationScore";
import ChannelView from "./ChannelView";
import ManagerOverview from "./ManagerOverview";
import "../styles/manager.css";

const STATUS_COLOR = {
  available:  "var(--tk-status-ok)",
  moderate:   "var(--tk-status-warn)",
  overloaded: "var(--tk-status-danger)",
  on_leave:   "var(--tk-text-muted)",
};

const RISK_COLOR = {
  low:      "var(--tk-status-ok)",
  medium:   "var(--tk-status-warn)",
  high:     "var(--tk-status-danger)",
  on_leave: "var(--tk-text-muted)",
};

function LoadBar({ pct }) {
  const fillClass = pct >= 90 ? "tk-progress-fill--danger"
                  : pct >= 70 ? "tk-progress-fill--warn"
                  : "tk-progress-fill";
  const textColor = pct >= 90 ? "var(--tk-status-danger)"
                  : pct >= 70 ? "var(--tk-status-warn)"
                  : "var(--tk-status-ok)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="tk-progress-track" style={{ flex: 1, height: 8 }}>
        <div className={`tk-progress-fill ${fillClass}`} style={{ width: `${Math.min(pct || 0, 100)}%`, height: "100%" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: textColor, minWidth: 36 }}>
        {pct ?? "—"}%
      </span>
    </div>
  );
}

function MemberCard({ m, onEdit }) {
  const color = STATUS_COLOR[m.status] || "var(--tk-accent)";
  return (
    <div className="mgr-member-card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="mgr-member-top">
        <div className="tk-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
          {m.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="mgr-member-name">{m.name}</span>
            <span className={`mgr-role-pill mgr-role-pill--${m.role}`}>
              {m.role?.replace("_", " ")}
            </span>
            {m.travel_mode && <span className="mgr-badge mgr-badge--travel">✈ Travel</span>}
            {m.on_leave    && <span className="mgr-badge mgr-badge--leave">🏖 Leave</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 2 }}>{m.email}</div>
        </div>
        <button className="mgr-edit-btn" onClick={() => onEdit(m)} title="Edit capacity">⚙</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <LoadBar pct={m.load_percent} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--tk-text-muted)", marginTop: 6 }}>
          <span>{m.task_count} active task{m.task_count !== 1 ? "s" : ""}</span>
          <span>{m.total_remaining_hours}h remaining · {m.daily_capacity}h/day capacity</span>
        </div>
      </div>

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
    setSaving(true); setError("");
    try {
      await api.put(`/capacity/team/${workspaceId}/${member.user_id}`, form);
      onSaved(); onClose();
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
function PredictionPanel({ predictions, loading, error }) {
  if (loading) return <div className="mgr-empty-note">Loading AI predictions…</div>;
  if (error)   return <div className="mgr-empty-note" style={{ color: "var(--tk-status-danger)" }}>Could not load predictions. {error}</div>;
  if (!predictions?.length) return (
    <div className="mgr-empty-note">
      No team members found to predict. Add members to this workspace first.
    </div>
  );

  const at_risk = predictions.filter(p => p.prediction.risk === "high" || p.prediction.burnout_risk);

  return (
    <div className="mgr-predict-panel">
      <div className="tk-eyebrow" style={{ marginBottom: 16 }}>🤖 AI Workload Prediction — 14 days</div>
      {predictions.map(p => {
        const riskColor = p.prediction.risk === "high" ? "var(--tk-status-danger)"
                        : p.prediction.risk === "medium" ? "var(--tk-status-warn)"
                        : "var(--tk-status-ok)";
        const riskBg    = p.prediction.risk === "high" ? "var(--tk-status-danger-bg)"
                        : p.prediction.risk === "medium" ? "var(--tk-status-warn-bg)"
                        : "var(--tk-status-ok-bg)";
        return (
          <div key={p.user_id} className="mgr-predict-row">
            <div className="mgr-predict-name">{p.name}</div>
            <div className="mgr-predict-sparkline">
              {p.prediction.days?.map((d, i) => (
                <div key={i} className="mgr-spark"
                  style={{ height: `${Math.max(2, d.load_percent)}%`, background: riskColor }}
                  title={`${d.date}: ${d.load_percent}%`}
                />
              ))}
            </div>
            <span className="mgr-predict-badge" style={{ background: riskBg, color: riskColor }}>
              {p.prediction.risk === "on_leave" ? "On leave" : `${p.prediction.peak_load}% peak`}
            </span>
            {p.prediction.burnout_risk && <span className="mgr-burnout-tag">🔥 burnout risk</span>}
          </div>
        );
      })}
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
  const [approvals,       setApprovals]       = useState([]);
  const [capRequests,     setCapRequests]     = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [loadError,       setLoadError]       = useState(false);
  const [resolveError,    setResolveError]    = useState("");
  const [rejectId,        setRejectId]        = useState(null);
  const [rejectReason,    setRejectReason]    = useState("");
  const [rejectCapId,     setRejectCapId]     = useState(null);
  const [rejectCapReason, setRejectCapReason] = useState("");
  const [activeTab,       setActiveTab]       = useState("tasks");

  const fetchAll = () => {
    setLoading(true); setLoadError(false);
    Promise.all([
      api.get(`/approvals/pending`),
      api.get(`/capacity/requests?workspace_id=${workspaceId}&status=pending`).catch(() => ({ data: [] })),
    ])
      .then(([taskR, capR]) => {
        setApprovals(taskR.data);
        setCapRequests(capR.data.filter(r => r.status === "pending"));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [workspaceId]); // eslint-disable-line

  const resolve = async (id, action, reason = "") => {
    setResolveError("");
    try {
      await api.put(`/approvals/${id}/${action}`, { rejection_reason: reason });
      setApprovals(prev => prev.filter(a => a.id !== id));
      onRefresh?.();
    } catch (err) {
      setResolveError(err.response?.data?.message || "Action failed. Please try again.");
      setTimeout(() => setResolveError(""), 4000);
    }
  };

  const resolveCapacity = async (id, action, reason = "") => {
    setResolveError("");
    try {
      await api.put(`/capacity/requests/${id}/${action}`, { rejection_reason: reason });
      setCapRequests(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setResolveError(err.response?.data?.message || "Action failed.");
      setTimeout(() => setResolveError(""), 4000);
    }
  };

  if (loading) return <div className="mgr-loading">Loading approvals…</div>;
  if (loadError) return (
    <div className="mgr-empty-note" style={{ color: "var(--tk-status-danger)" }}>
      Could not load approvals.{" "}
      <button onClick={fetchAll} style={{ color: "var(--tk-accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Retry</button>
    </div>
  );

  const totalPending = approvals.length + capRequests.length;

  const tabStyle = (active) => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "1px solid var(--tk-border)",
    background: active ? "var(--tk-accent)" : "transparent",
    color: active ? "#fff" : "var(--tk-text-secondary)",
    fontFamily: "var(--tk-font-body)",
  });

  const badgeStyle = {
    background: "var(--tk-status-danger)", color: "#fff",
    borderRadius: 99, padding: "1px 7px", fontSize: 11, marginLeft: 4,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setActiveTab("tasks")} style={tabStyle(activeTab === "tasks")}>
          📋 Task Approvals {approvals.length > 0 && <span style={badgeStyle}>{approvals.length}</span>}
        </button>
        <button onClick={() => setActiveTab("capacity")} style={tabStyle(activeTab === "capacity")}>
          🏖️ Leave & Travel {capRequests.length > 0 && <span style={badgeStyle}>{capRequests.length}</span>}
        </button>
      </div>

      {totalPending === 0 && <div className="mgr-empty-note">No pending approvals</div>}

      {resolveError && (
        <div style={{ background: "var(--tk-status-danger-bg)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "var(--tk-status-danger)", fontSize: 13 }}>
          {resolveError}
        </div>
      )}

      {activeTab === "tasks" && (
        <div className="mgr-approvals-list">
          {rejectId && (
            <div className="modal-overlay" onClick={() => { setRejectId(null); setRejectReason(""); }}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                  <h2 className="modal-title">Reject assignment</h2>
                  <button className="modal-close" onClick={() => { setRejectId(null); setRejectReason(""); }}>✕</button>
                </div>
                <div style={{ padding: "0 0 16px" }}>
                  <label className="modal-label">Reason (optional)</label>
                  <input className="modal-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Why are you rejecting this?" autoFocus />
                </div>
                <div className="modal-actions">
                  <button className="btn-modal-cancel" onClick={() => { setRejectId(null); setRejectReason(""); }}>Cancel</button>
                  <button className="btn-modal-save" style={{ background: "var(--tk-status-danger)" }} onClick={() => { resolve(rejectId, "reject", rejectReason); setRejectId(null); setRejectReason(""); }}>Reject</button>
                </div>
              </div>
            </div>
          )}
          {approvals.length === 0 && <div className="mgr-empty-note">No pending task approvals</div>}
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
                <button className="mgr-btn-reject" onClick={() => setRejectId(a.id)}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "capacity" && (
        <div className="mgr-approvals-list">
          {rejectCapId && (
            <div className="modal-overlay" onClick={() => { setRejectCapId(null); setRejectCapReason(""); }}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                  <h2 className="modal-title">Reject request</h2>
                  <button className="modal-close" onClick={() => { setRejectCapId(null); setRejectCapReason(""); }}>✕</button>
                </div>
                <div style={{ padding: "0 0 16px" }}>
                  <label className="modal-label">Reason (optional)</label>
                  <input className="modal-input" value={rejectCapReason} onChange={e => setRejectCapReason(e.target.value)} placeholder="Why are you rejecting?" autoFocus />
                </div>
                <div className="modal-actions">
                  <button className="btn-modal-cancel" onClick={() => { setRejectCapId(null); setRejectCapReason(""); }}>Cancel</button>
                  <button className="btn-modal-save" style={{ background: "var(--tk-status-danger)" }} onClick={() => { resolveCapacity(rejectCapId, "reject", rejectCapReason); setRejectCapId(null); setRejectCapReason(""); }}>Reject</button>
                </div>
              </div>
            </div>
          )}
          {capRequests.length === 0 && <div className="mgr-empty-note">No pending leave or travel requests</div>}
          {capRequests.map(cr => (
            <div key={cr.id} className="mgr-approval-card">
              <div className="mgr-approval-info">
                <div className="mgr-approval-task">
                  {cr.request_type === "leave" ? "🏖️ Leave Request" : "✈️ Travel Mode Request"}
                </div>
                <div className="mgr-approval-meta">
                  <strong>{cr.requester_name}</strong>
                  {cr.request_type === "leave" && cr.leave_start && (
                    <span> · {cr.leave_start}{cr.leave_end ? ` → ${cr.leave_end}` : ""}</span>
                  )}
                  {cr.request_type === "travel" && cr.travel_hours && (
                    <span> · {cr.travel_hours}h/day while travelling</span>
                  )}
                  {cr.justification && <span className="mgr-justification">"{cr.justification}"</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 4 }}>
                  Requested {new Date(cr.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="mgr-approval-actions">
                <button className="mgr-btn-approve" onClick={() => resolveCapacity(cr.id, "approve")}>✓ Approve</button>
                <button className="mgr-btn-reject" onClick={() => setRejectCapId(cr.id)}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
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
  if (diff < 60)         return "just now";
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeDueDate(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 86400)      return "Yesterday";
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)} days ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Manager Overview Dashboard View ──────────────────────────────────────────
function ManagerDashView({ workspaceId }) {
  const [tasks,         setTasks]         = useState([]);
  const [activity,      setActivity]      = useState([]);
  const [tasksLoading,  setTasksLoading]  = useState(true);
  const [actLoading,    setActLoading]    = useState(true);
  const [overdueOpen,   setOverdueOpen]   = useState(true);
  const [activityOpen,  setActivityOpen]  = useState(true);
  const [dayGroupsOpen, setDayGroupsOpen] = useState({});
  const [refreshedAt,   setRefreshedAt]   = useState(Date.now());

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return;
    setTasksLoading(true);
    try {
      const r = await api.get(`/tasks/workspace/${workspaceId}`);
      setTasks(r.data); setRefreshedAt(Date.now());
    } catch {} finally { setTasksLoading(false); }
  }, [workspaceId]);

  const loadActivity = useCallback(async () => {
    if (!workspaceId) return;
    setActLoading(true);
    try {
      const r = await api.get(`/audit?workspace_id=${workspaceId}&limit=20`);
      setActivity(r.data);
    } catch {} finally { setActLoading(false); }
  }, [workspaceId]);

  useEffect(() => { loadTasks(); loadActivity(); }, [loadTasks, loadActivity]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const relevant = tasks.filter(t => {
    if (!t.due_date || t.status === "done") return false;
    return new Date(t.due_date) <= endOfWeek;
  });
  const overdue  = relevant.filter(t => new Date(t.due_date) < today);
  const upcoming = relevant.filter(t => new Date(t.due_date) >= today);

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
      <div className="mgr-dash-row" style={isOverdue ? { background: "var(--tk-status-danger-bg)" } : undefined}>
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
        <div className="mgr-dash-cell mgr-dash-due" style={{ color: isOverdue ? "var(--tk-status-danger)" : "var(--tk-text-secondary)", fontWeight: isOverdue ? 700 : 400 }}>
          {isOverdue ? relativeDueDate(task.due_date) : new Date(task.due_date).toLocaleDateString("en-US", { weekday: "short" })}
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
        <span className="mgr-dash-chevron" style={isOverdue ? { color: "var(--tk-status-danger)" } : undefined}>
          {open ? "▼" : "▶"}
        </span>
        <span className="mgr-dash-section-label" style={isOverdue ? { color: "var(--tk-status-danger)" } : undefined}>
          {label}
        </span>
        <span className="mgr-dash-count">{count}</span>
      </div>
    );
  }

  return (
    <div className="mgr-dash-layout">
      <div className="mgr-dash-widget">
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

        <div className="mgr-dash-col-header">
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: 52 }}>Assignee</span>
          <span style={{ width: 84 }}>Due date</span>
          <span style={{ width: 52 }}>Priority</span>
        </div>

        {tasksLoading ? (
          <div className="mgr-loading" style={{ padding: "32px 16px" }}>Loading tasks…</div>
        ) : relevant.length === 0 ? (
          <div className="mgr-dash-empty">
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600, color: "var(--tk-text-primary)" }}>All caught up!</div>
            <div style={{ color: "var(--tk-text-secondary)", marginTop: 4 }}>No overdue or upcoming tasks this week.</div>
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

      <div className="mgr-dash-activity">
        <div className="mgr-dash-activity-header">
          <span>Latest Activity</span>
          <button className="mgr-dash-icon-btn" onClick={() => setActivityOpen(v => !v)}>
            {activityOpen ? "▾" : "▸"}
          </button>
        </div>
        {activityOpen && (
          <div className="mgr-dash-activity-body">
            {actLoading ? (
              <div className="mgr-loading" style={{ padding: "20px 16px" }}>Loading…</div>
            ) : activity.length === 0 ? (
              <div style={{ padding: "20px 16px", color: "var(--tk-text-muted)", fontSize: 13, textAlign: "center" }}>
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
  const [predLoading, setPredLoading] = useState(true);
  const [predError,   setPredError]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [editMember,  setEditMember]  = useState(null);
  const [activeTab,   setActiveTab]   = useState("dashboard");

  const canManage = user?.role === "manager" || user?.role === "super_boss";

  const loadTeam = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    setLoading(true);
    const teamPromise = api.get(`/capacity/team/${workspaceId}`)
      .then(r => setTeam(r.data))
      .catch(err => console.error("team load:", err));

    const predPromise = (async () => {
      setPredLoading(true); setPredError("");
      try {
        const r = await api.get(`/capacity/predict/${workspaceId}?days=14`);
        setPredictions(r.data);
      } catch (err) {
        setPredError(err.response?.data?.message || "Failed to load predictions.");
      } finally { setPredLoading(false); }
    })();

    await Promise.allSettled([teamPromise, predPromise]);
    setLoading(false);
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

  if (loading) return <div className="mgr-loading" style={{ padding: "60px 0", textAlign: "center" }}>Loading team dashboard…</div>;

  const overloaded = team.filter(m => m.status === "overloaded").length;
  const onLeave    = team.filter(m => m.on_leave).length;
  const avgLoad    = team.length
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
      {/* KPI strip */}
      <div className="mgr-stats">
        <div className="mgr-stat">
          <div className="mgr-stat-value">{team.length}</div>
          <div className="mgr-stat-label">Team members</div>
        </div>
        <div className="mgr-stat">
          <div className="mgr-stat-value" style={{ color: overloaded > 0 ? "var(--tk-status-danger)" : "var(--tk-status-ok)" }}>
            {overloaded}
          </div>
          <div className="mgr-stat-label">Overloaded</div>
        </div>
        <div className="mgr-stat">
          <div className="mgr-stat-value" style={{ color: onLeave > 0 ? "var(--tk-status-warn)" : "var(--tk-text-primary)" }}>
            {onLeave}
          </div>
          <div className="mgr-stat-label">On leave</div>
        </div>
        <div className="mgr-stat">
          <div className="mgr-stat-value" style={{ color: avgLoad >= 90 ? "var(--tk-status-danger)" : avgLoad >= 70 ? "var(--tk-status-warn)" : "var(--tk-text-primary)" }}>
            {avgLoad}%
          </div>
          <div className="mgr-stat-label">Avg utilization</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mgr-tabs">
        {TABS.map(t => (
          <button key={t} className={`mgr-tab ${activeTab === t ? "mgr-tab--active" : ""}`} onClick={() => setActiveTab(t)}>
            {TAB_LABELS[t]}
            {t === "approvals" && <span className="mgr-tab-badge" />}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <ManagerOverview
          workspaceId={workspaceId}
          team={team}
          onNavigateToSimulate={() => { if (onNavigate) onNavigate("simulation"); }}
        />
      )}

      {activeTab === "workload" && (
        <div>
          <WorkloadDashboard workspaceId={workspaceId} />
          <div style={{ marginTop: 24 }}>
            <div className="mgr-panel-title" style={{ marginBottom: 12, paddingLeft: 4 }}>⚙️ Team Capacity</div>
            <div className="mgr-team-grid">
              {team.map(m => <MemberCard key={m.user_id} m={m} onEdit={setEditMember} />)}
              {team.length === 0 && <div className="mgr-empty-note">No team members found. Invite people to your workspace.</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "members" && <MembersPanel workspaceId={workspaceId} />}

      {activeTab === "predictions" && (
        <PredictionPanel predictions={predictions} loading={predLoading} error={predError} />
      )}

      {activeTab === "approvals" && (
        <div className="mgr-panel">
          <div className="mgr-panel-title">Pending Approvals</div>
          <ApprovalsPanel workspaceId={workspaceId} onRefresh={loadTeam} />
        </div>
      )}

      {activeTab === "collab" && <CollaborationScore workspaceId={workspaceId} />}

      {activeTab === "channel" && (
        <ChannelView workspaceId={workspaceId} workspaceName={workspaceName} onNavigate={onNavigate} />
      )}

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
