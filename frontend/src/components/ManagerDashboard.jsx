import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";
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

// ── Team Intel — Single Pane of Glass ────────────────────────────────────────
function TeamIntelPanel({ workspaceId, team }) {
  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [expanded,    setExpanded]    = useState({});
  const [filterMember,   setFilterMember]   = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterRisk,     setFilterRisk]     = useState("all");
  const [toast,       setToast]       = useState(null);
  const [reassignTask,setReassignTask]= useState(null);
  const [reassignTo,  setReassignTo]  = useState("");
  const [statusTask,  setStatusTask]  = useState(null);
  const [saving,      setSaving]      = useState(false);
  const timerRef = useRef(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadIntel = useCallback(async (isRefresh = false) => {
    if (!workspaceId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const r = await api.get(`/tasks/team-intel/${workspaceId}`);
      setTasks(r.data);
      setRefreshedAt(Date.now());
    } catch {
      if (!isRefresh) showToast("Failed to load team data", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, showToast]);

  useEffect(() => { loadIntel(); }, [loadIntel]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    timerRef.current = setInterval(() => loadIntel(true), 30000);
    return () => clearInterval(timerRef.current);
  }, [loadIntel]);

  // Real-time: re-fetch when shared workspace tasks change via socket
  useSocket(workspaceId, {
    "task:created": () => loadIntel(true),
    "task:updated": () => loadIntel(true),
    "task:deleted": () => loadIntel(true),
  });

  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);
  const staleThreshold = new Date(now - 3 * 86400000);

  const updateTask = async (taskId, changes) => {
    setSaving(true);
    try {
      await api.put(`/tasks/${taskId}`, changes);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...changes } : t));
      showToast("Updated");
    } catch { showToast("Failed to update", "error"); }
    finally { setSaving(false); }
  };

  // Apply status filter to active tasks list
  const visibleTasks = tasks.filter(t => {
    if (filterStatus === "active")  return t.status !== "done";
    if (filterStatus === "blocked") return t.status === "blocked";
    if (filterStatus === "overdue") return t.due_date && new Date(t.due_date) < today && t.status !== "done";
    if (filterStatus === "today")   return t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) <= todayEnd;
    if (filterStatus === "stale")   return t.updated_at && new Date(t.updated_at) < staleThreshold && t.status !== "done";
    if (filterStatus === "done")    return t.status === "done";
    return true; // "all"
  }).filter(t => {
    if (filterPriority !== "all") return t.priority === filterPriority;
    return true;
  });

  // Enrich each team member with their task breakdown
  const memberData = (team || []).map(m => {
    const mine       = visibleTasks.filter(t => String(t.assigned_user_id) === String(m.user_id));
    const allMine    = tasks.filter(t => String(t.assigned_user_id) === String(m.user_id) && t.status !== "done");
    const overdue    = allMine.filter(t => t.due_date && new Date(t.due_date) < today);
    const blocked    = allMine.filter(t => t.status === "blocked");
    const inProgress = allMine.filter(t => ["inprogress","in_progress"].includes(t.status));
    const inReview   = allMine.filter(t => t.status === "review");
    const todo       = allMine.filter(t => ["todo","pending_approval"].includes(t.status));
    const stale      = allMine.filter(t => t.updated_at && new Date(t.updated_at) < staleThreshold);
    const dueToday   = allMine.filter(t => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) <= todayEnd);
    const dueWeek    = allMine.filter(t => t.due_date && new Date(t.due_date) > todayEnd && new Date(t.due_date) <= endOfWeek);

    let risk = "low";
    if (overdue.length > 0 || m.load_percent >= 100) risk = "high";
    else if (blocked.length > 0 || stale.length >= 2 || m.load_percent >= 80) risk = "medium";

    return { ...m, mine, allMine, overdue, blocked, inProgress, inReview, todo, stale, dueToday, dueWeek, risk };
  });

  // Apply member + risk filter to rows
  let rows = memberData;
  if (filterMember !== "all") rows = rows.filter(m => String(m.user_id) === filterMember);
  if (filterRisk   !== "all") rows = rows.filter(m => m.risk === filterRisk);

  // Unassigned active tasks
  const unassigned = visibleTasks.filter(t => !t.assigned_user_id && t.status !== "done");

  // AI insights
  const highRisk   = memberData.filter(m => m.risk === "high");
  const overloaded = memberData.filter(m => m.load_percent >= 100 && !m.on_leave);
  const available  = memberData.filter(m => m.load_percent < 60 && !m.on_leave && !m.travel_mode);
  const insights   = [];
  if (highRisk.length) {
    const desc = highRisk.map(m => {
      const p = [];
      if (m.load_percent >= 100) p.push(`${m.load_percent}% load`);
      if (m.overdue.length)      p.push(`${m.overdue.length} overdue`);
      if (m.blocked.length)      p.push(`${m.blocked.length} blocked`);
      return `${m.name} (${p.join(", ")})`;
    });
    insights.push({ type: "danger", text: `Needs attention: ${desc.join(" · ")}` });
  }
  if (overloaded.length && available.length)
    insights.push({ type: "warn", text: `Imbalance: ${overloaded.map(m=>m.name).join(", ")} overloaded — ${available.map(m=>m.name).join(", ")} have capacity` });
  if (unassigned.length)
    insights.push({ type: "info", text: `${unassigned.length} unassigned task${unassigned.length !== 1?"s":""} — distribute to available members` });

  // KPIs from full task list (not filtered)
  const activeTasks  = tasks.filter(t => t.status !== "done").length;
  const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== "done").length;
  const blockedCount = tasks.filter(t => t.status === "blocked").length;
  const staleCount   = tasks.filter(t => t.updated_at && new Date(t.updated_at) < staleThreshold && t.status !== "done").length;
  const unassignedCount = tasks.filter(t => !t.assigned_user_id && t.status !== "done").length;
  const highRiskCount   = memberData.filter(m => m.risk === "high").length;

  // Time since last refresh
  const refreshLabel = refreshedAt
    ? (() => {
        const s = Math.floor((now - refreshedAt) / 1000);
        if (s < 10)  return "just now";
        if (s < 60)  return `${s}s ago`;
        return `${Math.floor(s/60)}m ago`;
      })()
    : "—";

  const RISK_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
  const RISK_BG    = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: "rgba(34,197,94,0.1)" };
  const STATUS_COLOR = {
    todo: "#64748b", inprogress: "#3b82f6", in_progress: "#3b82f6",
    review: "#8b5cf6", blocked: "#ef4444", done: "#22c55e", pending_approval: "#f59e0b"
  };
  const STATUS_LABEL = {
    todo: "To Do", inprogress: "In Progress", in_progress: "In Progress",
    review: "In Review", blocked: "Blocked", done: "Done", pending_approval: "Pending Approval"
  };
  const PRIORITY_ICON  = { high: "🔴", medium: "🟡", low: "🟢" };

  const formatDue = (d) => {
    if (!d) return { label: "—", color: "var(--tk-text-muted)" };
    const dt   = new Date(d);
    const diff = Math.round((dt - today) / 86400000);
    if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: "#ef4444", bold: true };
    if (diff === 0) return { label: "Today",    color: "#f59e0b", bold: true };
    if (diff === 1) return { label: "Tomorrow", color: "#f59e0b" };
    if (diff <= 6)  return { label: `${diff}d`,  color: "var(--tk-text-secondary)" };
    return { label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: "var(--tk-text-muted)" };
  };

  const toggleExpand = (uid) =>
    setExpanded(p => ({ ...p, [String(uid)]: p[String(uid)] === false ? true : !p[String(uid)] }));
  const isExpanded = (uid) => expanded[String(uid)] !== false; // default open

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 12, color: "var(--tk-text-muted)", flexDirection: "column" }}>
      <div style={{ width: 32, height: 32, border: "3px solid var(--tk-border)", borderTopColor: "var(--tk-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 14 }}>Loading team intelligence…</span>
    </div>
  );

  return (
    <div style={{ padding: "0 0 48px", position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: toast.type === "error" ? "#ef4444" : "#22c55e", color: "#fff", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", pointerEvents: "none" }}>
          {toast.msg}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { label: "Active Tasks",  value: activeTasks,    color: "var(--tk-text-primary)" },
          { label: "Overdue",       value: overdueCount,   color: overdueCount > 0 ? "#ef4444" : "var(--tk-text-primary)" },
          { label: "Blocked",       value: blockedCount,   color: blockedCount > 0 ? "#ef4444" : "var(--tk-text-primary)" },
          { label: "Stale (3d+)",   value: staleCount,     color: staleCount   > 0 ? "#f59e0b" : "var(--tk-text-primary)" },
          { label: "Unassigned",    value: unassignedCount,color: unassignedCount > 0 ? "#f59e0b" : "var(--tk-text-primary)" },
          { label: "Members at Risk",value: highRiskCount, color: highRiskCount > 0 ? "#ef4444" : "var(--tk-text-primary)" },
        ].map(k => (
          <div key={k.label} style={{ flex: "1 1 90px", background: "var(--tk-surface)", border: "1px solid var(--tk-border)", borderRadius: 10, padding: "10px 14px", textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)", fontWeight: 600, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* AI Insights */}
      {insights.map((ins, i) => {
        const c = { danger: { bg:"rgba(239,68,68,0.1)", border:"rgba(239,68,68,0.3)", text:"#ef4444", icon:"🚨" }, warn: { bg:"rgba(245,158,11,0.1)", border:"rgba(245,158,11,0.3)", text:"#f59e0b", icon:"⚠️" }, info: { bg:"rgba(59,130,246,0.1)", border:"rgba(59,130,246,0.3)", text:"#3b82f6", icon:"💡" } }[ins.type];
        return (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, background:c.bg, border:`1px solid ${c.border}`, borderRadius:8, padding:"9px 14px", marginBottom:8, fontSize:13 }}>
            <span>{c.icon}</span>
            <span style={{ color:c.text, fontWeight:600 }}>{ins.text}</span>
          </div>
        );
      })}

      {/* Toolbar */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        {/* Status filter */}
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={sel}>
          <option value="active">Active Tasks</option>
          <option value="all">All Tasks</option>
          <option value="blocked">Blocked</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="stale">Stale (3d+)</option>
          <option value="done">Completed</option>
        </select>
        {/* Member filter */}
        <select value={filterMember} onChange={e=>setFilterMember(e.target.value)} style={sel}>
          <option value="all">All Members</option>
          {(team||[]).map(m=><option key={m.user_id} value={String(m.user_id)}>{m.name}</option>)}
        </select>
        {/* Priority filter */}
        <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={sel}>
          <option value="all">All Priorities</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🟢 Low</option>
        </select>
        {/* Risk filter */}
        <select value={filterRisk} onChange={e=>setFilterRisk(e.target.value)} style={sel}>
          <option value="all">All Risk Levels</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </select>
        {/* Refresh */}
        <button
          onClick={() => loadIntel(true)}
          disabled={refreshing}
          style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--tk-border)", background: refreshing ? "var(--tk-accent)" : "var(--tk-surface)", color: refreshing ? "#fff" : "var(--tk-text-secondary)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6, transition:"all 0.2s" }}
        >
          <span style={{ display:"inline-block", animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <span style={{ marginLeft:"auto", fontSize:11, color:"var(--tk-text-muted)" }}>
          {rows.length} member{rows.length!==1?"s":""} · refreshed {refreshLabel}
        </span>
      </div>

      {/* Helper styles */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Member rows */}
      {rows.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 0", color:"var(--tk-text-muted)", fontSize:13 }}>
          No team members match the current filters.
        </div>
      ) : rows.map(m => {
        const open = isExpanded(m.user_id);
        const hasAlerts = m.overdue.length > 0 || m.blocked.length > 0;
        const memberTasks = m.mine; // already filtered by filterStatus/filterPriority

        return (
          <div key={m.user_id} style={{ background:"var(--tk-surface)", border:`1px solid ${hasAlerts ? "rgba(239,68,68,0.35)" : "var(--tk-border)"}`, borderRadius:12, overflow:"hidden", marginBottom:8 }}>
            {/* Header row */}
            <div onClick={() => toggleExpand(m.user_id)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", cursor:"pointer", userSelect:"none", borderBottom: open && memberTasks.length > 0 ? "1px solid var(--tk-border)" : "none" }}>
              {/* Avatar */}
              <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--tk-accent)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>
                {(m.name||"?").slice(0,2).toUpperCase()}
              </div>
              {/* Name + role */}
              <div style={{ flex:"0 0 150px" }}>
                <div style={{ fontWeight:700, fontSize:13, color:"var(--tk-text-primary)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.name}</div>
                <div style={{ fontSize:11, color:"var(--tk-text-muted)", marginTop:1 }}>{m.role?.replace(/_/g," ")}</div>
              </div>
              {/* Status chips */}
              <div style={{ display:"flex", gap:5, flex:1, flexWrap:"wrap" }}>
                {m.inProgress.length>0 && <Chip color="#3b82f6" bg="rgba(59,130,246,0.12)">🔵 {m.inProgress.length} in progress</Chip>}
                {m.inReview.length>0   && <Chip color="#8b5cf6" bg="rgba(139,92,246,0.12)">🟣 {m.inReview.length} in review</Chip>}
                {m.todo.length>0       && <Chip color="#64748b" bg="rgba(100,116,139,0.12)">⚪ {m.todo.length} to do</Chip>}
                {m.overdue.length>0    && <Chip color="#ef4444" bg="rgba(239,68,68,0.12)" bold>🔴 {m.overdue.length} overdue</Chip>}
                {m.blocked.length>0    && <Chip color="#ef4444" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.4)" bold>🚫 {m.blocked.length} blocked</Chip>}
                {m.stale.length>0      && <Chip color="#f59e0b" bg="rgba(245,158,11,0.1)">⏸ {m.stale.length} stale</Chip>}
                {m.dueToday.length>0   && <Chip color="#f59e0b" bg="rgba(245,158,11,0.12)">📅 {m.dueToday.length} due today</Chip>}
                {m.on_leave            && <Chip color="#94a3b8" bg="rgba(100,116,139,0.1)">🏖 On leave</Chip>}
                {m.travel_mode         && <Chip color="#94a3b8" bg="rgba(100,116,139,0.1)">✈ Travel</Chip>}
                {m.allMine.length===0 && !m.on_leave && <Chip color="#22c55e" bg="rgba(34,197,94,0.1)">✓ Available</Chip>}
              </div>
              {/* Load + risk + arrow */}
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                <div style={{ width:72 }}>
                  <div style={{ height:5, borderRadius:99, background:"var(--tk-border)", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:99, width:`${Math.min(m.load_percent||0,100)}%`, background: m.load_percent>=100?"#ef4444":m.load_percent>=80?"#f59e0b":"#22c55e" }} />
                  </div>
                  <div style={{ fontSize:10, color:"var(--tk-text-muted)", textAlign:"right", marginTop:2 }}>{m.load_percent??0}%</div>
                </div>
                <span style={{ padding:"2px 8px", borderRadius:99, background:RISK_BG[m.risk], color:RISK_COLOR[m.risk], fontSize:11, fontWeight:700, width:52, textAlign:"center" }}>{m.risk}</span>
                <span style={{ fontSize:14, color:"var(--tk-text-muted)", transform: open?"rotate(90deg)":"rotate(0)", display:"inline-block", transition:"transform 0.15s" }}>›</span>
              </div>
            </div>

            {/* Task table */}
            {open && memberTasks.length > 0 && (
              <>
                {/* Column headers */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 110px 90px 70px 70px 80px 90px 80px 200px", padding:"5px 16px", background:"rgba(0,0,0,0.06)", borderBottom:"1px solid var(--tk-border)" }}>
                  {["Task","Project","Sprint","Status","Priority","Progress","Due","Updated","Actions"].map(h=>(
                    <span key={h} style={{ fontSize:10, fontWeight:700, color:"var(--tk-text-muted)", textTransform:"uppercase", letterSpacing:0.5 }}>{h}</span>
                  ))}
                </div>
                {memberTasks.map(t => {
                  const due   = formatDue(t.due_date);
                  const isOverdue = t.due_date && new Date(t.due_date) < today && t.status !== "done";
                  const isStale   = t.updated_at && new Date(t.updated_at) < staleThreshold;

                  return (
                    <div key={t.id} style={{ display:"grid", gridTemplateColumns:"1fr 110px 90px 70px 70px 80px 90px 80px 200px", padding:"8px 16px", borderBottom:"1px solid var(--tk-border)", background: isOverdue?"rgba(239,68,68,0.04)":"transparent", alignItems:"center" }}>
                      {/* Task name */}
                      <div style={{ paddingRight:8, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:"var(--tk-text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                        {t.blocked_reason && <div style={{ fontSize:11, color:"#ef4444", marginTop:2 }}>⛔ {t.blocked_reason}</div>}
                        {t.comment_count>0 && <span style={{ fontSize:10, color:"var(--tk-text-muted)" }}>💬 {t.comment_count}</span>}
                      </div>
                      {/* Project */}
                      <div style={{ fontSize:11, color:"var(--tk-text-secondary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={t.workspace_name}>{t.workspace_name||"—"}</div>
                      {/* Sprint */}
                      <div style={{ fontSize:11, color:"var(--tk-text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.sprint_name||"—"}</div>
                      {/* Status */}
                      <div>
                        <span style={{ padding:"2px 7px", borderRadius:99, background:`${STATUS_COLOR[t.status]||"#64748b"}20`, color:STATUS_COLOR[t.status]||"#64748b", fontSize:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
                          onClick={() => setStatusTask(t)} title="Click to change status">
                          {STATUS_LABEL[t.status]||t.status}
                        </span>
                      </div>
                      {/* Priority */}
                      <div style={{ fontSize:13 }}>{PRIORITY_ICON[t.priority]||"—"}</div>
                      {/* Progress */}
                      <div>
                        <div style={{ height:5, borderRadius:99, background:"var(--tk-border)", overflow:"hidden", width:"100%" }}>
                          <div style={{ height:"100%", borderRadius:99, width:`${t.progress||0}%`, background:"var(--tk-accent)" }} />
                        </div>
                        <div style={{ fontSize:10, color:"var(--tk-text-muted)", textAlign:"right", marginTop:1 }}>{t.progress||0}%</div>
                      </div>
                      {/* Due */}
                      <div style={{ fontSize:11, color:due.color, fontWeight: due.bold?700:400, whiteSpace:"nowrap" }}>{due.label}</div>
                      {/* Updated */}
                      <div style={{ fontSize:11, color: isStale?"#f59e0b":"var(--tk-text-muted)" }} title={t.updated_at ? new Date(t.updated_at).toLocaleString() : ""}>
                        {t.updated_at ? timeAgoShort(t.updated_at) : "—"}
                      </div>
                      {/* Actions */}
                      <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                        <button onClick={() => { setReassignTask(t); setReassignTo(""); }}
                          style={actionBtn("#64748b")}>↪ Reassign</button>
                        {t.priority !== "high" && (
                          <button onClick={() => updateTask(t.id, { priority:"high" })} disabled={saving}
                            style={actionBtn("#ef4444", "rgba(239,68,68,0.12)")}>🔴</button>
                        )}
                        {t.status !== "blocked" ? (
                          <button onClick={() => updateTask(t.id, { status:"blocked" })} disabled={saving}
                            style={actionBtn("#ef4444", "rgba(239,68,68,0.08)")}>🚫</button>
                        ) : (
                          <button onClick={() => updateTask(t.id, { status:"inprogress" })} disabled={saving}
                            style={actionBtn("#22c55e", "rgba(34,197,94,0.12)")}>▶ Unblock</button>
                        )}
                        {t.status === "inprogress" && (
                          <button onClick={() => updateTask(t.id, { status:"done", progress:100 })} disabled={saving}
                            style={actionBtn("#22c55e", "rgba(34,197,94,0.1)")}>✓</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {open && memberTasks.length === 0 && (
              <div style={{ padding:"14px 16px", color:"var(--tk-text-muted)", fontSize:13 }}>
                {m.allMine.length === 0 ? "No tasks assigned — member is available." : "No tasks match the current filters."}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned tasks */}
      {unassigned.length > 0 && filterMember === "all" && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontWeight:700, fontSize:13, color:"var(--tk-text-primary)", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ background:"rgba(245,158,11,0.15)", color:"#f59e0b", padding:"2px 10px", borderRadius:99, fontSize:11 }}>Unassigned</span>
            <span style={{ color:"var(--tk-text-muted)", fontSize:12 }}>{unassigned.length} task{unassigned.length!==1?"s":""} with no owner</span>
          </div>
          <div style={{ background:"var(--tk-surface)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, overflow:"hidden" }}>
            {unassigned.map((t,i) => (
              <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 16px", borderBottom: i<unassigned.length-1?"1px solid var(--tk-border)":"none" }}>
                <div style={{ flex:1, fontSize:13, fontWeight:500, color:"var(--tk-text-primary)" }}>{t.title}</div>
                <div style={{ fontSize:11, color:"var(--tk-text-muted)" }}>{t.workspace_name||""}</div>
                <span style={{ padding:"2px 7px", borderRadius:99, background:`${STATUS_COLOR[t.status]||"#64748b"}20`, color:STATUS_COLOR[t.status]||"#64748b", fontSize:10, fontWeight:700 }}>{STATUS_LABEL[t.status]||t.status}</span>
                <div style={{ fontSize:13 }}>{PRIORITY_ICON[t.priority]||""}</div>
                <button onClick={() => { setReassignTask(t); setReassignTo(""); }}
                  style={{ padding:"4px 12px", borderRadius:7, border:"1px solid var(--tk-accent)", background:"rgba(59,130,246,0.1)", color:"var(--tk-accent)", fontSize:11, cursor:"pointer", fontWeight:600 }}>
                  Assign →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reassign modal */}
      {reassignTask && (
        <div className="modal-overlay" onClick={() => setReassignTask(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:440 }}>
            <div className="modal-header">
              <h2 className="modal-title">Reassign Task</h2>
              <button className="modal-close" onClick={() => setReassignTask(null)}>✕</button>
            </div>
            <div style={{ padding:"12px 0 4px" }}>
              <div style={{ fontSize:14, fontWeight:600, color:"var(--tk-text-primary)", marginBottom:14 }}>"{reassignTask.title}"</div>
              <label className="modal-label">Assign to</label>
              <select className="modal-input" value={reassignTo} onChange={e => setReassignTo(e.target.value)} autoFocus>
                <option value="">Select member…</option>
                <option value="__unassigned__">Unassigned</option>
                {(team||[]).map(m => (
                  <option key={m.user_id} value={String(m.user_id)}>
                    {m.name} — {m.load_percent??0}% load
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={() => setReassignTask(null)}>Cancel</button>
              <button className="btn-modal-save" disabled={!reassignTo || saving}
                onClick={async () => {
                  const newId = reassignTo === "__unassigned__" ? null : parseInt(reassignTo);
                  await updateTask(reassignTask.id, { assigned_user_id: newId });
                  setReassignTask(null);
                }}>
                {saving ? "Saving…" : "Reassign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status change modal */}
      {statusTask && (
        <div className="modal-overlay" onClick={() => setStatusTask(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <div className="modal-header">
              <h2 className="modal-title">Change Status</h2>
              <button className="modal-close" onClick={() => setStatusTask(null)}>✕</button>
            </div>
            <div style={{ padding:"12px 0 4px" }}>
              <div style={{ fontSize:13, color:"var(--tk-text-secondary)", marginBottom:12 }}>"{statusTask.title}"</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[["todo","To Do"],["inprogress","In Progress"],["review","In Review"],["blocked","Blocked"],["done","Done"]].map(([s,l]) => (
                  <button key={s}
                    onClick={async () => { await updateTask(statusTask.id, { status:s, ...(s==="done"?{progress:100}:{}) }); setStatusTask(null); }}
                    style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${statusTask.status===s?"var(--tk-accent)":"var(--tk-border)"}`, background:statusTask.status===s?"rgba(59,130,246,0.12)":"transparent", color:STATUS_COLOR[s]||"var(--tk-text-primary)", fontSize:13, fontWeight:statusTask.status===s?700:400, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ width:10, height:10, borderRadius:"50%", background:STATUS_COLOR[s]||"#64748b", flexShrink:0 }} />
                    {l}
                    {statusTask.status===s && <span style={{ marginLeft:"auto", fontSize:11, color:"var(--tk-accent)" }}>current</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small chip helper used inside TeamIntelPanel
function Chip({ color, bg, border, bold, children }) {
  return (
    <span style={{ padding:"2px 8px", borderRadius:99, background:bg, color, fontSize:11, fontWeight:bold?700:600, border:border?`1px solid ${border}`:undefined, whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}

// Style helpers
const sel = { padding:"6px 10px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:13, cursor:"pointer" };
const actionBtn = (color, bg) => ({
  padding:"3px 8px", borderRadius:6, border:`1px solid ${color}40`, background:bg||`${color}10`, color, fontSize:10, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap"
});

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
export default function ManagerDashboard({ workspaceId, workspaceName, onNavigate, allTasks = [], onRefreshTasks }) {
  const { user } = useAuth();
  const [team,        setTeam]        = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [predLoading, setPredLoading] = useState(true);
  const [predError,   setPredError]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [editMember,  setEditMember]  = useState(null);
  const [activeTab,   setActiveTab]   = useState("team_intel");

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

  const TABS = ["team_intel", "dashboard", "workload", "members", "predictions", "approvals", "collab", "channel"];
  const TAB_LABELS = {
    team_intel:  "👁 Team Intel",
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

      {activeTab === "team_intel" && (
        <div className="mgr-panel">
          <div className="mgr-panel-title" style={{ marginBottom: 16 }}>👁 Team Intelligence — Single Pane of Glass</div>
          <TeamIntelPanel workspaceId={workspaceId} team={team} />
        </div>
      )}

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
