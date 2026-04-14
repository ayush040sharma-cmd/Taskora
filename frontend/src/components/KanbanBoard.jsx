import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import TaskCard from "./TaskCard";

const COLUMNS = [
  { id: "todo",       label: "To Do",       color: "#97a0af" },
  { id: "inprogress", label: "In Progress",  color: "#0052cc" },
  { id: "done",       label: "Done",         color: "#00875a" },
];

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function KanbanBoard({ columns, onDragEnd, onAddTask, onDeleteTask }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const tasks = columns[col.id] || [];
          return (
            <div key={col.id} className="kanban-column">
              <div className="kanban-column-header">
                <div className="kanban-column-title">
                  <div className="kanban-column-dot" style={{ background: col.color }} />
                  <span className="kanban-column-name">{col.label}</span>
                  <span className="kanban-column-count">{tasks.length}</span>
                </div>
              </div>

              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    className="kanban-column-body"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      background: snapshot.isDraggingOver ? "rgba(0,82,204,0.05)" : undefined,
                      transition: "background 0.2s",
                    }}
                  >
                    <div className="kanban-droppable">
                      {tasks.length === 0 && !snapshot.isDraggingOver && (
                        <div className="empty-state">
                          <div className="empty-state-icon">📭</div>
                          <div className="empty-state-text">No tasks yet</div>
                        </div>
                      )}
                      {tasks.map((task, index) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          index={index}
                          onDelete={onDeleteTask}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>

              <button
                className="kanban-add-task"
                onClick={() => onAddTask(col.id)}
              >
                <IconPlus />
                Add task
              </button>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
