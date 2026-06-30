import { useState, useRef, useEffect } from "react";
import { Draggable } from "@hello-pangea/dnd";
import api from "../api/api";

const IconTrash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IconEdit   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconCal    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconMsg    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IconLink   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
const IconBrain  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-5 0V7a2.5 2.5 0 0 1 2.5-2.5Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5"/><path d="M20 7a2 2 0 0 0-2-2h-2"/><path d="M4 7a2 2 0 0 1 2-2h2"/><path d="M20 14a2 2 0 0 1-2 2h-2"/><path d="M4 14a2 2 0 0 0 2 2h2"/></svg>;
const IconClock  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconStuck  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

const TYPE_META = {
  task:         { label: "Task",         icon: "📋" },
  bug:          { label: "Bug",          icon: "🐛" },
  story:        { label: "Story",        icon: "📖" },
  rfp:          { label: "RFP",          icon: "📑" },
  proposal:     { label: "Proposal",     icon: "📝" },
  presentation: { label: "Presentation", icon: "🎤" },
  upgrade:      { label: "Upgrade",      icon: "⬆️"  },
  poc:          { label: "POC",          icon: "🔬" },
};

const RISK_LEVELS = {
  low:      { label: "Low risk",      pillClass: "tk-pill--ok" },
  medium:   { label: "Medium risk",   pillClass: "tk-pill--warn" },
  high:     { label: "High risk",     pillClass: "tk-pill--danger" },
  critical: { label: "Critical risk", pillClass: "tk-pill--danger" },
};

const PRIORITY_PILL = {
  low:      "tk-pill--ok",
  medium:   "tk-pill--warn",
  high:     "tk-pill--danger",
  critical: "tk-pill--danger",
};

function getRiskLevel(score) {
  if (!score && score !== 0) return null;
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}

function isDueSoon(d) {
  if (!d) return false;
  const due  = new Date(d);
  const now  = new Date();
  const diff = (due - now) / (1000 * 60 * 60);
  return diff >= 0 && diff <= 48;
}

function isStuck(task) {
  if (task.status !== "inprogress" && task.status !== "in_progress") return false;
  const ref = task.status_changed_at || task.updated_at || task.created_at;
  if (!ref) return false;
  const days = (Date.now() - new Date(ref)) / (1000 * 60 * 60 * 24);
  return days >= 5;
}

function WorkloadBadge({ task }) {
  if (!task.assigned_user_id) return null;
  if (task.assignee_on_leave)    return <span className="tk-pill tk-pill--ok"     style={{ fontSize: 11 }}>🏖 Leave</span>;
  if (task.assignee_travel_mode) return <span className="tk-pill tk-pill--accent" style={{ fontSize: 11 }}>✈️ Travel</span>;
  return null;
}

function InsightPanel({ task }) {
  const riskLevel = getRiskLevel(task.risk_score);
  const riskMeta  = riskLevel ? RISK_LEVELS[riskLevel] : null;
  const hasData   = riskMeta || task.ai_suggestion || task.delay_probability != null;
  if (!hasData) return null;

  return (
    <div className="tk-card-ai" style={{ marginTop: "var(--tk-space-2)", padding: "var(--tk-space-3)" }}>
      <div className="tk-card-ai__glow" />
      <div className="tk-insight-header">
        <IconBrain /> AI Insight
      </div>
      {riskMeta && (
        <div className="tk-insight-row">
          <span className={`tk-pill ${riskMeta.pillClass}`} style={{ fontSize: 10, padding: "2px 8px" }}>
            ⚠ {riskMeta.label}
          </span>
          <span className="tk-insight-row-value">{Math.round(task.risk_score)}/100</span>
        </div>
      )}
      {task.delay_probability != null && (
        <div className="tk-insight-row">
          <span>Delay probability</span>
          <span className={`tk-insight-row-value${task.delay_probability > 0.6 ? " tk-text-danger" : ""}`}>
            {Math.round(task.delay_probability * 100)}%
          </span>
        </div>
      )}
      {task.estimated_hours && (
        <div className="tk-insight-row">
          <span>Estimated hours</span>
          <span className="tk-insight-row-value">{task.estimated_hours}h</span>
        </div>
      )}
      {task.ai_suggestion && (
        <div className="tk-insight-suggestion">💡 {task.ai_suggestion}</div>
      )}
      {task.ai_fallback && (
        <div className="tk-insight-fallback">Rule-based analysis</div>
      )}
    </div>
  );
}

