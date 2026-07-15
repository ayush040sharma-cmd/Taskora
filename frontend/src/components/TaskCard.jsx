import { useState, useRef, useEffect } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { LuTrash2, LuSquarePen, LuCalendar, LuMessageSquare, LuLink, LuBrain, LuClock, LuCircleAlert, LuClipboardList, LuBug, LuBookOpen, LuFileStack, LuFilePenLine, LuPresentation, LuArrowUp, LuFlaskConical } from "react-icons/lu";
import api from "../api/api";
import { getInitials } from "../utils/avatar";

const IconTrash  = () => <LuTrash2 size={13} />;
const IconEdit   = () => <LuSquarePen size={13} />;
const IconCal    = () => <LuCalendar size={11} />;
const IconMsg    = () => <LuMessageSquare size={11} />;
const IconLink   = () => <LuLink size={11} />;
const IconBrain  = () => <LuBrain size={11} />;
const IconClock  = () => <LuClock size={11} />;
const IconStuck  = () => <LuCircleAlert size={11} />;

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

  const typeMeta  = TYPE_META[task.type] || { label: task.type, icon: LuClipboardList };
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

          {/* Blocked reason — captured when the task was moved to Blocked */}
          {task.status === "blocked" && task.blocked_reason && (
            <div
              className={`tk-task-banner tk-task-banner--danger`}
              title={`Severity: ${task.blocked_severity || "medium"}`}
            >
              <IconStuck /> {task.blocked_reason}
              {task.blocked_tagged_user_name && (
                <span style={{ opacity: 0.85 }}> · {task.blocked_tagged_user_name}</span>
              )}
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
              <span className="tk-task-type" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <typeMeta.icon size={11} /> {typeMeta.label}
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
