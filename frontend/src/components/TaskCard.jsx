import { useState, useRef, useEffect } from "react";
import { Draggable } from "@hello-pangea/dnd";
import ProgressBar from "./ProgressBar";
import api from "../api/api";

const IconTrash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
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
  low:      { label: "Low risk",      color: "#10b981", bg: "#f0fdf4" },
  medium:   { label: "Medium risk",   color: "#f59e0b", bg: "#fffbeb" },
  high:     { label: "High risk",     color: "#ef4444", bg: "#fef2f2" },
  critical: { label: "Critical risk", color: "#dc2626", bg: "#fef2f2" },
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
  const diff = (due - now) / (1000 * 60 * 60); // hours
  return diff >= 0 && diff <= 48;
}

// Task stuck in "inprogress" for 5+ days without update
function isStuck(task) {
  if (task.status !== "inprogress") return false;
  const ref = task.updated_at || task.created_at;
  if (!ref) return false;
  const days = (Date.now() - new Date(ref)) / (1000 * 60 * 60 * 24);
  return days >= 5;
}

// Workload status badge
function WorkloadBadge({ task }) {
  if (!task.assigned_user_id) return null;
  if (task.assignee_on_leave)   return <span className="wl-badge wl-badge--leave" title="On leave">🏖 Leave</span>;
  if (task.assignee_travel_mode) return <span className="wl-badge wl-badge--travel" title="Travel mode">✈️ Travel</span>;
  return null;
}

// AI insight hover panel
function InsightPanel({ task }) {
  const riskLevel = getRiskLevel(task.risk_score);
  const riskMeta  = riskLevel ? RISK_LEVELS[riskLevel] : null;
  const hasData   = riskMeta || task.ai_suggestion || task.delay_probability != null;
  if (!hasData) return null;

  return (
    <div className="task-insight-panel">
      <div className="task-insight-header">
        <IconBrain /> AI Insight
      </div>
      {riskMeta && (
        <div className="task-insight-row" style={{ color: riskMeta.color, background: riskMeta.bg }}>
          <span>⚠ {riskMeta.label}</span>
          <span style={{ fontWeight: 700 }}>{Math.round(task.risk_score)}/100</span>
        </div>
      )}
      {task.delay_probability != null && (
        <div className="task-insight-row">
          <span>Delay probability</span>
          <span style={{ fontWeight: 700, color: task.delay_probability > 0.6 ? "#ef4444" : "#64748b" }}>
            {Math.round(task.delay_probability * 100)}%
          </span>
        </div>
      )}
      {task.estimated_hours && (
        <div className="task-insight-row">
          <span>Estimated hours</span>
          <span style={{ fontWeight: 700 }}>{task.estimated_hours}h</span>
        </div>
      )}
      {task.ai_suggestion && (
        <div className="task-insight-suggestion">💡 {task.ai_suggestion}</div>
      )}
      {task.ai_fallback && (
        <div className="task-insight-fallback">Rule-based analysis</div>
      )}
    </div>
  );
}

