import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import "../styles/board.css";
import "../styles/mytasks.css";

const PRIORITY_PILL = {
  critical: "tk-pill--danger",
  high:     "tk-pill--danger",
  medium:   "tk-pill--warn",
  low:      "tk-pill--ok",
};

const STATUS_LABEL = {
  todo:        "To Do",
  inprogress:  "In Progress",
  in_progress: "In Progress",
  review:      "In Review",
  blocked:     "Blocked",
  done:        "Done",
};

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}

// Cross-workspace flat list assigned to the current user — deliberately not
// built on TaskCard/KanbanBoard, since those are wired into @hello-pangea/dnd
// Draggable/Droppable and this view has no drag/column semantics (tasks here
// span workspaces, so "position" isn't even comparable across them).
export default function MyTasksView({ onOpenTask }) {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [includeDone, setIncludeDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/personal/my-tasks${includeDone ? "?include_done=true" : ""}`);
      setTasks(res.data);
    } catch {
      setError("Couldn't load your tasks.");
    } finally {
      setLoading(false);
    }
  }, [includeDone]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="mt-empty">Loading your tasks…</div>;
  }
  if (error) {
    return <div className="mt-empty mt-empty--error">{error}</div>;
  }

  const byWorkspace = new Map();
  for (const t of tasks) {
    const key = t.workspace_id;
    if (!byWorkspace.has(key)) byWorkspace.set(key, { name: t.workspace_name, tasks: [] });
    byWorkspace.get(key).tasks.push(t);
  }

  return (
    <div className="mt-view">
      <div className="mt-header">
        <div>
          <div className="mt-title">My Tasks</div>
          <div className="mt-subtitle">Everything assigned to you, across every workspace</div>
        </div>
        <label className="mt-toggle">
          <input type="checkbox" checked={includeDone} onChange={e => setIncludeDone(e.target.checked)} />
          Show completed
        </label>
      </div>

      {tasks.length === 0 && (
        <div className="mt-empty">Nothing assigned to you right now — you're all caught up.</div>
      )}

      {[...byWorkspace.entries()].map(([wsId, group]) => (
        <div key={wsId} className="mt-group">
          <div className="mt-group-header">
            <span className="mt-group-name">{group.name}</span>
            <span className="mt-group-count">{group.tasks.length}</span>
          </div>
          <div className="mt-list">
            {group.tasks.map(task => {
              const overdue = isOverdue(task.due_date);
              return (
                <div key={task.id} className="mt-row" onClick={() => onOpenTask?.(task)}>
                  <span className={`tk-pill ${PRIORITY_PILL[task.priority] || "tk-pill--warn"}`}>
                    {task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : "—"}
                  </span>
                  <span className="mt-row-title">{task.title}</span>
                  <span className="mt-row-status">{STATUS_LABEL[task.status] || task.status}</span>
                  {task.due_date && (
                    <span className={`tk-task-due${overdue ? " tk-task-due--overdue" : ""}`}>
                      {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
