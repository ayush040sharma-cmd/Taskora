/**
 * TaskDetailModal — Phase 1 upgrade
 * Tabs: Details | Subtasks | Effort Log | Comments
 */

import { useState, useEffect, useRef } from "react";
import { LuX, LuClipboardList, LuBug, LuBookOpen, LuFileStack, LuFilePenLine, LuPresentation, LuArrowUp, LuFlaskConical } from "react-icons/lu";
import api from "../api/api";
import { getWorkspacePref } from "../utils/workspacePrefs";

const TYPE_META = {
  task:         { label: "Task",         icon: LuClipboardList },
  bug:          { label: "Bug",          icon: LuBug },
  story:        { label: "Story",        icon: LuBookOpen },
  rfp:          { label: "RFP",          icon: LuFileStack },
  proposal:     { label: "Proposal",     icon: LuFilePenLine },
  presentation: { label: "Presentation", icon: LuPresentation },
  upgrade:      { label: "Upgrade",      icon: LuArrowUp },
  poc:          { label: "POC",          icon: LuFlaskConical },
};

const PRIORITIES = ["low", "medium", "high"];
const STATUSES   = [
  { value: "todo",       label: "To Do"       },
  { value: "inprogress", label: "In Progress"  },
  { value: "review",     label: "In Review"    },
  { value: "blocked",    label: "Blocked"      },
  { value: "done",       label: "Done"         },
];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(d) {
  return d ? new Date(d).toISOString().split("T")[0] : "";
}

const IconX = () => <LuX size={16} />;

