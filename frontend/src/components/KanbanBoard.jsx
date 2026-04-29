import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import TaskCard from "./TaskCard";

const COLUMNS = [
  { id: "todo",       label: "To Do",       color: "#6b7280", accent: "#e5e7eb" },
  { id: "inprogress", label: "In Progress",  color: "#3b82f6", accent: "#dbeafe" },
  { id: "done",       label: "Done",         color: "#10b981", accent: "#d1fae5" },
];

export default function KanbanBoard({ columns, onDragEnd, onAddTask, onDeleteTask, onUpdateTask, onOpenDetail }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="cb-board">
        {COLUMNS.map((col) => {
          const tasks = columns[col.id] || [];
          return (
            <div key={col.id} className="cb-column">
              {/* Column header — ClickUp style */}
              <div className="cb-col-header" style={{ "--col-color": col.color, "--col-accent": col.accent }}>
                <div className="cb-col-header-left">
                  <span className="cb-col-dot" style={{ background: col.color }} />
                  <span className="cb-col-name">{col.label}</span>
                  <span className="cb-col-count" style={{ background: col.accent, color: col.color }}>
                    {tasks.length}
                  </span>
                </div>
                <button
                  className="cb-col-add-btn"
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
                    className={`cb-col-body ${snapshot.isDraggingOver ? "cb-col-body--over" : ""}`}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {tasks.length === 0 && !snapshot.isDraggingOver && (
                      <div className="cb-empty">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="3"/>
                          <line x1="8" y1="12" x2="16" y2="12"/>
                          <line x1="12" y1="8" x2="12" y2="16"/>
                        </svg>
                        <span>No tasks</span>
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
              <button className="cb-col-footer-add" onClick={() => onAddTask(col.id)}>
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
