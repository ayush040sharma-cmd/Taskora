import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../context/AuthContext";
import WorkloadDashboard from "./WorkloadDashboard";
import MembersPanel from "./MembersPanel";
import AnalyticsDashboard from "./AnalyticsDashboard";
import CollaborationScore from "./CollaborationScore";
import ChannelView from "./ChannelView";
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
                    <span> Â· {cr.leave_start}{cr.leave_end ? ` → ${cr.leave_end}` : ""}</span>
                  )}
                  {cr.request_type === "travel" && cr.travel_hours && (
                    <span> Â· {cr.travel_hours}h/day while travelling</span>
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
  const [drawerType,  setDrawerType]  = useState(null);
  const [drawerSearch,setDrawerSearch]= useState("");
  const [selectedTasks,setSelectedTasks]= useState(new Set());
  const [exportOpen,  setExportOpen]  = useState(false);
  const [exportFmt,   setExportFmt]   = useState("csv");
  const [exportScope, setExportScope] = useState("all");
  const [bulkAction,  setBulkAction]  = useState("");
  const [taskDrawer,  setTaskDrawer]  = useState(null);
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
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message || "unknown";
      console.error("Team Intel failed:", detail, err);
      if (!isRefresh) showToast(`Team Intel error: ${detail}`, "error");
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
    if (filterStatus === "stale")   return t.status_changed_at && new Date(t.status_changed_at) < staleThreshold && t.status !== "done";
    if (filterStatus === "done")    return t.status === "done";
    return true; // "all"
  }).filter(t => {
    if (filterPriority !== "all") return t.priority === filterPriority;
    return true;
  });

  // Exclude only the logged-in manager from their own team list
  const { user: currentUser } = useAuth();
  const displayTeam = (team || []).filter(m => String(m.user_id || m.id) !== String(currentUser?.id));

  // Enrich each team member with their task breakdown
  // effective_assignee_id: backend sends this — falls back to workspace_owner_id for unassigned tasks
  const matchesMember = (t, uid) =>
    String(t.assigned_user_id) === String(uid) ||
    String(t.effective_assignee_id) === String(uid) ||
    String(t.workspace_owner_id) === String(uid);

  const memberData = displayTeam.map(m => {
    const mine       = visibleTasks.filter(t => matchesMember(t, m.user_id));
    const allMine    = tasks.filter(t => matchesMember(t, m.user_id) && t.status !== "done");
    const overdue    = allMine.filter(t => t.due_date && new Date(t.due_date) < today);
    const blocked    = allMine.filter(t => t.status === "blocked");
    const inProgress = allMine.filter(t => ["inprogress","in_progress"].includes(t.status));
    const inReview   = allMine.filter(t => t.status === "review");
    const todo       = allMine.filter(t => ["todo","pending_approval"].includes(t.status));
    const stale      = allMine.filter(t => t.status_changed_at && new Date(t.status_changed_at) < staleThreshold);
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

  // Unassigned active tasks — only those with no effective assignee and no workspace owner match
  const memberIdSet = new Set((team || []).map(m => String(m.user_id)));
  const unassigned = visibleTasks.filter(t =>
    !t.assigned_user_id &&
    !memberIdSet.has(String(t.effective_assignee_id)) &&
    !memberIdSet.has(String(t.workspace_owner_id)) &&
    t.status !== "done"
  );

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
    insights.push({ type: "danger", text: `Needs attention: ${desc.join(" Â· ")}` });
  }
  if (overloaded.length && available.length)
    insights.push({ type: "warn", text: `Imbalance: ${overloaded.map(m=>m.name).join(", ")} overloaded — ${available.map(m=>m.name).join(", ")} have capacity` });
  if (unassigned.length)
    insights.push({ type: "info", text: `${unassigned.length} unassigned task${unassigned.length !== 1?"s":""} — distribute to available members` });

  // KPIs from full task list (not filtered)
  const activeTasks  = tasks.filter(t => t.status !== "done").length;
  const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== "done").length;
  const blockedCount = tasks.filter(t => t.status === "blocked").length;
  const staleCount   = tasks.filter(t => t.status_changed_at && new Date(t.status_changed_at) < staleThreshold && t.status !== "done").length;
  const unassignedCount = tasks.filter(t => !t.assigned_user_id && t.status !== "done").length;
  const highRiskCount   = memberData.filter(m => m.risk === "high").length;

  // KPI drill-down datasets (full task list, no status filter)
  const allActive     = tasks.filter(t => t.status !== "done");
  const allOverdue    = tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== "done")
                             .sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
  const allBlocked    = tasks.filter(t => t.status === "blocked");
  const allStale      = tasks.filter(t => t.status_changed_at && new Date(t.status_changed_at) < staleThreshold && t.status !== "done")
                             .sort((a,b) => new Date(a.status_changed_at) - new Date(b.status_changed_at));
  const allUnassigned = tasks.filter(t => !t.assigned_user_id && t.status !== "done");
  const allAtRisk     = memberData.filter(m => m.risk === "high");

  const activeByMember = displayTeam.map(m => ({
    name: m.name, count: allActive.filter(t => matchesMember(t, m.user_id)).length
  })).filter(x => x.count > 0).sort((a,b) => b.count - a.count).slice(0,5);

  const activeByProject = Object.entries(
    allActive.reduce((acc, t) => { const k = t.workspace_name||"Unknown"; acc[k]=(acc[k]||0)+1; return acc; }, {})
  ).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const unassignedByPriority = { high: 0, medium: 0, low: 0 };
  allUnassigned.forEach(t => { if (unassignedByPriority[t.priority]!==undefined) unassignedByPriority[t.priority]++; });

  const suggestedOwner = [...displayTeam].filter(m => !m.on_leave).sort((a,b) => (a.load_percent||0) - (b.load_percent||0))[0];

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

      {/* Interactive KPI strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { key:"active",    label:"Active Tasks",    value:activeTasks,     color: "var(--tk-text-primary)",                                icon:"📋" },
          { key:"overdue",   label:"Overdue",         value:overdueCount,    color: overdueCount   > 0 ? "#ef4444" : "var(--tk-text-primary)", icon:"🔴" },
          { key:"blocked",   label:"Blocked",         value:blockedCount,    color: blockedCount   > 0 ? "#ef4444" : "var(--tk-text-primary)", icon:"🚫" },
          { key:"stale",     label:"Stale (3d+)",     value:staleCount,      color: staleCount     > 0 ? "#f59e0b" : "var(--tk-text-primary)", icon:"⏸" },
          { key:"unassigned",label:"Unassigned",      value:unassignedCount, color: unassignedCount> 0 ? "#f59e0b" : "var(--tk-text-primary)", icon:"👤" },
          { key:"risk",      label:"Members at Risk", value:highRiskCount,   color: highRiskCount  > 0 ? "#ef4444" : "var(--tk-text-primary)", icon:"⚠️" },
        ].map(k => (
          <div key={k.key}
            onClick={() => { setDrawerType(k.key); setDrawerSearch(""); setSelectedTasks(new Set()); }}
            style={{ flex:"1 1 90px", background:"var(--tk-surface)", border:`1px solid ${drawerType===k.key?"var(--tk-accent)":"var(--tk-border)"}`, borderRadius:10, padding:"10px 14px", textAlign:"center", minWidth:80, cursor:"pointer", transition:"all 0.15s", userSelect:"none", boxShadow: drawerType===k.key?"0 0 0 2px var(--tk-accent)30":"none" }}>
            <div style={{ fontSize:11, marginBottom:3 }}>{k.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:"var(--tk-text-muted)", fontWeight:600, marginTop:4 }}>{k.label}</div>
            <div style={{ fontSize:9, color:"var(--tk-accent)", marginTop:3, opacity:0.7 }}>click to explore</div>
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
          {displayTeam.map(m=><option key={m.user_id} value={String(m.user_id)}>{m.name}</option>)}
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
        {/* Export */}
        <button onClick={() => setExportOpen(true)}
          style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-secondary)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          ↓ Export
        </button>
        <span style={{ marginLeft:"auto", fontSize:11, color:"var(--tk-text-muted)" }}>
          {rows.length} member{rows.length!==1?"s":""} Â· refreshed {refreshLabel}
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
              {/* Risk badge + arrow */}
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                <span style={{ padding:"2px 8px", borderRadius:99, background:RISK_BG[m.risk], color:RISK_COLOR[m.risk], fontSize:11, fontWeight:700, width:52, textAlign:"center" }}>{m.risk}</span>
                <span style={{ fontSize:14, color:"var(--tk-text-muted)", transform: open?"rotate(90deg)":"rotate(0)", display:"inline-block", transition:"transform 0.15s" }}>›</span>
              </div>
            </div>

            {/* Task table */}
            {open && memberTasks.length > 0 && (
              <>
                {/* Bulk action bar */}
                {selectedTasks.size > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 16px", background:"rgba(59,130,246,0.08)", borderBottom:"1px solid rgba(59,130,246,0.2)" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"var(--tk-accent)" }}>{selectedTasks.size} selected</span>
                    <select value={bulkAction} onChange={e=>setBulkAction(e.target.value)} style={{ ...sel, padding:"3px 8px", fontSize:12 }}>
                      <option value="">Bulk action…</option>
                      <option value="reassign">Reassign</option>
                      <option value="high">Set High Priority</option>
                      <option value="done">Mark Done</option>
                      <option value="blocked">Mark Blocked</option>
                    </select>
                    <button disabled={!bulkAction} onClick={async () => {
                      const ids = [...selectedTasks];
                      if (bulkAction==="reassign") { const first=tasks.find(t=>t.id===ids[0]); setReassignTask(first); }
                      else { for (const id of ids) await updateTask(id, bulkAction==="high"?{priority:"high"}:bulkAction==="done"?{status:"done",progress:100}:{status:"blocked"}); }
                      setSelectedTasks(new Set()); setBulkAction("");
                    }} style={{ padding:"3px 12px", borderRadius:8, border:"1px solid var(--tk-accent)", background:"var(--tk-accent)", color:"#fff", fontSize:12, cursor:"pointer", fontWeight:600 }}>Apply</button>
                    <button onClick={() => { setSelectedTasks(new Set()); setBulkAction(""); }} style={{ marginLeft:"auto", fontSize:11, color:"var(--tk-text-muted)", background:"none", border:"none", cursor:"pointer" }}>Clear</button>
                  </div>
                )}
                {/* Column headers */}
                <div style={{ display:"grid", gridTemplateColumns:"28px 1fr 90px 70px 100px 180px", padding:"5px 16px", background:"rgba(0,0,0,0.06)", borderBottom:"1px solid var(--tk-border)" }}>
                  <input type="checkbox" checked={memberTasks.every(t=>selectedTasks.has(t.id))}
                    onChange={e => setSelectedTasks(prev => { const n=new Set(prev); if(e.target.checked) memberTasks.forEach(t=>n.add(t.id)); else memberTasks.forEach(t=>n.delete(t.id)); return n; })}
                    style={{ cursor:"pointer" }} />
                  {["Task","Status","Priority","Due","Actions"].map(h=>(
                    <span key={h} style={{ fontSize:10, fontWeight:700, color:"var(--tk-text-muted)", textTransform:"uppercase", letterSpacing:0.5 }}>{h}</span>
                  ))}
                </div>
                {memberTasks.map(t => {
                  const due       = formatDue(t.due_date);
                  const isOverdue = t.due_date && new Date(t.due_date) < today && t.status !== "done";
                  const isSelected = selectedTasks.has(t.id);

                  return (
                    <div key={t.id} style={{ display:"grid", gridTemplateColumns:"28px 1fr 90px 70px 100px 180px", padding:"8px 16px", borderBottom:"1px solid var(--tk-border)", background: isSelected?"rgba(59,130,246,0.07)":isOverdue?"rgba(239,68,68,0.04)":"transparent", alignItems:"center" }}>
                      {/* Checkbox */}
                      <input type="checkbox" checked={isSelected}
                        onChange={e => setSelectedTasks(prev => { const n=new Set(prev); e.target.checked?n.add(t.id):n.delete(t.id); return n; })}
                        onClick={e => e.stopPropagation()} style={{ cursor:"pointer" }} />
                      {/* Task name — click opens drawer */}
                      <div style={{ paddingRight:8, minWidth:0, cursor:"pointer" }} onClick={() => setTaskDrawer(t)}>
                        <div style={{ fontSize:13, fontWeight:500, color:"var(--tk-accent)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3 }}>{t.title}</div>
                        {t.blocked_reason && <div style={{ fontSize:11, color:"#ef4444", marginTop:2 }}>⛔ {t.blocked_reason}</div>}
                        <div style={{ display:"flex", gap:6, marginTop:2 }}>
                          {t.comment_count>0 && <span style={{ fontSize:10, color:"var(--tk-text-muted)" }}>💬 {t.comment_count}</span>}
                          {t.sprint_name && <span style={{ fontSize:10, color:"var(--tk-text-muted)" }}>🏃 {t.sprint_name}</span>}
                          {t.workspace_name && <span style={{ fontSize:10, color:"var(--tk-text-muted)", opacity:0.7 }}>{t.workspace_name}</span>}
                        </div>
                      </div>
                      {/* Status */}
                      <div>
                        <span style={{ padding:"2px 7px", borderRadius:99, background:`${STATUS_COLOR[t.status]||"#64748b"}20`, color:STATUS_COLOR[t.status]||"#64748b", fontSize:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
                          onClick={() => setStatusTask(t)} title="Click to change status">
                          {STATUS_LABEL[t.status]||t.status}
                        </span>
                      </div>
                      {/* Priority */}
                      <div style={{ fontSize:13 }}>{PRIORITY_ICON[t.priority]||"—"}</div>
                      {/* Due */}
                      <div style={{ fontSize:11, color:due.color, fontWeight:due.bold?700:400, whiteSpace:"nowrap" }}>{due.label}</div>
                      {/* Actions */}
                      <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                        <button onClick={() => setTaskDrawer(t)}
                          style={actionBtn("#3b82f6","rgba(59,130,246,0.1)")}>📋 Open</button>
                        <button onClick={() => { setReassignTask(t); setReassignTo(""); }}
                          style={actionBtn("#64748b")}>↪</button>
                        {t.priority !== "high" && (
                          <button onClick={() => updateTask(t.id, { priority:"high" })} disabled={saving}
                            style={actionBtn("#ef4444","rgba(239,68,68,0.12)")}>🔴</button>
                        )}
                        {t.status !== "blocked" ? (
                          <button onClick={() => updateTask(t.id, { status:"blocked" })} disabled={saving}
                            style={actionBtn("#ef4444","rgba(239,68,68,0.08)")}>🚫</button>
                        ) : (
                          <button onClick={() => updateTask(t.id, { status:"inprogress" })} disabled={saving}
                            style={actionBtn("#22c55e","rgba(34,197,94,0.12)")}>▶</button>
                        )}
                        {t.status === "inprogress" && (
                          <button onClick={() => updateTask(t.id, { status:"done", progress:100 })} disabled={saving}
                            style={actionBtn("#22c55e","rgba(34,197,94,0.1)")}>✓</button>
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
                  style={{ padding:"4px 12px", borderRadius:8, border:"1px solid var(--tk-accent)", background:"rgba(59,130,246,0.1)", color:"var(--tk-accent)", fontSize:11, cursor:"pointer", fontWeight:600 }}>
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

      {/* ── KPI Right-side Drawer ── */}
      {drawerType && (() => {
        const drawerTitles = { active:"Active Tasks", overdue:"Overdue Tasks", blocked:"Blocked Tasks", stale:"Stale Tasks (3d+)", unassigned:"Unassigned Tasks", risk:"Members at Risk" };
        const drawerDatasets = { active:allActive, overdue:allOverdue, blocked:allBlocked, stale:allStale, unassigned:allUnassigned };
        const isTaskDrawer = drawerType !== "risk";
        const drawerTasks = isTaskDrawer ? (drawerDatasets[drawerType]||[]).filter(t =>
          !drawerSearch || t.title?.toLowerCase().includes(drawerSearch.toLowerCase()) || t.assignee_name?.toLowerCase().includes(drawerSearch.toLowerCase()) || t.workspace_name?.toLowerCase().includes(drawerSearch.toLowerCase())
        ) : [];
        const drawerMembers = !isTaskDrawer ? allAtRisk.filter(m => !drawerSearch || m.name?.toLowerCase().includes(drawerSearch.toLowerCase())) : [];

        return (
          <>
            {/* Overlay */}
            <div onClick={() => setDrawerType(null)} style={{ position:"fixed", inset:0, zIndex:8000, background:"rgba(0,0,0,0.3)" }} />
            {/* Drawer panel */}
            <div style={{ position:"fixed", top:0, right:0, bottom:0, width:Math.min(680,window.innerWidth-40), zIndex:8001, background:"var(--tk-bg)", boxShadow:"-8px 0 40px rgba(0,0,0,0.25)", display:"flex", flexDirection:"column", animation:"slideInRight 0.2s ease" }}>
              <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

              {/* Drawer header */}
              <div style={{ padding:"18px 20px", borderBottom:"1px solid var(--tk-border)", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:16, color:"var(--tk-text-primary)" }}>{drawerTitles[drawerType]}</div>
                  <div style={{ fontSize:12, color:"var(--tk-text-muted)", marginTop:2 }}>
                    {isTaskDrawer ? `${drawerTasks.length} task${drawerTasks.length!==1?"s":""} Â· click to act` : `${drawerMembers.length} member${drawerMembers.length!==1?"s":""} at risk`}
                  </div>
                </div>
                <button onClick={() => setDrawerType(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--tk-text-muted)", padding:"4px 8px" }}>✕</button>
              </div>

              {/* Search bar */}
              <div style={{ padding:"10px 20px", borderBottom:"1px solid var(--tk-border)" }}>
                <input value={drawerSearch} onChange={e=>setDrawerSearch(e.target.value)} placeholder="Search tasks, members, projects…"
                  style={{ width:"100%", padding:"7px 12px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:13, boxSizing:"border-box" }} />
              </div>

              {/* AI insight banner */}
              {drawerType==="overdue" && allOverdue.length>0 && (
                <div style={{ margin:"10px 20px 0", padding:"9px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, fontSize:12 }}>
                  <span style={{ fontWeight:700, color:"#ef4444" }}>AI Insight: </span>
                  <span style={{ color:"var(--tk-text-secondary)" }}>
                    {allOverdue.length} overdue tasks — top overdue owner: {
                      (() => { const cnt={}; allOverdue.forEach(t=>{const n=t.assignee_name||"Unassigned"; cnt[n]=(cnt[n]||0)+1;}); return Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"; })()
                    }. Consider redistributing to members below 60% load.
                  </span>
                </div>
              )}
              {drawerType==="unassigned" && suggestedOwner && allUnassigned.length>0 && (
                <div style={{ margin:"10px 20px 0", padding:"9px 14px", background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:8, fontSize:12 }}>
                  <span style={{ fontWeight:700, color:"var(--tk-accent)" }}>AI Suggestion: </span>
                  <span style={{ color:"var(--tk-text-secondary)" }}>
                    Assign to <strong>{suggestedOwner.name}</strong> (currently {suggestedOwner.load_percent||0}% load — lowest available capacity).
                  </span>
                  <button onClick={() => { allUnassigned.forEach(t => updateTask(t.id, { assigned_user_id: suggestedOwner.user_id })); setDrawerType(null); showToast(`All unassigned tasks assigned to ${suggestedOwner.name}`); }}
                    style={{ marginLeft:8, padding:"2px 10px", borderRadius:8, border:"1px solid var(--tk-accent)", background:"rgba(59,130,246,0.15)", color:"var(--tk-accent)", fontSize:11, cursor:"pointer", fontWeight:700 }}>Auto-Assign All</button>
                </div>
              )}
              {drawerType==="risk" && allAtRisk.length>0 && (
                <div style={{ margin:"10px 20px 0", padding:"9px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, fontSize:12 }}>
                  <span style={{ fontWeight:700, color:"#ef4444" }}>AI Recommendation: </span>
                  <span style={{ color:"var(--tk-text-secondary)" }}>
                    {allAtRisk.map(m=>m.name).join(", ")} {allAtRisk.length===1?"is":"are"} overloaded. Move high-priority tasks to {available.length>0?available.map(m=>m.name).join(", "):"members with available capacity"}.
                  </span>
                </div>
              )}

              {/* Drawer content */}
              <div style={{ flex:1, overflowY:"auto", padding:"10px 0" }}>
                {isTaskDrawer && drawerTasks.length===0 && (
                  <div style={{ textAlign:"center", padding:"48px 0", color:"var(--tk-text-muted)", fontSize:13 }}>No tasks found.</div>
                )}

                {/* Task drawer rows */}
                {isTaskDrawer && drawerTasks.map(t => {
                  const due = formatDue(t.due_date);
                  const staleDays = t.status_changed_at ? Math.round((now-new Date(t.status_changed_at))/86400000) : null;
                  const overdueDays = t.due_date ? Math.round((today-new Date(t.due_date))/86400000) : null;
                  return (
                    <div key={t.id} style={{ padding:"12px 20px", borderBottom:"1px solid var(--tk-border)", display:"flex", gap:12, alignItems:"flex-start" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13, color:"var(--tk-text-primary)", marginBottom:3 }}>{t.title}</div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", fontSize:11, color:"var(--tk-text-muted)" }}>
                          <span>{t.assignee_name||"Unassigned"}</span>
                          {t.workspace_name && <span>Â· {t.workspace_name}</span>}
                          {t.sprint_name && <span>Â· {t.sprint_name}</span>}
                          {overdueDays!==null && overdueDays>0 && <span style={{ color:"#ef4444", fontWeight:700 }}>Â· {overdueDays}d overdue</span>}
                          {staleDays!==null && staleDays>=3 && drawerType==="stale" && <span style={{ color:"#f59e0b", fontWeight:700 }}>Â· idle {staleDays}d</span>}
                          {t.blocked_reason && <span style={{ color:"#ef4444" }}>Â· {t.blocked_reason}</span>}
                        </div>
                        <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}>
                          <span style={{ padding:"1px 7px", borderRadius:99, background:`${STATUS_COLOR[t.status]||"#64748b"}20`, color:STATUS_COLOR[t.status]||"#64748b", fontSize:10, fontWeight:700 }}>{STATUS_LABEL[t.status]||t.status}</span>
                          <span style={{ fontSize:11, color:due.color, fontWeight:due.bold?700:400 }}>{due.label}</span>
                          <span style={{ fontSize:11 }}>{PRIORITY_ICON[t.priority]||""} {t.priority}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                        <button onClick={() => { setReassignTask(t); setReassignTo(""); }} style={{ ...actionBtn("#64748b"), padding:"4px 10px", fontSize:11 }}>↪ Reassign</button>
                        <button onClick={() => setStatusTask(t)} style={{ ...actionBtn("#3b82f6","rgba(59,130,246,0.1)"), padding:"4px 10px", fontSize:11 }}>✏ Status</button>
                        {t.status==="blocked" && (
                          <button onClick={() => updateTask(t.id, { status:"inprogress" })} style={{ ...actionBtn("#22c55e","rgba(34,197,94,0.1)"), padding:"4px 10px", fontSize:11 }}>▶ Unblock</button>
                        )}
                        {drawerType==="overdue" && (
                          <button onClick={() => updateTask(t.id, { due_date: new Date(Date.now()+7*86400000).toISOString().split("T")[0] })}
                            style={{ ...actionBtn("#f59e0b","rgba(245,158,11,0.1)"), padding:"4px 10px", fontSize:11 }}>+7d</button>
                        )}
                        {(drawerType==="unassigned" || !t.assigned_user_id) && suggestedOwner && (
                          <button onClick={() => updateTask(t.id, { assigned_user_id: suggestedOwner.user_id })}
                            style={{ ...actionBtn("#22c55e","rgba(34,197,94,0.1)"), padding:"4px 10px", fontSize:11 }}>→ {suggestedOwner.name?.split(" ")[0]}</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Risk drawer — member cards */}
                {!isTaskDrawer && drawerMembers.map(m => (
                  <div key={m.user_id} style={{ margin:"10px 20px", background:"var(--tk-surface)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:10, padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>
                        {(m.name||"?").slice(0,2).toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:"var(--tk-text-primary)" }}>{m.name}</div>
                        <div style={{ fontSize:11, color:"var(--tk-text-muted)" }}>{m.role?.replace(/_/g," ")}</div>
                      </div>
                      <span style={{ padding:"3px 10px", borderRadius:99, background:"rgba(239,68,68,0.12)", color:"#ef4444", fontSize:11, fontWeight:700 }}>HIGH RISK</span>
                    </div>
                    {/* Health metrics */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
                      {[
                        { label:"Load",    value:`${m.load_percent||0}%`,   color:m.load_percent>=100?"#ef4444":"#f59e0b" },
                        { label:"Overdue", value:m.overdue.length,           color:m.overdue.length>0?"#ef4444":"#22c55e" },
                        { label:"Blocked", value:m.blocked.length,           color:m.blocked.length>0?"#ef4444":"#22c55e" },
                        { label:"Stale",   value:m.stale.length,             color:m.stale.length>0?"#f59e0b":"#22c55e" },
                      ].map(s=>(
                        <div key={s.label} style={{ textAlign:"center", background:"var(--tk-bg)", borderRadius:8, padding:"8px 4px" }}>
                          <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
                          <div style={{ fontSize:9, color:"var(--tk-text-muted)", fontWeight:600 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {/* AI recommendation */}
                    <div style={{ padding:"8px 10px", background:"rgba(245,158,11,0.08)", borderRadius:7, fontSize:12, color:"var(--tk-text-secondary)", marginBottom:10 }}>
                      <span style={{ fontWeight:700, color:"#f59e0b" }}>AI: </span>
                      {m.load_percent>=100&&m.overdue.length>0 ? `Move ${Math.min(2,m.overdue.length)} overdue tasks to reduce load below 80%.` :
                       m.overdue.length>0 ? `${m.overdue.length} overdue task${m.overdue.length>1?"s":""} — schedule a review or extend deadlines.` :
                       m.blocked.length>0 ? `${m.blocked.length} blocked task${m.blocked.length>1?"s":""} — unblock or reassign to keep sprint on track.` :
                       "Monitor closely — stale tasks indicate possible blockers."}
                    </div>
                    {/* Manager actions */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <button onClick={() => { setFilterMember(String(m.user_id)); setDrawerType(null); }} style={{ ...actionBtn("#64748b"), padding:"5px 12px", fontSize:12 }}>View Tasks</button>
                      {m.overdue.length>0 && available.length>0 && (
                        <button onClick={async () => { for(const t of m.overdue.slice(0,2)) await updateTask(t.id, { assigned_user_id: available[0].user_id }); showToast(`Moved ${Math.min(2,m.overdue.length)} tasks to ${available[0].name}`); }}
                          style={{ ...actionBtn("#f59e0b","rgba(245,158,11,0.1)"), padding:"5px 12px", fontSize:12 }}>↪ Move 2 Tasks</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Drawer footer */}
              <div style={{ padding:"12px 20px", borderTop:"1px solid var(--tk-border)", display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={() => exportData(drawerType, isTaskDrawer?drawerTasks:drawerMembers, "csv")}
                  style={{ padding:"7px 16px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-secondary)", fontSize:13, cursor:"pointer" }}>↓ Export CSV</button>
                <button onClick={() => setDrawerType(null)}
                  style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"var(--tk-accent)", color:"#fff", fontSize:13, cursor:"pointer", fontWeight:600 }}>Done</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Export Modal ── */}
      {exportOpen && (
        <div className="modal-overlay" onClick={() => setExportOpen(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()} style={{ maxWidth:460 }}>
            <div className="modal-header">
              <h2 className="modal-title">Export Team Report</h2>
              <button className="modal-close" onClick={() => setExportOpen(false)}>✕</button>
            </div>
            <div style={{ padding:"14px 0 4px", display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--tk-text-muted)", marginBottom:6 }}>SCOPE</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[["all","Entire Team"],["overdue","Overdue Only"],["blocked","Blocked Only"],["unassigned","Unassigned Only"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setExportScope(v)}
                      style={{ flex:1, padding:"8px 6px", borderRadius:8, border:`1px solid ${exportScope===v?"var(--tk-accent)":"var(--tk-border)"}`, background:exportScope===v?"rgba(59,130,246,0.1)":"transparent", color:exportScope===v?"var(--tk-accent)":"var(--tk-text-secondary)", fontSize:11, cursor:"pointer", fontWeight:exportScope===v?700:400 }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--tk-text-muted)", marginBottom:6 }}>FORMAT</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[["csv","CSV"],["json","JSON"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setExportFmt(v)}
                      style={{ flex:1, padding:"8px 6px", borderRadius:8, border:`1px solid ${exportFmt===v?"var(--tk-accent)":"var(--tk-border)"}`, background:exportFmt===v?"rgba(59,130,246,0.1)":"transparent", color:exportFmt===v?"var(--tk-accent)":"var(--tk-text-secondary)", fontSize:12, cursor:"pointer", fontWeight:exportFmt===v?700:400 }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding:"10px 12px", background:"var(--tk-surface)", borderRadius:8, fontSize:12, color:"var(--tk-text-muted)" }}>
                {exportScope==="all"&&`${tasks.length} total tasks Â· ${memberData.length} members`}
                {exportScope==="overdue"&&`${allOverdue.length} overdue tasks`}
                {exportScope==="blocked"&&`${allBlocked.length} blocked tasks`}
                {exportScope==="unassigned"&&`${allUnassigned.length} unassigned tasks`}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={() => setExportOpen(false)}>Cancel</button>
              <button className="btn-modal-save" onClick={() => {
                const dataset = exportScope==="all"?tasks:exportScope==="overdue"?allOverdue:exportScope==="blocked"?allBlocked:allUnassigned;
                exportData(exportScope, dataset, exportFmt);
                setExportOpen(false);
              }}>Download {exportFmt.toUpperCase()}</button>
            </div>
          </div>
        </div>
      )}

      {/* Task Drawer */}
      {taskDrawer && (
        <TaskIntelDrawer
          task={taskDrawer}
          team={team}
          workspaceId={workspaceId}
          onClose={() => setTaskDrawer(null)}
          onUpdated={() => loadIntel()}
        />
      )}
    </div>
  );
}

function exportData(label, data, fmt) {
  const ts = new Date().toISOString().slice(0,10);
  if (fmt === "json") {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`team-intel-${label}-${ts}.json`; a.click();
    return;
  }
  // CSV
  const cols = ["id","title","status","priority","due_date","assignee_name","workspace_name","sprint_name","blocked_reason","status_changed_at"];
  const header = cols.join(",");
  const rows = data.map(t => cols.map(c => {
    const v = t[c]??""
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(","));
  const blob = new Blob([[header,...rows].join("\n")], { type:"text/csv" });
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`team-intel-${label}-${ts}.csv`; a.click();
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
  padding:"3px 8px", borderRadius:8, border:`1px solid ${color}40`, background:bg||`${color}10`, color, fontSize:10, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap"
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

// ── Task Intel Drawer ─────────────────────────────────────────────────────────
const DRAWER_STATUS_COLOR = {
  todo: "#64748b", inprogress: "#3b82f6", in_progress: "#3b82f6",
  review: "#8b5cf6", blocked: "#ef4444", done: "#22c55e", pending_approval: "#f59e0b"
};
const DRAWER_STATUS_LABEL = {
  todo: "To Do", inprogress: "In Progress", in_progress: "In Progress",
  review: "In Review", blocked: "Blocked", done: "Done", pending_approval: "Pending Approval"
};

function TaskIntelDrawer({ task, team = [], workspaceId, onClose, onUpdated }) {
  const [subtasks,    setSubtasks]    = useState([]);
  const [comments,    setComments]    = useState([]);
  const [activity,    setActivity]    = useState([]);
  const [newSub,      setNewSub]      = useState("");
  const [subAssignTo, setSubAssignTo] = useState("");
  const [subDue,      setSubDue]      = useState("");
  const [newComment,  setNewComment]  = useState("");
  const [saving,      setSaving]      = useState(false);
  const [tab,         setTab]         = useState("overview");
  const [editDesc,    setEditDesc]    = useState(false);
  const [descVal,     setDescVal]     = useState(task.description || "");
  const [dueDateEdit, setDueDateEdit] = useState(false);
  const [newDue,      setNewDue]      = useState(task.due_date ? task.due_date.split("T")[0] : "");
  const [notifSent,   setNotifSent]   = useState(false);

  const loadSubtasks = useCallback(async () => {
    try { const r = await api.get(`/subtasks/${task.id}`); setSubtasks(r.data || []); } catch {}
  }, [task.id]);

  const loadComments = useCallback(async () => {
    try { const r = await api.get(`/tasks/${task.id}/comments`); setComments(r.data || []); } catch {}
  }, [task.id]);

  const loadActivity = useCallback(async () => {
    try { const r = await api.get(`/audit?task_id=${task.id}&limit=20`); setActivity(r.data || []); } catch {}
  }, [task.id]);

  useEffect(() => { loadSubtasks(); loadComments(); loadActivity(); }, [loadSubtasks, loadComments, loadActivity]);

  const addSubtask = async () => {
    if (!newSub.trim()) return;
    setSaving(true);
    try {
      const r = await api.post(`/subtasks/${task.id}`, {
        title: newSub.trim(),
        assigned_to: subAssignTo || task.assigned_user_id || null,
        due_date: subDue || null,
        priority: "medium",
      });
      setSubtasks(prev => [...prev, r.data]);
      setNewSub(""); setSubAssignTo(""); setSubDue("");
      onUpdated?.();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const toggleSubtask = async (s) => {
    try {
      await api.patch(`/subtasks/${s.id}/toggle`);
      setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, done: !x.done } : x));
    } catch {}
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setSaving(true);
    try {
      const r = await api.post(`/tasks/${task.id}/comments`, { content: newComment.trim() });
      setComments(prev => [...prev, r.data]);
      setNewComment("");
    } catch {}
    finally { setSaving(false); }
  };

  const saveDescription = async () => {
    try {
      await api.put(`/tasks/${task.id}`, { description: descVal });
      setEditDesc(false);
      onUpdated?.();
    } catch {}
  };

  const saveDueDate = async () => {
    try {
      await api.put(`/tasks/${task.id}`, { due_date: newDue || null });
      setDueDateEdit(false);
      onUpdated?.();
    } catch {}
  };

  const notifyAssignee = async () => {
    if (!task.assigned_user_id) return;
    try {
      await api.post(`/notifications/send`, { user_id: task.assigned_user_id, message: `Reminder: "${task.title}" needs your attention.` });
      setNotifSent(true);
      setTimeout(() => setNotifSent(false), 3000);
    } catch {}
  };

  const TABS = ["overview","subtasks","comments","activity"];
  const TAB_LABEL = { overview:"Overview", subtasks:`Subtasks (${subtasks.length})`, comments:`Comments (${comments.length})`, activity:"Activity" };

  const due = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = due && due < new Date() && task.status !== "done";

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:8000, background:"rgba(0,0,0,0.4)" }} />
      {/* Drawer */}
      <div style={{ position:"fixed", top:0, right:0, bottom:0, width:520, zIndex:8001, background:"var(--tk-card)", borderLeft:"1px solid var(--tk-border)", display:"flex", flexDirection:"column", boxShadow:"-8px 0 32px rgba(0,0,0,0.3)", animation:"slideInRight 0.2s ease" }}>
        <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--tk-border)", display:"flex", alignItems:"flex-start", gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", gap:8, marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ padding:"2px 8px", borderRadius:99, background:`${DRAWER_STATUS_COLOR[task.status]||"#64748b"}20`, color:DRAWER_STATUS_COLOR[task.status]||"#64748b", fontSize:11, fontWeight:700 }}>
                {DRAWER_STATUS_LABEL[task.status]||task.status}
              </span>
              <span style={{ padding:"2px 8px", borderRadius:99, background: task.priority==="high"?"rgba(239,68,68,0.12)":task.priority==="medium"?"rgba(245,158,11,0.12)":"rgba(100,116,139,0.12)", color: task.priority==="high"?"#ef4444":task.priority==="medium"?"#f59e0b":"#64748b", fontSize:11, fontWeight:700 }}>
                {task.priority||"—"} priority
              </span>
              {task.sprint_name && <span style={{ padding:"2px 8px", borderRadius:99, background:"rgba(139,92,246,0.12)", color:"#8b5cf6", fontSize:11 }}>🏃 {task.sprint_name}</span>}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--tk-text-primary)", lineHeight:1.3 }}>{task.title}</div>
            <div style={{ fontSize:12, color:"var(--tk-text-muted)", marginTop:4 }}>
              {task.workspace_name && <span>📁 {task.workspace_name}</span>}
              {task.assignee_name && <span style={{ marginLeft:10 }}>👤 {task.assignee_name}</span>}
              {due && <span style={{ marginLeft:10, color:isOverdue?"#ef4444":"var(--tk-text-muted)" }}>📅 {due.toLocaleDateString("en-US",{month:"short",day:"numeric"})}{isOverdue?" (overdue)":""}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--tk-text-muted)", flexShrink:0, lineHeight:1 }}>✕</button>
        </div>

        {/* Manager Quick Actions */}
        <div style={{ padding:"10px 20px", borderBottom:"1px solid var(--tk-border)", display:"flex", gap:6, flexWrap:"wrap" }}>
          <button onClick={() => setTab("subtasks")} style={{ ...actionBtn("#8b5cf6","rgba(139,92,246,0.1)"), fontSize:11 }}>+ Subtask</button>
          <button onClick={() => setEditDesc(true)} style={{ ...actionBtn("#3b82f6","rgba(59,130,246,0.1)"), fontSize:11 }}>✏️ Edit Desc</button>
          <button onClick={() => setDueDateEdit(true)} style={{ ...actionBtn("#f59e0b","rgba(245,158,11,0.1)"), fontSize:11 }}>📅 Change Due</button>
          <button onClick={async () => { await api.put(`/tasks/${task.id}`,{priority:"high"}); onUpdated?.(); }}
            style={{ ...actionBtn("#ef4444","rgba(239,68,68,0.1)"), fontSize:11, opacity: task.priority==="high"?0.4:1 }} disabled={task.priority==="high"}>🔴 High Priority</button>
          <button onClick={notifyAssignee} style={{ ...actionBtn("#22c55e","rgba(34,197,94,0.1)"), fontSize:11 }}>
            {notifSent ? "✅ Sent!" : "🔔 Notify"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid var(--tk-border)", padding:"0 20px" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding:"8px 14px", border:"none", background:"none", cursor:"pointer", fontSize:12, fontWeight:700, color: tab===t?"var(--tk-accent)":"var(--tk-text-muted)", borderBottom: tab===t?"2px solid var(--tk-accent)":"2px solid transparent", transition:"all 0.15s" }}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* Description */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--tk-text-muted)", textTransform:"uppercase", marginBottom:6 }}>Description</div>
                {editDesc ? (
                  <div>
                    <textarea value={descVal} onChange={e=>setDescVal(e.target.value)}
                      style={{ width:"100%", minHeight:100, padding:"8px 10px", borderRadius:8, border:"1px solid var(--tk-accent)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
                    <div style={{ display:"flex", gap:8, marginTop:6 }}>
                      <button onClick={saveDescription} style={{ ...actionBtn("#3b82f6","rgba(59,130,246,0.12)") }}>Save</button>
                      <button onClick={()=>setEditDesc(false)} style={{ ...actionBtn("#64748b") }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div onClick={()=>setEditDesc(true)} style={{ fontSize:13, color: descVal?"var(--tk-text-primary)":"var(--tk-text-muted)", cursor:"pointer", padding:"8px 10px", borderRadius:8, border:"1px dashed var(--tk-border)", minHeight:60, lineHeight:1.6 }}>
                    {descVal || "Click to add description…"}
                  </div>
                )}
              </div>

              {/* Due date */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--tk-text-muted)", textTransform:"uppercase", marginBottom:6 }}>Due Date</div>
                {dueDateEdit ? (
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input type="date" value={newDue} onChange={e=>setNewDue(e.target.value)}
                      style={{ padding:"5px 8px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:13 }} />
                    <button onClick={saveDueDate} style={actionBtn("#3b82f6","rgba(59,130,246,0.12)")}>Save</button>
                    <button onClick={()=>setDueDateEdit(false)} style={actionBtn("#64748b")}>Cancel</button>
                  </div>
                ) : (
                  <div onClick={()=>setDueDateEdit(true)} style={{ fontSize:13, color:isOverdue?"#ef4444":"var(--tk-text-primary)", cursor:"pointer" }}>
                    {due ? due.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}) : "No due date set — click to add"}
                    {isOverdue && <span style={{ fontSize:11, marginLeft:8, color:"#ef4444" }}>⚠️ Overdue</span>}
                  </div>
                )}
              </div>

              {/* Acceptance criteria */}
              {task.acceptance_criteria && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--tk-text-muted)", textTransform:"uppercase", marginBottom:6 }}>Acceptance Criteria</div>
                  <div style={{ fontSize:13, color:"var(--tk-text-primary)", lineHeight:1.6, padding:"8px 10px", borderRadius:8, background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.15)" }}>
                    {task.acceptance_criteria}
                  </div>
                </div>
              )}

              {/* Metadata grid */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[
                  ["Owner", task.assignee_name || "Unassigned"],
                  ["Status", DRAWER_STATUS_LABEL[task.status] || task.status],
                  ["Priority", task.priority || "—"],
                  ["Type", task.task_type || task.type || "—"],
                  ["Workspace", task.workspace_name || "—"],
                  ["Sprint", task.sprint_name || "None"],
                  ["Blockers", task.blocking_dep_count > 0 ? `${task.blocking_dep_count} blocking deps` : "None"],
                  ["Comments", task.comment_count || 0],
                ].map(([l,v]) => (
                  <div key={l} style={{ padding:"10px 12px", borderRadius:8, background:"var(--tk-surface)", border:"1px solid var(--tk-border)" }}>
                    <div style={{ fontSize:10, color:"var(--tk-text-muted)", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>{l}</div>
                    <div style={{ fontSize:13, color:"var(--tk-text-primary)", fontWeight:600 }}>{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBTASKS */}
          {tab === "subtasks" && (
            <div>
              {/* Add subtask form */}
              <div style={{ padding:"12px", borderRadius:10, background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.2)", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#8b5cf6", marginBottom:8 }}>+ New Subtask</div>
                <input value={newSub} onChange={e=>setNewSub(e.target.value)}
                  placeholder="Subtask title…"
                  onKeyDown={e => e.key==="Enter" && addSubtask()}
                  style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:13, marginBottom:8, boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <select value={subAssignTo} onChange={e=>setSubAssignTo(e.target.value)}
                    style={{ flex:1, padding:"6px 8px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:12 }}>
                    <option value="">Assign to (default: task owner)</option>
                    {team.map(m=><option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                  <input type="date" value={subDue} onChange={e=>setSubDue(e.target.value)}
                    style={{ padding:"6px 8px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:12 }} />
                </div>
                <button onClick={addSubtask} disabled={saving||!newSub.trim()}
                  style={{ ...actionBtn("#8b5cf6","rgba(139,92,246,0.15)"), opacity:saving||!newSub.trim()?0.5:1 }}>
                  {saving ? "Adding…" : "Add Subtask"}
                </button>
              </div>

              {/* Subtask list */}
              {subtasks.length === 0 ? (
                <div style={{ color:"var(--tk-text-muted)", textAlign:"center", padding:"32px 0", fontSize:13 }}>No subtasks yet</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {subtasks.map(s => (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:"var(--tk-surface)", border:"1px solid var(--tk-border)", opacity:s.done?0.6:1 }}>
                      <input type="checkbox" checked={!!s.done} onChange={()=>toggleSubtask(s)} style={{ cursor:"pointer", flexShrink:0 }} />
                      <span style={{ flex:1, fontSize:13, textDecoration:s.done?"line-through":"none", color:"var(--tk-text-primary)" }}>{s.title}</span>
                      {s.created_by_name && <span style={{ fontSize:10, color:"var(--tk-text-muted)" }}>by {s.created_by_name}</span>}
                    </div>
                  ))}
                  <div style={{ fontSize:11, color:"var(--tk-text-muted)", textAlign:"center", marginTop:4 }}>
                    {subtasks.filter(s=>s.done).length}/{subtasks.length} completed
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COMMENTS */}
          {tab === "comments" && (
            <div>
              <div style={{ marginBottom:16 }}>
                <textarea value={newComment} onChange={e=>setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  style={{ width:"100%", minHeight:72, padding:"8px 10px", borderRadius:8, border:"1px solid var(--tk-border)", background:"var(--tk-surface)", color:"var(--tk-text-primary)", fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
                <button onClick={addComment} disabled={saving||!newComment.trim()}
                  style={{ ...actionBtn("#3b82f6","rgba(59,130,246,0.12)"), marginTop:6, opacity:saving||!newComment.trim()?0.5:1 }}>
                  {saving ? "Posting…" : "Post Comment"}
                </button>
              </div>
              {comments.length === 0 ? (
                <div style={{ color:"var(--tk-text-muted)", textAlign:"center", padding:"32px 0", fontSize:13 }}>No comments yet</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[...comments].reverse().map((c,i) => (
                    <div key={c.id||i} style={{ padding:"10px 12px", borderRadius:8, background:"var(--tk-surface)", border:"1px solid var(--tk-border)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"var(--tk-accent)" }}>{c.author_name||c.user_name||"User"}</span>
                        <span style={{ fontSize:11, color:"var(--tk-text-muted)" }}>{c.created_at ? timeAgoShort(c.created_at) : ""}</span>
                      </div>
                      <div style={{ fontSize:13, color:"var(--tk-text-primary)", lineHeight:1.5 }}>{c.content||c.body||c.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTIVITY */}
          {tab === "activity" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {activity.length === 0 ? (
                <div style={{ color:"var(--tk-text-muted)", textAlign:"center", padding:"32px 0", fontSize:13 }}>No activity recorded</div>
              ) : activity.map((a,i) => (
                <div key={a.id||i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:"1px solid var(--tk-border)" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(59,130,246,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>📝</div>
                  <div>
                    <div style={{ fontSize:12, color:"var(--tk-text-primary)" }}>
                      <strong>{a.actor_name||"System"}</strong>{" "}
                      <span style={{ color:"var(--tk-text-secondary)" }}>{a.action?.replace(/_/g," ")}</span>
                    </div>
                    <div style={{ fontSize:11, color:"var(--tk-text-muted)", marginTop:2 }}>{a.created_at ? timeAgoShort(a.created_at) : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── Workload Activity Feed (moved from ManagerOverview) ───────────────────────
function WorkloadActivityFeed({ tasks, workspaceId }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/audit?workspace_id=${workspaceId}&limit=20`)
      .then(r => setLogs(r.data || [])).catch(() => {});
  }, [workspaceId]);

  const ICON = {
    task_assigned: "📋", task_created: "➕", task_completed: "✅", task_updated: "✏️",
    approval_requested: "⏳", approval_approved: "✅", approval_rejected: "❌",
    capacity_changed: "⚙️", travel_mode_on: "✈️", leave_started: "🏖️",
  };

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.status_changed_at || b.created_at || 0) - new Date(a.status_changed_at || a.created_at || 0))
    .slice(0, 8)
    .map(t => ({
      id: `t-${t.id}`, ts: t.status_changed_at || t.created_at,
      actor: t.assignee_name || "Unassigned",
      action: t.status === "done" ? "completed" : t.status === "blocked" ? "blocked" : "updated",
      taskTitle: t.title,
      icon: t.status === "done" ? "✅" : t.status === "blocked" ? "🚫" : "📝",
    }));

  const logEvents = logs.slice(0, 12).map(l => ({
    id: `l-${l.id}`, ts: l.created_at,
    actor: l.actor_name || "Someone",
    action: l.action?.replace(/_/g, " "),
    taskTitle: l.meta?.task_title,
    icon: ICON[l.action] || "📝",
  }));

  const combined = [...logEvents, ...recentTasks.filter(te => !logEvents.some(le => le.taskTitle === te.taskTitle))]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 16);

  if (!combined.length) return (
    <div style={{ color: "var(--tk-text-muted)", textAlign: "center", padding: "32px 0", fontSize: 13 }}>No recent activity</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {combined.map((e, i) => (
        <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: i < combined.length - 1 ? "1px solid var(--tk-border)" : "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
            {e.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--tk-text-primary)", lineHeight: 1.4 }}>
              <strong>{e.actor}</strong>{" "}
              <span style={{ color: "var(--tk-text-secondary)" }}>{e.action}</span>
              {e.taskTitle && <span style={{ color: "var(--tk-accent)" }}> "{e.taskTitle}"</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--tk-text-muted)", marginTop: 2 }}>{e.ts ? timeAgoShort(e.ts) : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Active Tasks by Member (moved from ManagerOverview) ───────────────────────
// ── Task Distribution by Work Type (new interactive chart) ────────────────────
const WORK_TYPE_COLORS = {
  rfp:           "#f59e0b",
  presentation:  "#ec4899",
  "customer demo": "#06b6d4",
  documentation: "#8b5cf6",
  ai:            "#a855f7",
  development:   "#3b82f6",
  bug:           "#ef4444",
  upgrade:       "#14b8a6",
  poc:           "#10b981",
  meeting:       "#64748b",
  task:          "#475569",
  story:         "#6366f1",
  proposal:      "#f97316",
};

function TaskDistributionChart({ tasks, team, onOpenDrawer }) {
  const [selectedMember,   setSelectedMember]   = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const CHART_HEIGHT = 260;

  const activeTasks = tasks.filter(t => t.status !== "done");

  // Build per-member data
  const memberMap = {};
  activeTasks.forEach(t => {
    const uid  = String(t.effective_assignee_id || t.assigned_user_id || "unassigned");
    const name = t.assignee_name || "Unassigned";
    const cat  = (t.task_type || t.type || "task").toLowerCase();
    if (!memberMap[uid]) memberMap[uid] = { name, uid, cats: {} };
    memberMap[uid].cats[cat] = (memberMap[uid].cats[cat] || 0) + 1;
  });

  // All categories present across visible tasks
  const allCats = [...new Set(activeTasks.map(t =>
    (t.task_type || t.type || "task").toLowerCase()
  ))].sort();

  // Bars: when a member is selected show only that member, else all
  const entries = Object.values(memberMap).filter(m =>
    !selectedMember || m.uid === selectedMember
  );

  // Y-axis max — scale to category max when a type is filtered
  const globalMax = Math.max(1, ...Object.values(memberMap).map(m =>
    selectedCategory
      ? (m.cats[selectedCategory] || 0)
      : Object.values(m.cats).reduce((s, v) => s + v, 0)
  ));
  const yMax  = Math.ceil(globalMax / 5) * 5 || 5;
  const yStep = yMax <= 10 ? 2 : yMax <= 25 ? 5 : 10;
  const yTicks = [];
  for (let v = 0; v <= yMax; v += yStep) yTicks.push(v);

  // Filtered tasks for the drill-down list
  const filteredTasks = activeTasks.filter(t => {
    const matchMember = !selectedMember || String(t.effective_assignee_id || t.assigned_user_id || "unassigned") === selectedMember;
    const matchCat    = !selectedCategory || (t.task_type || t.type || "task").toLowerCase() === selectedCategory;
    return matchMember && matchCat;
  });

  const hasFilter = selectedMember || selectedCategory;
  const clearFilters = () => { setSelectedMember(null); setSelectedCategory(null); };

  const selectedMemberName = selectedMember
    ? (team.find(m => String(m.user_id) === selectedMember)?.name
       || Object.values(memberMap).find(m => m.uid === selectedMember)?.name
       || selectedMember)
    : null;

  return (
    <div style={{ background: "var(--tk-card)", border: "1px solid var(--tk-border)", borderRadius: 12, padding: "20px 24px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--tk-text-primary)" }}>
            Task Distribution by Work Type
          </div>
          <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 2 }}>
            Click a member pill or bar to filter · click a segment or work type chip to filter by type
          </div>
        </div>
        {hasFilter && (
          <button onClick={clearFilters} style={{
            padding: "5px 14px", borderRadius: 7,
            border: "1px solid var(--tk-border)", background: "transparent",
            color: "var(--tk-text-muted)", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Reset
          </button>
        )}
      </div>

      {/* ── Member filter pills ── */}
      {team.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span onClick={() => setSelectedMember(null)} style={{
            padding: "4px 12px", borderRadius: 99, cursor: "pointer", fontSize: 12, fontWeight: 600,
            border: `1px solid ${!selectedMember ? "var(--tk-accent)" : "var(--tk-border)"}`,
            background: !selectedMember ? "rgba(59,130,246,0.12)" : "transparent",
            color: !selectedMember ? "var(--tk-accent)" : "var(--tk-text-secondary)",
            transition: "all 0.15s",
          }}>
            All Members
          </span>
          {team.map(m => {
            const uid = String(m.user_id);
            const active = selectedMember === uid;
            return (
              <span key={uid} onClick={() => setSelectedMember(active ? null : uid)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 99, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: `1px solid ${active ? "var(--tk-accent)" : "var(--tk-border)"}`,
                background: active ? "rgba(59,130,246,0.12)" : "transparent",
                color: active ? "var(--tk-accent)" : "var(--tk-text-secondary)",
                transition: "all 0.15s",
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "var(--tk-accent)" : "#475569",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0,
                }}>
                  {m.name.slice(0, 2).toUpperCase()}
                </span>
                {m.name.split(" ")[0]}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Work type chips ── */}
      {allCats.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {allCats.map(cat => (
            <span key={cat} onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)} style={{
              display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
              padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
              border: `1px solid ${selectedCategory === cat ? WORK_TYPE_COLORS[cat] || "#64748b" : "var(--tk-border)"}`,
              background: selectedCategory === cat ? `${WORK_TYPE_COLORS[cat] || "#64748b"}20` : "transparent",
              color: selectedCategory === cat ? WORK_TYPE_COLORS[cat] || "#64748b" : "var(--tk-text-secondary)",
              transition: "all 0.15s",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: WORK_TYPE_COLORS[cat] || "#64748b", flexShrink: 0 }} />
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* ── Active filter badges ── */}
      {hasFilter && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {selectedMember && (
            <span onClick={() => setSelectedMember(null)} style={{
              padding: "3px 10px", borderRadius: 99,
              background: "rgba(59,130,246,0.15)", color: "var(--tk-accent)",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              👤 {selectedMemberName} ✕
            </span>
          )}
          {selectedCategory && (
            <span onClick={() => setSelectedCategory(null)} style={{
              padding: "3px 10px", borderRadius: 99,
              background: `${WORK_TYPE_COLORS[selectedCategory] || "#64748b"}25`,
              color: WORK_TYPE_COLORS[selectedCategory] || "#64748b",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              {selectedCategory} ✕
            </span>
          )}
        </div>
      )}

      {/* ── Bar Chart ── */}
      {activeTasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--tk-text-muted)", fontSize: 13 }}>
          No active tasks yet
        </div>
      ) : (
        <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>

          {/* Y-axis labels */}
          <div style={{ width: 28, flexShrink: 0, position: "relative", height: CHART_HEIGHT + 28 }}>
            {yTicks.map(v => (
              <div key={v} style={{
                position: "absolute",
                bottom: `${4 + (v / yMax) * CHART_HEIGHT}px`,
                right: 6,
                fontSize: 10,
                color: "var(--tk-text-muted)",
                transform: "translateY(50%)",
                lineHeight: 1,
              }}>
                {v}
              </div>
            ))}
          </div>

          {/* Chart body */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Chart area: gridlines + bars, no labels inside */}
            <div style={{ position: "relative", height: CHART_HEIGHT }}>

              {/* Gridlines */}
              {yTicks.map(v => (
                <div key={v} style={{
                  position: "absolute",
                  bottom: `${(v / yMax) * 100}%`,
                  left: 0, right: 0, height: 1,
                  background: v === 0 ? "var(--tk-border)" : "rgba(148,163,184,0.18)",
                  pointerEvents: "none",
                }} />
              ))}

              {/* Bars — absolutely fills chart area, bottom-aligned */}
              <div style={{
                position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
                display: "flex", alignItems: "flex-end",
                gap: entries.length > 8 ? 4 : entries.length > 5 ? 8 : 14,
                padding: "0 6px",
              }}>
                {entries.map(m => {
                  const total        = Object.values(m.cats).reduce((s, v) => s + v, 0);
                  const isSelected   = selectedMember === m.uid;
                  const visibleCount = selectedCategory ? (m.cats[selectedCategory] || 0) : total;
                  const barH         = Math.max(visibleCount > 0 ? 4 : 0, Math.round((visibleCount / yMax) * (CHART_HEIGHT - 28)));
                  const segments     = Object.entries(m.cats).sort(([, a], [, b]) => b - a);

                  return (
                    <div key={m.uid}
                      onClick={() => setSelectedMember(isSelected ? null : m.uid)}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", minWidth: 0 }}>

                      {/* Count label above bar */}
                      <div style={{
                        fontSize: 11, fontWeight: 700, marginBottom: 3, lineHeight: 1,
                        color: isSelected ? "var(--tk-accent)" : "var(--tk-text-secondary)",
                        minHeight: 14,
                      }}>
                        {visibleCount > 0 ? visibleCount : ""}
                      </div>

                      {/* The bar — single color when category filtered, stacked when not */}
                      <div style={{
                        width: "min(100%, 68px)",
                        height: barH,
                        borderRadius: "5px 5px 0 0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: selectedCategory ? "column" : "column-reverse",
                        outline: isSelected ? "2px solid var(--tk-accent)" : "none",
                        outlineOffset: 2,
                        transition: "height 0.25s ease, outline 0.15s",
                        flexShrink: 0,
                      }}>
                        {selectedCategory ? (
                          visibleCount > 0 ? (
                            <div
                              onClick={e => { e.stopPropagation(); setSelectedCategory(null); }}
                              style={{
                                height: "100%",
                                background: WORK_TYPE_COLORS[selectedCategory] || "#64748b",
                                cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                              {visibleCount > 0 && barH > 18 && (
                                <span style={{ fontSize: 10, color: "#fff", fontWeight: 800, lineHeight: 1 }}>{visibleCount}</span>
                              )}
                            </div>
                          ) : null
                        ) : (
                          segments.map(([cat, count]) => {
                            const catSelected = selectedCategory === cat;
                            const pct = (count / total) * 100;
                            return (
                              <div key={cat}
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedCategory(cat);
                                  setSelectedMember(m.uid);
                                }}
                                title={`${cat}: ${count} task${count !== 1 ? "s" : ""}`}
                                style={{
                                  height: `${pct}%`,
                                  minHeight: 4,
                                  background: WORK_TYPE_COLORS[cat] || "#64748b",
                                  cursor: "pointer",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                {pct > 20 && (
                                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 800, lineHeight: 1 }}>{count}</span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X-axis baseline */}
            <div style={{ height: 1, background: "var(--tk-border)", margin: "0 6px" }} />

            {/* Member name labels row — separate from chart area */}
            <div style={{
              display: "flex",
              gap: entries.length > 8 ? 4 : entries.length > 5 ? 8 : 14,
              padding: "6px 6px 0",
            }}>
              {entries.map(m => {
                const isSelected = selectedMember === m.uid;
                return (
                  <div key={m.uid}
                    onClick={() => setSelectedMember(selectedMember === m.uid ? null : m.uid)}
                    style={{
                      flex: 1, textAlign: "center", fontSize: 11, cursor: "pointer",
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? "var(--tk-accent)" : "var(--tk-text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                    {m.name.split(" ")[0]}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      {allCats.length > 0 && activeTasks.length > 0 && (
        <div style={{
          display: "flex", gap: 14, flexWrap: "wrap",
          marginTop: 14, paddingTop: 12,
          borderTop: "1px solid var(--tk-border)",
        }}>
          {allCats.map(cat => {
            const countInFilter = filteredTasks.filter(t =>
              (t.task_type || t.type || "task").toLowerCase() === cat
            ).length;
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: WORK_TYPE_COLORS[cat] || "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--tk-text-secondary)" }}>{cat}</span>
                {hasFilter && countInFilter > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: WORK_TYPE_COLORS[cat] || "#64748b" }}>
                    ({countInFilter})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Filtered task drill-down ── */}
      {hasFilter && filteredTasks.length > 0 && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--tk-border)", paddingTop: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--tk-text-muted)",
            marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            {filteredTasks.length} Matching Task{filteredTasks.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredTasks.slice(0, 15).map(t => (
              <div key={t.id}
                onClick={() => onOpenDrawer && onOpenDrawer(t)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 12px", borderRadius: 8,
                  background: "var(--tk-surface)", border: "1px solid var(--tk-border)",
                  cursor: onOpenDrawer ? "pointer" : "default",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => { if (onOpenDrawer) e.currentTarget.style.background = "rgba(59,130,246,0.06)"; }}
                onMouseLeave={e => { if (onOpenDrawer) e.currentTarget.style.background = "var(--tk-surface)"; }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: WORK_TYPE_COLORS[(t.task_type||t.type||"task").toLowerCase()] || "#64748b",
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, flexShrink: 0,
                  background: `${DRAWER_STATUS_COLOR[t.status] || "#64748b"}20`,
                  color: DRAWER_STATUS_COLOR[t.status] || "#64748b",
                }}>
                  {DRAWER_STATUS_LABEL[t.status] || t.status}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--tk-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                </span>
                <span style={{ fontSize: 11, color: "var(--tk-text-muted)", flexShrink: 0 }}>
                  {t.assignee_name || "Unassigned"}
                </span>
                {t.priority && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    color: t.priority === "high" ? "#ef4444" : t.priority === "medium" ? "#f59e0b" : "#22c55e",
                  }}>
                    {t.priority}
                  </span>
                )}
                {onOpenDrawer && <span style={{ fontSize: 11, color: "var(--tk-text-muted)", flexShrink: 0 }}>→</span>}
              </div>
            ))}
            {filteredTasks.length > 15 && (
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--tk-text-muted)", padding: "6px 0" }}>
                +{filteredTasks.length - 15} more — narrow your filters
              </div>
            )}
          </div>
        </div>
      )}

      {hasFilter && filteredTasks.length === 0 && (
        <div style={{ marginTop: 16, textAlign: "center", color: "var(--tk-text-muted)", fontSize: 13, padding: "12px 0" }}>
          No tasks match the current filters
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ManagerDashboard({ workspaceId, workspaceName, onNavigate, allTasks = [], onRefreshTasks }) {
  const { user } = useAuth();
  const [team,       setTeam]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState("team_intel");
  const [teamTasks,  setTeamTasks]  = useState([]);
  const [workloadDrawer, setWorkloadDrawer] = useState(null);

  const canManage = ["manager","super_boss","super_admin","admin"].includes(user?.role);

  const loadTeam = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    setLoading(true);
    try {
      const r = await api.get(`/capacity/team/${workspaceId}`);
      setTeam(r.data);
    } catch (err) {
      console.error("team load:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, canManage]);

  const loadTeamTasks = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    try {
      const r = await api.get(`/tasks/team-intel/${workspaceId}`);
      setTeamTasks(r.data || []);
    } catch {}
  }, [workspaceId, canManage]);

  useEffect(() => { loadTeam(); }, [loadTeam]);
  useEffect(() => { loadTeamTasks(); }, [loadTeamTasks]);

  useSocket(workspaceId, {
    "task:created": loadTeamTasks,
    "task:updated": loadTeamTasks,
    "task:deleted": loadTeamTasks,
  });

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

  const TABS = ["team_intel", "workload", "members", "approvals", "collab", "channel"];
  const TAB_LABELS = {
    team_intel: "👁 Team Intel",
    workload:   "👥 Workload & Capacity",
    members:    "👤 Members",
    approvals:  "✅ Approvals",
    collab:     "🤝 Collaboration",
    channel:    "💬 Channel",
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
          <div className="mgr-panel-title" style={{ marginBottom: 16 }}>👁 Team Intelligence — Single Pane of GlassTeam Intelligence — Single Pane of Glass</div>
          <TeamIntelPanel workspaceId={workspaceId} team={team} />
        </div>
      )}

        {activeTab === "workload" && (
        <div>
          {/* Header with Rebalance Work button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "0 2px" }}>
            <div className="mgr-panel-title" style={{ margin: 0 }}>👥 Workload & Capacity</div>
            <button
              className="mgr-action-btn"
              style={{ background: "var(--tk-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
              onClick={() => onNavigate && onNavigate("simulation")}
            >
              ⚖️ Rebalance Work
            </button>
          </div>

          {/* Task Distribution chart */}
          <TaskDistributionChart tasks={teamTasks} team={team} onOpenDrawer={setWorkloadDrawer} />

          {/* Workload per-member cards */}
          <div style={{ marginTop: 28 }}>
            <WorkloadDashboard workspaceId={workspaceId} teamTasks={teamTasks} teamMembers={team} />
          </div>

{/* Recent activity feed */}
          <div style={{ marginTop: 28 }}>
            <div className="mgr-panel" style={{ padding: 20 }}>
              <div className="mgr-panel-title" style={{ marginBottom: 12 }}>📋 Recent Activity</div>
              <WorkloadActivityFeed tasks={teamTasks} workspaceId={workspaceId} />
            </div>
          </div>
        </div>
      )}

      {activeTab === "members" && <MembersPanel workspaceId={workspaceId} />}

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

      {workloadDrawer && (
        <TaskIntelDrawer
          task={workloadDrawer}
          team={team}
          workspaceId={workspaceId}
          onClose={() => setWorkloadDrawer(null)}
          onUpdated={loadTeamTasks}
        />
      )}

    </div>
  );
}
