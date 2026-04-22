/**
 * TaskDetailModal — Phase 1 upgrade
 * Tabs: Details | Subtasks | Effort Log | Comments
 */

import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const TYPE_META = {
  task:         { label: "Task",         icon: "📋" },
  bug:          { label: "Bug",          icon: "🐛" },
  story:        { label: "Story",        icon: "📖" },
  rfp:          { label: "RFP",          icon: "📑" },
  proposal:     { label: "Proposal",     icon: "📝" },
  presentation: { label: "Presentation", icon: "🎤" },
  upgrade:      { label: "Upgrade",      icon: "⬆️" },
  poc:          { label: "POC",          icon: "🔬" },
};

const PRIORITIES = ["low", "medium", "high"];
const STATUSES   = [
  { value: "todo",       label: "To Do"      },
  { value: "inprogress", label: "In Progress" },
  { value: "done",       label: "Done"        },
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

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

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
export default function TaskDetailModal({ task: initialTask, onClose, onUpdate, currentUser }) {
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
  const commentBoxRef               = useRef(null);

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
    setSaving(true);
    try {
      const res = await api.put(`/tasks/${task.id}`, { [field]: value });
      setTask(res.data);
      onUpdate && onUpdate(res.data);
      showMsg("Saved");
    } catch { showMsg("Failed to save", "error"); }
    finally  { setSaving(false); }
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
        const res = await api.get(`/workload/users?q=${encodeURIComponent(userSearch)}`);
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

  const overdueFlag = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());

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
            <span className="td-type-icon">{TYPE_META[task.type]?.icon || "📋"}</span>
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
          <button className="modal-close" onClick={onClose}><IconX /></button>
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
          {saving && <span className="td-saving">Saving…</span>}
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
                      <option key={v} value={v}>{m.icon} {m.label}</option>
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
                  <span className="td-meta-label">Recurrence</span>
                  <select
                    className="td-meta-select"
                    value={task.recurrence || ""}
                    onChange={e => { setTask(p => ({ ...p, recurrence: e.target.value || null })); saveField("recurrence", e.target.value || null); }}
                  >
                    <option value="">None</option>
                    <option value="daily">🔁 Daily</option>
                    <option value="weekly">🔁 Weekly</option>
                    <option value="monthly">🔁 Monthly</option>
                  </select>
                </div>

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

        {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      </div>
    </div>
  );
}