// ── Subtasks Tab ──────────────────────────────────────────────
function SubtasksTab({ taskId }) {
  const [subtasks, setSubtasks] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [adding,   setAdding]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get(`/subtasks/${taskId}`)
      .then(r => setSubtasks(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  const addSubtask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const r = await api.post(`/subtasks/${taskId}`, { title: newTitle.trim() });
      setSubtasks(p => [...p, r.data]);
      setNewTitle("");
    } catch {} finally { setAdding(false); }
  };

  const toggle = async (id) => {
    const original = [...subtasks];
    setSubtasks(p => p.map(s => s.id === id ? { ...s, done: !s.done } : s));
    try {
      const r = await api.patch(`/subtasks/${id}/toggle`);
      setSubtasks(p => p.map(s => s.id === id ? r.data : s));
    } catch { setSubtasks(original); }
  };

  const deleteSubtask = async (id) => {
    setSubtasks(p => p.filter(s => s.id !== id));
    try { await api.delete(`/subtasks/${id}`); } catch {
      // re-fetch on error
      api.get(`/subtasks/${taskId}`).then(r => setSubtasks(r.data)).catch(() => {});
    }
  };

  const doneCount  = subtasks.filter(s => s.done).length;
  const totalCount = subtasks.length;
  const pct        = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  if (loading) return <div className="td-subtasks-loading">Loading…</div>;

  return (
    <div className="td-subtasks">
      {/* Progress header */}
      {totalCount > 0 && (
        <div className="td-sub-progress">
          <div className="td-sub-progress-label">
            <span>{doneCount} / {totalCount} completed</span>
            <span className="td-sub-pct">{pct}%</span>
          </div>
          <div className="td-sub-progress-bar">
            <div className="td-sub-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Subtask list */}
      <div className="td-sub-list">
        {subtasks.length === 0 && (
          <div className="td-sub-empty">No subtasks yet. Break this task into smaller steps.</div>
        )}
        {subtasks.map(s => (
          <div key={s.id} className={`td-sub-item ${s.done ? "td-sub-item--done" : ""}`}>
            <button
              className={`td-sub-check ${s.done ? "td-sub-check--done" : ""}`}
              onClick={() => toggle(s.id)}
              title={s.done ? "Mark incomplete" : "Mark complete"}
            >
              {s.done ? "✓" : ""}
            </button>
            <span className="td-sub-title">{s.title}</span>
            <button className="td-sub-delete" onClick={() => deleteSubtask(s.id)} title="Remove">✕</button>
          </div>
        ))}
      </div>

      {/* Add new subtask */}
      <div className="td-sub-add">
        <input
          ref={inputRef}
          className="td-sub-input"
          placeholder="Add a subtask…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addSubtask(); }}
        />
        <button
          className="td-sub-add-btn"
          onClick={addSubtask}
          disabled={adding || !newTitle.trim()}
        >
          {adding ? "…" : "+ Add"}
        </button>
      </div>
    </div>
  );
}

// ── Effort Log Tab ────────────────────────────────────────────
function EffortTab({ taskId, currentUser }) {
  const [logs,    setLogs]    = useState([]);
  const [totals,  setTotals]  = useState({ total: 0, mine: 0 });
  const [form,    setForm]    = useState({ hours: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get(`/effort/${taskId}`)
      .then(r => { setLogs(r.data.logs); setTotals(r.data.totals); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [taskId]); // eslint-disable-line

  const submit = async () => {
    if (!form.hours || Number(form.hours) <= 0) return;
    setPosting(true);
    try {
      await api.post("/effort", {
        task_id: taskId,
        logged_hours: Number(form.hours),
        log_date: form.date,
        notes: form.notes || null,
      });
      setForm(f => ({ ...f, hours: "", notes: "" }));
      load();
    } catch {} finally { setPosting(false); }
  };

  const deleteLog = async (id) => {
    setLogs(p => p.filter(l => l.id !== id));
    try { await api.delete(`/effort/${id}`); load(); } catch {}
  };

  if (loading) return <div className="td-subtasks-loading">Loading…</div>;

  return (
    <div className="td-effort">
      {/* Totals strip */}
      <div className="td-effort-totals">
        <div className="td-effort-stat">
          <span className="td-effort-stat-val">{totals.total.toFixed(1)}h</span>
          <span className="td-effort-stat-lbl">Total logged</span>
        </div>
        <div className="td-effort-stat">
          <span className="td-effort-stat-val">{totals.mine.toFixed(1)}h</span>
          <span className="td-effort-stat-lbl">My contribution</span>
        </div>
        <div className="td-effort-stat">
          <span className="td-effort-stat-val">{logs.length}</span>
          <span className="td-effort-stat-lbl">Entries</span>
        </div>
      </div>

      {/* Log form */}
      <div className="td-effort-form">
        <div className="td-effort-form-row">
          <input
            className="modal-input td-effort-hours-input"
            type="number" min="0.25" max="24" step="0.25"
            placeholder="Hours"
            value={form.hours}
            onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
          />
          <input
            className="modal-input"
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
        </div>
        <input
          className="modal-input"
          style={{ marginTop: 6 }}
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
        />
        <button
          className="td-effort-log-btn"
          onClick={submit}
          disabled={posting || !form.hours}
        >
          {posting ? "Logging…" : "⏱ Log hours"}
        </button>
      </div>

      {/* Log list */}
      <div className="td-effort-list">
        {logs.length === 0 && <div className="td-sub-empty">No hours logged yet.</div>}
        {logs.map(l => (
          <div key={l.id} className="td-effort-row">
            <div className="td-effort-avatar">{(l.user_name || "?").slice(0, 2).toUpperCase()}</div>
            <div className="td-effort-info">
              <div className="td-effort-meta">
                <span className="td-effort-user">{l.user_name}</span>
                <span className="td-effort-date">{l.log_date ? new Date(l.log_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
              </div>
              {l.notes && <div className="td-effort-notes">{l.notes}</div>}
            </div>
            <div className="td-effort-hours">{Number(l.logged_hours).toFixed(1)}h</div>
            {l.user_id === currentUser?.id && (
              <button className="td-sub-delete" onClick={() => deleteLog(l.id)} title="Delete">✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Comment Item ──────────────────────────────────────────────
function CommentItem({ comment, currentUserId, onDelete }) {
  return (
    <div className="td-comment">
      <div className="td-comment-avatar">
        {(comment.author_name || "?").slice(0, 2).toUpperCase()}
      </div>
      <div className="td-comment-body">
        <div className="td-comment-header">
          <span className="td-comment-author">{comment.author_name}</span>
          <span className="td-comment-time">{timeAgo(comment.created_at)}</span>
          {comment.user_id === currentUserId && (
            <button className="td-comment-delete" onClick={() => onDelete(comment.id)} title="Delete">✕</button>
          )}
        </div>
        <div className="td-comment-content">{comment.content}</div>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────
export default function TaskDetailModal({ task: initialTask, onClose, onUpdate, currentUser, workspaceId }) {
  const [task, setTask]             = useState(initialTask);
  const [comments, setComments]     = useState([]);
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving]         = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [activeTab, setActiveTab]   = useState("details");
  const [editTitle, setEditTitle]   = useState(false);
  const [titleVal, setTitleVal]     = useState(initialTask.title);
  const [descVal, setDescVal]       = useState(initialTask.description || "");
  const [editDesc, setEditDesc]     = useState(false);
  const [userSearch, setUserSearch] = useState(initialTask.assignee_name || "");
  const [userResults, setUserResults] = useState([]);
  const [toast, setToast]           = useState(null);
  const [teams, setTeams]           = useState([]);
  const commentBoxRef               = useRef(null);
  const saveAbortRef                = useRef(null);

  useEffect(() => {
    const wsId = workspaceId || initialTask.workspace_id;
    if (!wsId) return;
    api.get(`/teams?workspace_id=${wsId}`).then(r => setTeams(r.data)).catch(() => {});
  }, [workspaceId, initialTask.workspace_id]);

  useEffect(() => {
    if (activeTab === "comments") loadComments();
  }, [activeTab]); // eslint-disable-line

  const loadComments = async () => {
    try {
      const res = await api.get(`/comments/${task.id}`);
      setComments(res.data);
    } catch {}
  };

  const showMsg = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const saveField = async (field, value) => {
    // Cancel any in-flight save to prevent out-of-order response overwrites
    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    setSaving(true);
    try {
      const res = await api.put(`/tasks/${task.id}`, { [field]: value }, { signal: controller.signal });
      setTask(prev => ({
        ...prev,
        [field]: res.data[field],
        completed_at: res.data.completed_at,
        updated_at:   res.data.updated_at,
      }));
      onUpdate && onUpdate({ ...task, [field]: value });
      showMsg("Saved");
    } catch (err) {
      if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
        showMsg("Failed to save", "error");
      }
    } finally { setSaving(false); }
  };

  const saveTitle = async () => {
    if (!titleVal.trim()) return;
    setEditTitle(false);
    await saveField("title", titleVal.trim());
  };

  const saveDesc = async () => {
    setEditDesc(false);
    await saveField("description", descVal);
  };

  useEffect(() => {
    if (!userSearch || userSearch === task.assignee_name) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const wsId = workspaceId || initialTask.workspace_id;
        const res = await api.get(`/workload/users?q=${encodeURIComponent(userSearch)}${wsId ? `&workspace_id=${wsId}` : ""}`);
        setUserResults(res.data);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]); // eslint-disable-line

  const assignUser = async (user) => {
    setUserSearch(user.name);
    setUserResults([]);
    await saveField("assigned_user_id", user.id);
    setTask(prev => ({ ...prev, assignee_name: user.name, assignee_email: user.email }));
  };

  const removeAssignee = async () => {
    setUserSearch("");
    await saveField("assigned_user_id", null);
    setTask(prev => ({ ...prev, assignee_name: null, assigned_user_id: null }));
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const res = await api.post(`/comments/${task.id}`, { content: newComment.trim() });
      setComments(prev => [...prev, res.data]);
      setNewComment("");
      setTask(prev => ({ ...prev, comment_count: (prev.comment_count || 0) + 1 }));
    } catch { showMsg("Failed to post comment", "error"); }
    finally  { setPostingComment(false); }
  };

  const deleteComment = async (commentId) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments(prev => prev.filter(c => c.id !== commentId));
      setTask(prev => ({ ...prev, comment_count: Math.max(0, (prev.comment_count || 1) - 1) }));
    } catch { showMsg("Failed to delete", "error"); }
  };

  useEffect(() => {
    if (!editTitle) setTitleVal(task.title);
  }, [task.title]); // eslint-disable-line

  const overdueFlag = task.due_date && new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const TABS = [
    { id: "details",   label: "Details" },
    { id: "subtasks",  label: "Subtasks" },
    { id: "effort",    label: "⏱ Effort" },
    { id: "comments",  label: `💬 ${task.comment_count ? `(${task.comment_count})` : "Comments"}` },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal td-modal" style={{ maxWidth: 720 }}>

        {/* ── Header ── */}
        <div className="td-header">
          <div className="td-header-left">
            <span className="td-type-icon">
              {(() => { const TypeIcon = TYPE_META[task.type]?.icon || LuClipboardList; return <TypeIcon size={14} />; })()}
            </span>
            <span
              style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.03em", marginRight: 6, flexShrink: 0 }}
              title="Task ID prefix is configurable in Settings → Workspace Preferences"
            >
              {getWorkspacePref(workspaceId || task.workspace_id, "task-prefix")}-{task.id}
            </span>
            {editTitle ? (
              <input
                className="td-title-input"
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditTitle(false); }}
                autoFocus
              />
            ) : (
              <h2 className="td-title" onClick={() => setEditTitle(true)} title="Click to edit">
                {task.title}
              </h2>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>

        {/* ── Tabs ── */}
        <div className="td-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`td-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Details tab ── */}
        {activeTab === "details" && (
          <div className="td-body">
            <div className="td-two-col">
              {/* Left: description + progress */}
              <div className="td-col-main">
                <div className="td-section-label">Description</div>
                {editDesc ? (
                  <div className="td-desc-edit">
                    <textarea
                      className="td-desc-textarea"
                      value={descVal}
                      onChange={e => setDescVal(e.target.value)}
                      autoFocus
                      rows={5}
                      placeholder="Add a description…"
                    />
                    <div className="td-desc-actions">
                      <button className="btn-modal-submit" onClick={saveDesc}>Save</button>
                      <button className="btn-modal-cancel" onClick={() => { setEditDesc(false); setDescVal(task.description || ""); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`td-desc-display ${!task.description ? "td-desc-empty" : ""}`}
                    onClick={() => setEditDesc(true)}
                  >
                    {task.description || "Click to add a description…"}
                  </div>
                )}

                {/* Progress */}
                <div className="td-section-label" style={{ marginTop: 20 }}>Progress — {task.progress || 0}%</div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={task.progress || 0}
                  className="task-progress-slider"
                  style={{ width: "100%" }}
                  onChange={e => setTask(prev => ({ ...prev, progress: Number(e.target.value) }))}
                  onMouseUp={e => saveField("progress", Number(e.target.value))}
                  onTouchEnd={e => saveField("progress", Number(e.target.value))}
                />
                <div className="td-progress-bar">
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: `${task.progress || 0}%`,
                    background: task.progress >= 70 ? "#00875a" : task.progress >= 30 ? "#ff8b00" : "#de350b",
                    transition: "width 0.3s",
                  }} />
                </div>

                {/* Estimated vs Actual hours */}
                <div className="td-hours-row">
                  <div className="td-hours-item">
                    <span className="td-hours-label">Est. hours</span>
                    <input
                      type="number" min="0" step="0.5" className="td-hours-input"
                      value={task.estimated_hours || ""}
                      placeholder="—"
                      onChange={e => setTask(p => ({ ...p, estimated_hours: e.target.value }))}
                      onBlur={e => e.target.value && saveField("estimated_hours", Number(e.target.value))}
                    />
                  </div>
                  <div className="td-hours-item">
                    <span className="td-hours-label">Actual hours</span>
                    <span className="td-hours-actual">{task.actual_hours ? `${Number(task.actual_hours).toFixed(1)}h` : "—"}</span>
                  </div>
                </div>
              </div>

              {/* Right: metadata */}
              <div className="td-col-meta">
                {/* Status */}
                <div className="td-meta-row">
                  <span className="td-meta-label">Status</span>
                  <select
                    className="td-meta-select"
                    value={task.status}
                    onChange={e => { setTask(p => ({ ...p, status: e.target.value })); saveField("status", e.target.value); }}
                  >
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                {/* Priority */}
                <div className="td-meta-row">
                  <span className="td-meta-label">Priority</span>
                  <div className="td-priority-group">
                    {PRIORITIES.map(p => (
                      <button
                        key={p}
                        className={`td-priority-btn ${task.priority === p ? "active" : ""} priority-${p}`}
                        onClick={() => { setTask(prev => ({ ...prev, priority: p })); saveField("priority", p); }}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type */}
                <div className="td-meta-row">
                  <span className="td-meta-label">Type</span>
                  <select
                    className="td-meta-select"
                    value={task.type || "task"}
                    onChange={e => { setTask(p => ({ ...p, type: e.target.value })); saveField("type", e.target.value); }}
                  >
                    {Object.entries(TYPE_META).map(([v, m]) => (
                      <option key={v} value={v}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* Assignee */}
                <div className="td-meta-row td-meta-row--col">
                  <span className="td-meta-label">Assignee</span>
                  {task.assignee_name && (
                    <div className="td-assignee-chip">
                      <div className="task-assignee-avatar">{task.assignee_name.slice(0, 2).toUpperCase()}</div>
                      <span>{task.assignee_name}</span>
                      <button className="td-remove-assignee" onClick={removeAssignee} title="Remove">✕</button>
                    </div>
                  )}
                  <div style={{ position: "relative" }}>
                    <input
                      className="modal-input"
                      placeholder="Search assignee…"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      style={{ fontSize: 12, padding: "5px 10px" }}
                    />
                    {userResults.length > 0 && (
                      <div className="user-dropdown">
                        {userResults.map(u => (
                          <div key={u.id} className="user-dropdown-item" onClick={() => assignUser(u)}>
                            <div className="user-dropdown-avatar">{u.name.slice(0, 2).toUpperCase()}</div>
                            <div>
                              <div className="user-dropdown-name">{u.name}</div>
                              <div className="user-dropdown-email">{u.email}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates */}
                <div className="td-meta-row">
                  <span className="td-meta-label">Start Date</span>
                  <input type="date" className="td-meta-date"
                    value={formatDate(task.start_date)}
                    onChange={e => { setTask(p => ({ ...p, start_date: e.target.value })); saveField("start_date", e.target.value || null); }}
                  />
                </div>
                <div className="td-meta-row">
                  <span className="td-meta-label">Due Date</span>
                  <input type="date" className={`td-meta-date ${overdueFlag ? "td-overdue-date" : ""}`}
                    value={formatDate(task.due_date)}
                    onChange={e => { setTask(p => ({ ...p, due_date: e.target.value })); saveField("due_date", e.target.value || null); }}
                  />
                  {overdueFlag && <span className="td-overdue-badge">Overdue</span>}
                </div>

                {/* Est days */}
                <div className="td-meta-row">
                  <span className="td-meta-label">Est. days</span>
                  <input
                    type="number" min="1" max="180" className="td-meta-date"
                    style={{ width: 70 }}
                    value={task.estimated_days || 1}
                    onChange={e => setTask(p => ({ ...p, estimated_days: e.target.value }))}
                    onBlur={e => saveField("estimated_days", Number(e.target.value))}
                  />
                </div>

                {/* Recurrence */}
                <div className="td-meta-row">
                  <span className="td-meta-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    Recurrence
                    <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(139,92,246,0.15)", color: "#a78bfa", borderRadius: 3, padding: "1px 4px", letterSpacing: "0.3px" }}>SOON</span>
                  </span>
                  <select
                    className="td-meta-select"
                    value={task.recurrence || ""}
                    disabled
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    <option value="">None</option>
                    <option value="daily">🔁 Daily</option>
                    <option value="weekly">🔁 Weekly</option>
                    <option value="monthly">🔁 Monthly</option>
                  </select>
                </div>

                {/* Team */}
                {teams.length > 0 && (
                  <div className="td-meta-row">
                    <span className="td-meta-label">Team</span>
                    <select
                      className="td-meta-select"
                      value={task.team_id || ""}
                      onChange={e => { const v = e.target.value || null; setTask(p => ({ ...p, team_id: v })); saveField("team_id", v); }}
                    >
                      <option value="">— No team —</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.icon || "🏢"} {t.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Blocked fields */}
                {task.status === "blocked" && (
                  <div style={{ background: "#7f1d1d22", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 12px", marginTop: 8 }}>
                    <div style={{ color: "#fca5a5", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>🚫 Blocked Details</div>
                    <div className="td-meta-row td-meta-row--col" style={{ marginBottom: 6 }}>
                      <span className="td-meta-label">Reason</span>
                      <input
                        className="modal-input"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        placeholder="What is blocking this task?"
                        value={task.blocked_reason || ""}
                        onChange={e => setTask(p => ({ ...p, blocked_reason: e.target.value }))}
                        onBlur={e => saveField("blocked_reason", e.target.value || null)}
                      />
                    </div>
                    <div className="td-meta-row">
                      <span className="td-meta-label">Severity</span>
                      <select
                        className="td-meta-select"
                        value={task.blocked_severity || "medium"}
                        onChange={e => { setTask(p => ({ ...p, blocked_severity: e.target.value })); saveField("blocked_severity", e.target.value); }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="td-meta-row">
                      <span className="td-meta-label">Exp. Resolution</span>
                      <input type="date" className="td-meta-date"
                        value={formatDate(task.blocked_expected_resolution)}
                        onChange={e => { setTask(p => ({ ...p, blocked_expected_resolution: e.target.value })); saveField("blocked_expected_resolution", e.target.value || null); }}
                      />
                    </div>
                    {task.date_blocked && (
                      <div className="td-meta-row">
                        <span className="td-meta-label">Blocked Since</span>
                        <span className="td-meta-value" style={{ color: "#fca5a5" }}>{timeAgo(task.date_blocked)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Timestamps */}
                <div className="td-meta-row">
                  <span className="td-meta-label">Created</span>
                  <span className="td-meta-value">{timeAgo(task.created_at)}</span>
                </div>
                {task.completed_at && (
                  <div className="td-meta-row">
                    <span className="td-meta-label">Completed</span>
                    <span className="td-meta-value td-completed">{timeAgo(task.completed_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Subtasks tab ── */}
        {activeTab === "subtasks" && (
          <div className="td-body">
            <SubtasksTab taskId={task.id} />
          </div>
        )}

        {/* ── Effort Log tab ── */}
        {activeTab === "effort" && (
          <div className="td-body">
            <EffortTab taskId={task.id} currentUser={currentUser} />
          </div>
        )}

        {/* ── Comments tab ── */}
        {activeTab === "comments" && (
          <div className="td-body">
            <div className="td-comments-list">
              {comments.length === 0 && (
                <div className="td-empty-comments">
                  <div style={{ fontSize: 32 }}>💬</div>
                  <p>No comments yet. Start the conversation.</p>
                </div>
              )}
              {comments.map(c => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  currentUserId={currentUser?.id}
                  onDelete={deleteComment}
                />
              ))}
            </div>
            <div className="td-comment-compose">
              <div className="td-comment-avatar">
                {(currentUser?.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="td-compose-right">
                <textarea
                  ref={commentBoxRef}
                  className="td-compose-input"
                  placeholder="Write a comment…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment(); }}
                  rows={3}
                />
                <div className="td-compose-footer">
                  <span className="td-compose-hint">⌘+Enter to submit</span>
                  <button
                    className="btn-modal-submit"
                    onClick={postComment}
                    disabled={postingComment || !newComment.trim()}
                    style={{ padding: "6px 16px", fontSize: 13 }}
                  >
                    {postingComment ? "Posting…" : "Comment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="td-footer">
          <span style={{ fontSize: 12, color: "#94a3b8", marginRight: "auto" }}>
            {saving ? "Saving…" : "All changes auto-saved"}
          </span>
          <button className="btn-modal-cancel" onClick={onClose}>Close</button>
          <button
            className="btn-modal-save-primary"
            onClick={() => { onUpdate && onUpdate(task); onClose(); }}
          >
            Done
          </button>
        </div>

        {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      </div>
    </div>
  );
}
