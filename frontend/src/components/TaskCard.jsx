import { useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import ProgressBar from "./ProgressBar";
import api from "../api/api";

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const IconCal = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const TYPE_LABELS = { rfp: "RFP", upgrade: "Upgrade", normal: "Normal" };

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}

export default function TaskCard({ task, index, onDelete, onUpdate }) {
  const [progress, setProgress] = useState(task.progress || 0);
  const [editing, setEditing]   = useState(false);
  const [tempPct, setTempPct]   = useState(task.progress || 0);

  const saveProgress = async (val) => {
    const pct = Math.max(0, Math.min(100, Number(val)));
    setProgress(pct);
    setEditing(false);
    try {
      const res = await api.put(`/tasks/${task.id}`, { progress: pct });
      onUpdate && onUpdate(res.data);
    } catch {}
  };

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-card ${snapshot.isDragging ? "dragging" : ""}`}
          style={provided.draggableProps.style}
        >
          {/* Title row */}
          <div className="task-card-top">
            <div className="task-card-title">{task.title}</div>
            <button
              className="task-card-delete"
              onClick={e => { e.stopPropagation(); onDelete(task.id); }}
              title="Delete task"
            >
              <IconTrash />
            </button>
          </div>

          {/* Type + Priority + Due Date */}
          <div className="task-card-meta">
            {task.type && task.type !== "normal" && (
              <span className={`wl-type-badge wl-type--${task.type}`}>
                {TYPE_LABELS[task.type]}
              </span>
            )}
            <span className={`priority-badge ${task.priority}`}>
              <span className="priority-dot" />
              {task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1)}
            </span>
            {task.due_date && (
              <span className={`task-due-date ${isOverdue(task.due_date) ? "overdue" : ""}`}>
                <IconCal />
                {formatDate(task.due_date)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="task-card-progress" onClick={e => { e.stopPropagation(); setEditing(true); setTempPct(progress); }}>
            <ProgressBar progress={progress} height={5} showLabel={false} />
            {editing ? (
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
                <button className="task-progress-cancel" onClick={() => setEditing(false)}>✕</button>
              </div>
            ) : (
              <span className="task-progress-pct-label">{progress}% · click to edit</span>
            )}
          </div>

          {/* Assignee */}
          {task.assignee_name && (
            <div className="task-assignee">
              <div className="task-assignee-avatar">
                {task.assignee_name.slice(0, 2).toUpperCase()}
              </div>
              <span className="task-assignee-name">{task.assignee_name}</span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