export default function TaskCard({ task, index, columnId, onDelete, onUpdate, onOpenDetail }) {
  const [hovered, setHovered] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const deleteTimerRef = useRef(null);
  const trashBtnRef = useRef(null);

  const openDeletePopup = (e) => {
    e.stopPropagation();
    const rect = trashBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setPopupPos({ top: rect.top - 8, left: rect.right });
    }
    setDeleteConfirm(true);
    deleteTimerRef.current = setTimeout(() => setDeleteConfirm(false), 5000);
  };

  const confirmDelete = (e) => {
    e.stopPropagation();
    clearTimeout(deleteTimerRef.current);
    setDeleteConfirm(false);
    onDelete(task.id);
  };

  const cancelDelete = (e) => {
    e?.stopPropagation();
    clearTimeout(deleteTimerRef.current);
    setDeleteConfirm(false);
  };

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft]     = useState(task.title);
  const titleInputRef = useRef(null);

  const isEditing = editingTitle;

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === task.title) { setTitleDraft(task.title); return; }
    try {
      const res = await api.put(`/tasks/${task.id}`, { title: trimmed });
      onUpdate && onUpdate(res.data);
    } catch {
      setTitleDraft(task.title);
    }
  };

  const [startError, setStartError] = useState("");

  const startTask = async (e) => {
    e.stopPropagation();
    setStartError("");
    try {
      const res = await api.put(`/tasks/${task.id}`, { status: "inprogress" });
      onUpdate && onUpdate(res.data);
    } catch {
      setStartError("Failed to start task");
      setTimeout(() => setStartError(""), 3000);
    }
  };

  const typeMeta  = TYPE_META[task.type] || { label: task.type, icon: "📋" };
  const riskLevel = getRiskLevel(task.risk_score);
  const riskMeta  = riskLevel ? RISK_LEVELS[riskLevel] : null;
  const isBlocked = (task.blocking_dep_count || 0) > 0;
  const stuck     = isStuck(task);
  const overdue   = isOverdue(task.due_date);
  const dueSoon   = !overdue && isDueSoon(task.due_date);
  const isTodo    = columnId === "todo" || task.status === "todo";
  const priorityPillClass = PRIORITY_PILL[task.priority] || "tk-pill--warn";

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...(isEditing ? {} : provided.dragHandleProps)}
          className={`tk-task-card${snapshot.isDragging ? " dragging" : ""}${isBlocked ? " tk-task-card--blocked" : ""}`}
          style={provided.draggableProps.style}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Status banner — overdue / stuck */}
          {overdue && (
            <div className="tk-task-banner tk-task-banner--danger">
              <IconCal /> Overdue
            </div>
          )}
          {!overdue && stuck && (
            <div className="tk-task-banner tk-task-banner--warn">
              <IconStuck /> Stuck 5+ days
            </div>
          )}

          {/* Blocked indicator */}
          {isBlocked && (
            <div
              className="tk-task-blocked-bar"
              title={`Blocked by ${task.blocking_dep_count} unresolved dependenc${task.blocking_dep_count === 1 ? "y" : "ies"}`}
            >
              <IconLink />
              <span>Blocked · {task.blocking_dep_count} dep{task.blocking_dep_count !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Title row */}
          <div className="tk-task-top">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="tk-task-title-input"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
                  if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(task.title); }
                }}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              />
            ) : (
              <div
                className="tk-task-title"
                onClick={e => { e.stopPropagation(); onOpenDetail && onOpenDetail(task); }}
                title="Click to open"
              >
                {task.title}
              </div>
            )}

            <div className="tk-task-actions">
              <button
                className="tk-task-action-btn"
                onClick={e => { e.stopPropagation(); onOpenDetail && onOpenDetail(task); }}
                title="Edit task"
              >
                <IconEdit />
              </button>
              <button
                ref={trashBtnRef}
                className="tk-task-action-btn tk-task-action-btn--delete"
                onClick={openDeletePopup}
                title="Delete task"
              >
                <IconTrash />
              </button>
            </div>

            {deleteConfirm && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: "fixed",
                  top: popupPos.top,
                  left: popupPos.left,
                  transform: "translate(-100%, -100%)",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 14px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.06)",
                  zIndex: 9999,
                  minWidth: 190,
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>Delete task?</div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.4 }}>
                  This action cannot be undone.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={cancelDelete}
                    style={{ flex: 1, padding: "6px 0", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#f8fafc", color: "#64748b", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#ef4444", color: "#fff", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Type + Priority + Risk + Due date */}
          <div className="tk-task-meta">
            {task.type && (
              <span className="tk-task-type">
                {typeMeta.icon} {typeMeta.label}
              </span>
            )}
            {task.priority && (
              <span className={`tk-pill ${priorityPillClass}`} style={{ fontSize: 11, padding: "2px 10px" }}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
            )}
            {riskMeta && riskLevel !== "low" && (
              <span
                className={`tk-pill ${riskMeta.pillClass}`}
                style={{ fontSize: 11, padding: "2px 10px" }}
                title={`Risk score: ${Math.round(task.risk_score)}/100`}
              >
                ⚠ {Math.round(task.risk_score)}
              </span>
            )}
            {task.due_date && (
              <span className={`tk-task-due${overdue ? " tk-task-due--overdue" : ""}${dueSoon ? " tk-task-due--soon" : ""}`}
                title={overdue ? "Overdue!" : dueSoon ? "Due within 48 hours" : ""}
              >
                {dueSoon ? <IconClock /> : <IconCal />}
                {formatDate(task.due_date)}
              </span>
            )}
          </div>

          {/* Workload badge */}
          <WorkloadBadge task={task} />

          {/* Footer: Start button + Assignee + comments + recurrence */}
          <div className="tk-task-footer">
            {isTodo && (
              <button className="tk-task-start-btn" onClick={startTask} title="Move to In Progress">
                ▶ Start
              </button>
            )}
            {task.assignee_name && (
              <div className="tk-task-assignee">
                <div className="tk-avatar">
                  {task.assignee_name.slice(0, 2).toUpperCase()}
                </div>
                <span className="tk-task-assignee-name">{task.assignee_name}</span>
              </div>
            )}
            <div className="tk-task-footer-end">
              {task.comment_count > 0 && (
                <div className="tk-task-comments" title={`${task.comment_count} comment${task.comment_count !== 1 ? "s" : ""}`}>
                  <IconMsg />
                  <span>{task.comment_count}</span>
                </div>
              )}
              {task.recurrence && (
                <span className="tk-task-recurrence" title={`Recurring: ${task.recurrence}`}>
                  🔁 {task.recurrence}
                </span>
              )}
            </div>
          </div>

          {startError && <div className="tk-task-error">{startError}</div>}

          {/* AI hover insight panel */}
          {hovered && !snapshot.isDragging && !isEditing && <InsightPanel task={task} />}
        </div>
      )}
    </Draggable>
  );
}
