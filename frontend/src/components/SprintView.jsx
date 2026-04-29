import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import api from "../api/api";
import BurndownChart from "./BurndownChart";
import ProgressBar from "./ProgressBar";

const COLS = [
  { id: "todo",       label: "To Do",      color: "#97a0af" },
  { id: "inprogress", label: "In Progress", color: "#0052cc" },
  { id: "done",       label: "Done",        color: "#00875a" },
];

function tasksToColumns(tasks) {
  const c = { todo: [], inprogress: [], done: [] };
  tasks.forEach(t => {
    const key = t.status === "in_progress" ? "inprogress" : t.status;
    if (c[key]) c[key].push(t);
  });
  return c;
}

export default function SprintView({ sprint, workspaceId, allTasks, onTaskUpdated, onAddToSprint }) {
  const [columns, setColumns]       = useState({ todo: [], inprogress: [], done: [] });
  const [burndown, setBurndown]     = useState(null);
  const [tab, setTab]               = useState("board"); // board | burndown
  const [statusMsg, setStatusMsg]   = useState("");

  useEffect(() => {
    const sprintTasks = allTasks.filter(t => t.sprint_id === sprint.id);
    setColumns(tasksToColumns(sprintTasks));
  }, [allTasks, sprint.id]);

  const loadBurndown = async () => {
    try {
      const res = await api.get(`/sprints/${sprint.id}/burndown`);
      setBurndown(res.data);
    } catch {}
  };

  useEffect(() => { if (tab === "burndown") loadBurndown(); }, [tab]);

  const handleDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const src = Array.from(columns[source.droppableId]);
    const dst = source.droppableId === destination.droppableId ? src : Array.from(columns[destination.droppableId]);
    const [moved] = src.splice(source.index, 1);
    const updated = { ...moved, status: destination.droppableId };
    dst.splice(destination.index, 0, updated);

    setColumns(p => ({ ...p, [source.droppableId]: src, [destination.droppableId]: dst }));

    try {
      const res = await api.put(`/tasks/${draggableId}`, {
        status: destination.droppableId,
        progress: destination.droppableId === "done" ? 100 : moved.progress,
      });
      onTaskUpdated && onTaskUpdated(res.data);
    } catch { /* revert handled by parent reload */ }
  };

  const updateStatus = async (status) => {
    try {
      await api.put(`/sprints/${sprint.id}`, { status });
      setStatusMsg(`Sprint marked as ${status}`);
      setTimeout(() => setStatusMsg(""), 3000);
      onTaskUpdated && onTaskUpdated(null); // trigger parent reload
    } catch {}
  };

  const totalTasks = Object.values(columns).flat().length;
  const doneTasks  = columns.done.length;
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const sprintDays = sprint.end_date
    ? Math.max(0, Math.ceil((new Date(sprint.end_date) - new Date()) / 86400000))
    : "?";

  return (
    <div className="sprint-view">
      {/* Sprint Header */}
      <div className="sprint-header">
        <div className="sprint-header-left">
          <div className="sprint-name">{sprint.name}</div>
          {sprint.goal && <div className="sprint-goal">🎯 {sprint.goal}</div>}
          <div className="sprint-dates">
            {sprint.start_date} → {sprint.end_date}
            <span className="sprint-days-left"> · {sprintDays} days left</span>
          </div>
        </div>
        <div className="sprint-header-right">
          <div className="sprint-progress-summary">
            <span>{doneTasks}/{totalTasks} tasks done</span>
            <ProgressBar progress={pct} height={8} showLabel />
          </div>
          <div className="sprint-actions">
            {sprint.status === "planning" && (
              <button className="btn-sprint-action btn-sprint-start" onClick={() => updateStatus("active")}>
                ▶ Start Sprint
              </button>
            )}
            {sprint.status === "active" && (
              <button className="btn-sprint-action btn-sprint-end" onClick={() => updateStatus("completed")}>
                ✓ End Sprint
              </button>
            )}
            <span className={`sprint-status-badge sprint-status--${sprint.status}`}>
              {sprint.status}
            </span>
          </div>
        </div>
      </div>

      {statusMsg && <div className="toast success">{statusMsg}</div>}

      {/* Tabs */}
      <div className="sprint-tabs">
        <button className={`sprint-tab ${tab === "board" ? "active" : ""}`} onClick={() => setTab("board")}>
          Board
        </button>
        <button className={`sprint-tab ${tab === "burndown" ? "active" : ""}`} onClick={() => setTab("burndown")}>
          Burndown Chart
        </button>
        <button className="sprint-tab-add" onClick={() => onAddToSprint && onAddToSprint(sprint.id)}>
          + Add Tasks to Sprint
        </button>
      </div>

      {/* Board view */}
      {tab === "board" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="sprint-board">
            {COLS.map(col => {
              const tasks = columns[col.id] || [];
              return (
                <div key={col.id} className="sprint-column">
                  <div className="sprint-col-header">
                    <div className="sprint-col-dot" style={{ background: col.color }} />
                    <span className="sprint-col-name">{col.label}</span>
                    <span className="sprint-col-count">{tasks.length}</span>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="sprint-col-body"
                        style={{ background: snapshot.isDraggingOver ? "rgba(0,82,204,0.04)" : undefined }}
                      >
                        {tasks.map((task, index) => (
                          <Draggable key={String(task.id)} draggableId={String(task.id)} index={index}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={`sprint-task-card ${snap.isDragging ? "dragging" : ""}`}
                                style={prov.draggableProps.style}
                              >
                                <div className="sprint-task-title">{task.title}</div>
                                <div className="sprint-task-meta">
                                  <span className={`priority-badge ${task.priority}`}>
                                    <span className="priority-dot" />
                                    {task.priority}
                                  </span>
                                  <span className={`wl-type-badge wl-type--${task.type}`}>
                                    {task.type === "rfp" ? "RFP" : task.type === "upgrade" ? "Upgrade" : "Normal"}
                                  </span>
                                </div>
                                <ProgressBar progress={task.progress || 0} height={4} showLabel={false} />
                                <div className="sprint-task-progress-pct">{task.progress || 0}%</div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {!tasks.length && !snapshot.isDraggingOver && (
                          <div className="sprint-col-empty">Drop tasks here</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Burndown view */}
      {tab === "burndown" && (
        <div className="burndown-section">
          <div className="burndown-stats">
            <div className="burndown-stat">
              <div className="burndown-stat-num">{totalTasks}</div>
              <div className="burndown-stat-label">Total tasks</div>
            </div>
            <div className="burndown-stat">
              <div className="burndown-stat-num" style={{ color: "#00875a" }}>{doneTasks}</div>
              <div className="burndown-stat-label">Completed</div>
            </div>
            <div className="burndown-stat">
              <div className="burndown-stat-num" style={{ color: "#0052cc" }}>{totalTasks - doneTasks}</div>
              <div className="burndown-stat-label">Remaining</div>
            </div>
            <div className="burndown-stat">
              <div className="burndown-stat-num">{pct}%</div>
              <div className="burndown-stat-label">Velocity</div>
            </div>
          </div>
          <BurndownChart data={burndown?.data || []} total={burndown?.total || totalTasks} />
        </div>
      )}
    </div>
  );
}
