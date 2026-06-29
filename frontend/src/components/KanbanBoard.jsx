import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import TaskCard from "./TaskCard";
import "../styles/board.css";

const COLUMNS = [
  { id: "todo",       label: "To Do",       colColor: "var(--tk-text-muted)" },
  { id: "inprogress", label: "In Progress",  colColor: "var(--tk-accent)" },
  { id: "review",     label: "In Review",    colColor: "var(--tk-accent-2)" },
  { id: "blocked",    label: "Blocked",      colColor: "#ef4444" },
  { id: "done",       label: "Done",         colColor: "var(--tk-status-ok)" },
];

export default function KanbanBoard({ columns, onDragEnd, onAddTask, onDeleteTask, onUpdateTask, onOpenDetail }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="tk-board">
        {COLUMNS.map((col) => {
          const tasks = columns[col.id] || [];
          return (
            <div key={col.id} className="tk-board-col">
              {/* Column header */}
              <div className="tk-board-col-header">
                <div className="tk-board-col-header-left">
                  <span className="tk-dot" style={{ background: col.colColor }} />
                  <span className="tk-board-col-name">{col.label}</span>
                  <span className="tk-board-col-count">{tasks.length}</span>
                </div>
                <button
                  className="tk-board-col-add-btn"
                  title={`Add task to ${col.label}`}
                  onClick={() => onAddTask(col.id)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>

              {/* Droppable body */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    className={`tk-board-col-body${snapshot.isDraggingOver ? " tk-board-col-body--over" : ""}`}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {tasks.length === 0 && !snapshot.isDraggingOver && (
                      <div className="tk-board-col-empty">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--tk-text-muted)" }}>
                          <rect x="3" y="3" width="18" height="18" rx="3"/>
                          <line x1="8" y1="12" x2="16" y2="12"/>
                          <line x1="12" y1="8" x2="12" y2="16"/>
                        </svg>
                        <span>No tasks here</span>
                        <button
                          className="tk-btn-secondary"
                          style={{ fontSize: 12, padding: "6px 14px" }}
                          onClick={() => onAddTask(col.id)}
                        >
                          + Add one
                        </button>
                      </div>
                    )}

                    {tasks.map((task, index) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        index={index}
                        columnId={col.id}
                        onDelete={onDeleteTask}
                        onUpdate={onUpdateTask}
                        onOpenDetail={onOpenDetail}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {/* Add task footer */}
              <button className="tk-board-col-footer-add" onClick={() => onAddTask(col.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New task
              </button>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
