import { Draggable } from "@hello-pangea/dnd";

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const IconCal = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

export default function TaskCard({ task, index, onDelete }) {
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
          <div className="task-card-top">
            <div className="task-card-title">{task.title}</div>
            <button
              className="task-card-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
              title="Delete task"
            >
              <IconTrash />
            </button>
          </div>

          <div className="task-card-meta">
            <span className={`priority-badge ${task.priority}`}>
              <span className="priority-dot" />
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>

            {task.due_date && (
              <span className={`task-due-date ${isOverdue(task.due_date) ? "overdue" : ""}`}>
                <IconCal />
                {formatDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