export default function TaskCard({ task, index, onDelete, onUpdate, onOpenDetail }) {
  const [progress, setProgress]     = useState(task.progress || 0);
  const [editingPct, setEditingPct] = useState(false);
  const [tempPct, setTempPct]       = useState(task.progress || 0);
  const [hovered, setHovered]       = useState(false);

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft]     = useState(task.title);
  const titleInputRef = useRef(null);

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

  const saveProgress = async (val) => {
    const pct = Math.max(0, Math.min(100, Number(val)));
    setProgress(pct);
    setEditingPct(false);
    try {
      const res = await api.put(`/tasks/${task.id}`, { progress: pct });
      onUpdate && onUpdate(res.data);
    } catch {}
  };

  const typeMeta  = TYPE_META[task.type] || { label: task.type, icon: "📋" };
  const riskLevel = getRiskLevel(task.risk_score);
  const riskMeta  = riskLevel ? RISK_LEVELS[riskLevel] : null;
  const isBlocked = (task.blocking_dep_count || 0) > 0;
  const stuck     = isStuck(task);
  const overdue   = isOverdue(task.due_date);
  const dueSoon   = !overdue && isDueSoon(task.due_date);

  // Card state classes
  const stateClass = overdue ? "task-card--overdue" : stuck ? "task-card--stuck" : "";

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-card ${snapshot.isDragging ? "dragging" : ""} ${isBlocked ? "task-card--blocked" : ""} ${stateClass}`}
          style={provided.draggableProps.style}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Status strip — overdue / stuck */}
          {overdue && (
            <div className="task-status-strip task-status-strip--overdue">
              <IconCal /> Overdue
            </div>
          )}
          {!overdue && stuck && (
            <div className="task-status-strip task-status-strip--stuck">
              <IconStuck /> Stuck 5+ days
            </div>
          )}

          {/* Blocked indicator strip */}
          {isBlocked && (
            <div className="task-blocked-bar" title={`Blocked by ${task.blocking_dep_count} unresolved dependenc${task.blocking_dep_count === 1 ? "y" : "ies"}`}>
              <IconLink />
              <span>Blocked · {task.blocking_dep_count} dep{task.blocking_dep_count !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Title row */}
          <div className="task-card-top">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="task-title-input"
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
                className="task-card-title"
                onClick={e => { e.stopPropagation(); onOpenDetail && onOpenDetail(task); }}
                onDoubleClick={e => {
                  e.stopPropagation();
                  setTitleDraft(task.title);
                  setEditingTitle(true);
                }}
                title="Click to open · Double-click to rename"
              >
                {task.title}
              </div>
            )}
            <button
              className="task-card-delete"
              onClick={e => { e.stopPropagation(); onDelete(task.id); }}
              title="Delete task"
            >
              <IconTrash />
            </button>
          </div>

          {/* Type + Priority + Risk badge + Due date */}
          <div className="task-card-meta">
            {task.type && (
              <span className={`wl-type-badge wl-type--${task.type}`}>
                {typeMeta.icon} {typeMeta.label}
              </span>
            )}
            <span className={`priority-badge ${task.priority}`}>
              <span className="priority-dot" />
              {task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1)}
            </span>
            {riskMeta && riskLevel !== "low" && (
              <span
                className="task-risk-badge"
                style={{ color: riskMeta.color, background: riskMeta.bg, border: `1px solid ${riskMeta.color}33` }}
                title={`Risk score: ${Math.round(task.risk_score)}/100`}
              >
                ⚠ {Math.round(task.risk_score)}
              </span>
            )}
            {task.due_date && (
              <span
                className={`task-due-date ${overdue ? "overdue" : ""} ${dueSoon ? "due-soon" : ""}`}
                title={overdue ? "Overdue!" : dueSoon ? "Due within 48 hours" : ""}
              >
                {dueSoon ? <IconClock /> : <IconCal />}
                {formatDate(task.due_date)}
              </span>
            )}
          </div>

          {/* Workload badge */}
          <WorkloadBadge task={task} />

          {/* Progress bar */}
          <div className="task-card-progress" onClick={e => { e.stopPropagation(); setEditingPct(true); setTempPct(progress); }}>
            <ProgressBar progress={progress} height={5} showLabel={false} />
            {editingPct ? (
              <div className="task-progress-edit" onClick={e => e.stopPropagation()}>
                <input
                  type="range" min="0" max="100" step="5"
                  value={tempPct}
                  onChange={e => setTempPct(e.target.value)}
                  className="task-progress-slider"
                  autoFocus
                />
                <span className="task-progress-pct">{tempPct}%</span>
                <button className="task-progress-save" onClick={() => saveProgress(tempPct)}>✓</button>
                <button className="task-progress-cancel" onClick={() => setEditingPct(false)}>✕</button>
              </div>
            ) : (
              <span className="task-progress-pct-label">{progress}%</span>
            )}
          </div>

          {/* Footer: Assignee + comment count + recurrence */}
          <div className="task-card-footer">
            {task.assignee_name && (
              <div className="task-assignee">
                <div className="task-assignee-avatar">
                  {task.assignee_name.slice(0, 2).toUpperCase()}
                </div>
                <span className="task-assignee-name">{task.assignee_name}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              {task.comment_count > 0 && (
                <div className="task-comment-count" title={`${task.comment_count} comment${task.comment_count !== 1 ? "s" : ""}`}>
                  <IconMsg />
                  <span>{task.comment_count}</span>
                </div>
              )}
              {task.recurrence && (
                <span className="task-recurrence-badge" title={`Recurring: ${task.recurrence}`}>
                  🔁 {task.recurrence}
                </span>
              )}
            </div>
          </div>

          {/* AI hover insight panel */}
          {hovered && !snapshot.isDragging && !editingTitle && <InsightPanel task={task} />}
        </div>
      )}
    </Draggable>
  );
}
