import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import KanbanBoard from "../components/KanbanBoard";
import CreateTaskModal from "../components/CreateTaskModal";
import WorkspaceModal from "../components/WorkspaceModal";
import WorkloadDashboard from "../components/WorkloadDashboard";
import CalendarView from "../components/CalendarView";
import SprintView from "../components/SprintView";
import SprintModal from "../components/SprintModal";
import api from "../api/api";

const EMPTY_COLS = { todo: [], inprogress: [], done: [] };

function tasksToColumns(tasks) {
  const c = { todo: [], inprogress: [], done: [] };
  tasks.forEach(t => { if (c[t.status]) c[t.status].push(t); });
  return c;
}

export default function Dashboard() {
  const { user } = useAuth();

  const [workspaces, setWorkspaces]           = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [allTasks, setAllTasks]               = useState([]);
  const [columns, setColumns]                 = useState(EMPTY_COLS);
  const [sprints, setSprints]                 = useState([]);
  const [activeSprint, setActiveSprint]       = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [view, setView]                       = useState("board"); // board | workload | calendar | sprints

  const [showCreateTask, setShowCreateTask]       = useState(false);
  const [createTaskStatus, setCreateTaskStatus]   = useState("todo");
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showSprintModal, setShowSprintModal]     = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load workspaces ──────────────────────────────────────────
  const loadWorkspaces = useCallback(async () => {
    try {
      const { data } = await api.get("/workspaces");
      setWorkspaces(data);
      if (data.length > 0 && !currentWorkspace) setCurrentWorkspace(data[0]);
    } catch (err) { console.error(err); }
  }, []); // eslint-disable-line

  // ── Load tasks ───────────────────────────────────────────────
  const loadTasks = useCallback(async (wsId) => {
    if (!wsId) { setAllTasks([]); setColumns(EMPTY_COLS); return; }
    try {
      const { data } = await api.get(`/tasks/workspace/${wsId}`);
      setAllTasks(data);
      setColumns(tasksToColumns(data));
    } catch (err) { console.error(err); }
  }, []);

  // ── Load sprints ─────────────────────────────────────────────
  const loadSprints = useCallback(async (wsId) => {
    if (!wsId) return;
    try {
      const { data } = await api.get(`/sprints?workspace_id=${wsId}`);
      setSprints(data);
      if (!activeSprint && data.length > 0) setActiveSprint(data[0]);
    } catch {}
  }, []); // eslint-disable-line

  useEffect(() => {
    loadWorkspaces().finally(() => setLoading(false));
  }, [loadWorkspaces]);

  useEffect(() => {
    if (currentWorkspace) {
      loadTasks(currentWorkspace.id);
      loadSprints(currentWorkspace.id);
    }
  }, [currentWorkspace, loadTasks, loadSprints]);

  // ── Drag & Drop ──────────────────────────────────────────────
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
      await api.put(`/tasks/${draggableId}`, {
        status: destination.droppableId,
        position: destination.index,
        progress: destination.droppableId === "done" ? 100 : moved.progress,
      });
      loadTasks(currentWorkspace.id);
    } catch {
      loadTasks(currentWorkspace.id);
      showToast("Failed to move task", "error");
    }
  };

  // ── Create task ───────────────────────────────────────────────
  const handleCreateTask = async (formData) => {
    if (!currentWorkspace) throw new Error("No workspace selected");
    const { data } = await api.post("/tasks", { ...formData, workspace_id: currentWorkspace.id });
    setAllTasks(p => [...p, data]);
    setColumns(tasksToColumns([...allTasks, data]));
    showToast("Task created");
  };

  // ── Delete task ───────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    const next = allTasks.filter(t => t.id !== taskId);
    setAllTasks(next);
    setColumns(tasksToColumns(next));
    try {
      await api.delete(`/tasks/${taskId}`);
      showToast("Task deleted");
    } catch {
      loadTasks(currentWorkspace.id);
      showToast("Failed to delete task", "error");
    }
  };

  // ── Update task (from TaskCard progress edit) ─────────────────
  const handleTaskUpdated = (updatedTask) => {
    if (!updatedTask) { loadTasks(currentWorkspace?.id); return; }
    setAllTasks(p => p.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
    setColumns(p => {
      const next = { ...p };
      Object.keys(next).forEach(col => {
        next[col] = next[col].map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t);
      });
      return next;
    });
  };

  // ── Create workspace ──────────────────────────────────────────
  const handleCreateWorkspace = async (name) => {
    const { data } = await api.post("/workspaces", { name });
    setWorkspaces(p => [...p, data]);
    setCurrentWorkspace(data);
    showToast("Workspace created");
  };

  // ── Create sprint ─────────────────────────────────────────────
  const handleCreateSprint = async (formData) => {
    const { data } = await api.post("/sprints", { ...formData, workspace_id: currentWorkspace.id });
    setSprints(p => [data, ...p]);
    setActiveSprint(data);
    showToast("Sprint created");
  };

  const openCreateTask = (status = "todo") => {
    setCreateTaskStatus(status);
    setShowCreateTask(true);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />Loading Taskora…
      </div>
    );
  }

  const totalTasks = allTasks.length;

  return (
    <div className="app-layout">
      <Sidebar
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={ws => { setCurrentWorkspace(ws); setActiveSprint(null); }}
        onNewWorkspace={() => setShowWorkspaceModal(true)}
        activeView={view}
        onViewChange={setView}
      />

      <div className="main-area">
        <Navbar
          workspaceName={currentWorkspace?.name}
          onCreateTask={() => openCreateTask("todo")}
          user={user}
        />

        {/* View tabs */}
        <div className="view-tabs">
          {[
            { id: "board",    label: "📋 Board" },
            { id: "workload", label: "👥 Workload" },
            { id: "calendar", label: "📅 Calendar" },
            { id: "sprints",  label: "🏃 Sprints" },
          ].map(v => (
            <button
              key={v.id}
              className={`view-tab ${view === v.id ? "active" : ""}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="board-content">
          {/* ── Board view ── */}
          {view === "board" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>{currentWorkspace?.name || "Select a workspace"}</h1>
                  <p>{totalTasks} task{totalTasks !== 1 ? "s" : ""} across all columns</p>
                </div>
                <div className="board-header-actions">
                  <button className="btn-secondary" onClick={() => openCreateTask("todo")}>+ Add task</button>
                </div>
              </div>

              {currentWorkspace ? (
                <div className="kanban-scroll">
                  <KanbanBoard
                    columns={columns}
                    onDragEnd={handleDragEnd}
                    onAddTask={openCreateTask}
                    onDeleteTask={handleDeleteTask}
                    onUpdateTask={handleTaskUpdated}
                  />
                </div>
              ) : (
                <div className="empty-state" style={{ marginTop: 80 }}>
                  <div className="empty-state-icon" style={{ fontSize: 48 }}>🗂️</div>
                  <div className="empty-state-text" style={{ fontSize: 16, marginTop: 12 }}>No workspace selected</div>
                  <button className="btn-secondary" style={{ marginTop: 16 }}
                    onClick={() => setShowWorkspaceModal(true)}>
                    Create your first workspace
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Workload view ── */}
          {view === "workload" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Team Workload</h1>
                  <p>Capacity and task distribution across your team</p>
                </div>
              </div>
              <WorkloadDashboard workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Calendar view ── */}
          {view === "calendar" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Calendar</h1>
                  <p>Tasks scheduled by due date</p>
                </div>
                <button className="btn-secondary" onClick={() => openCreateTask("todo")}>+ Add task</button>
              </div>
              <CalendarView tasks={allTasks} onTaskClick={t => console.log("task", t)} />
            </>
          )}

          {/* ── Sprints view ── */}
          {view === "sprints" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Sprint Planning</h1>
                  <p>{sprints.length} sprint{sprints.length !== 1 ? "s" : ""} in this workspace</p>
                </div>
                <div className="board-header-actions">
                  <button className="btn-secondary" onClick={() => setShowSprintModal(true)}>+ New Sprint</button>
                </div>
              </div>

              {sprints.length === 0 ? (
                <div className="empty-state" style={{ marginTop: 60 }}>
                  <div className="empty-state-icon" style={{ fontSize: 48 }}>🏃</div>
                  <div className="empty-state-text" style={{ fontSize: 15, marginTop: 12 }}>No sprints yet</div>
                  <button className="btn-secondary" style={{ marginTop: 16 }}
                    onClick={() => setShowSprintModal(true)}>Create your first sprint</button>
                </div>
              ) : (
                <div>
                  {/* Sprint selector */}
                  <div className="sprint-selector">
                    {sprints.map(s => (
                      <button
                        key={s.id}
                        className={`sprint-selector-btn ${activeSprint?.id === s.id ? "active" : ""} sprint-status--${s.status}`}
                        onClick={() => setActiveSprint(s)}
                      >
                        {s.name}
                        <span className={`sprint-status-dot sprint-status--${s.status}`} />
                      </button>
                    ))}
                  </div>

                  {activeSprint && (
                    <SprintView
                      sprint={activeSprint}
                      workspaceId={currentWorkspace?.id}
                      allTasks={allTasks}
                      onTaskUpdated={handleTaskUpdated}
                      onAddToSprint={() => openCreateTask("todo")}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateTask && (
        <CreateTaskModal
          defaultStatus={createTaskStatus}
          sprints={sprints}
          onClose={() => setShowCreateTask(false)}
          onSubmit={handleCreateTask}
        />
      )}
      {showWorkspaceModal && (
        <WorkspaceModal onClose={() => setShowWorkspaceModal(false)} onSubmit={handleCreateWorkspace} />
      )}
      {showSprintModal && (
        <SprintModal onClose={() => setShowSprintModal(false)} onSubmit={handleCreateSprint} />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
