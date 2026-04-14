import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import KanbanBoard from "../components/KanbanBoard";
import CreateTaskModal from "../components/CreateTaskModal";
import WorkspaceModal from "../components/WorkspaceModal";
import api from "../api/api";

const EMPTY_COLUMNS = { todo: [], inprogress: [], done: [] };

// Distribute flat task array into column map
function tasksToColumns(tasks) {
  const cols = { todo: [], inprogress: [], done: [] };
  for (const t of tasks) {
    if (cols[t.status]) cols[t.status].push(t);
  }
  return cols;
}

export default function Dashboard() {
  const { user } = useAuth();

  const [workspaces, setWorkspaces]           = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [columns, setColumns]                 = useState(EMPTY_COLUMNS);
  const [loading, setLoading]                 = useState(true);

  // Modal state
  const [showCreateTask, setShowCreateTask]       = useState(false);
  const [createTaskStatus, setCreateTaskStatus]   = useState("todo");
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  // Toast
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
      if (data.length > 0 && !currentWorkspace) {
        setCurrentWorkspace(data[0]);
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tasks for current workspace ────────────────────────
  const loadTasks = useCallback(async (workspaceId) => {
    if (!workspaceId) { setColumns(EMPTY_COLUMNS); return; }
    try {
      const { data } = await api.get(`/tasks/workspace/${workspaceId}`);
      setColumns(tasksToColumns(data));
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces().finally(() => setLoading(false));
  }, [loadWorkspaces]);

  useEffect(() => {
    if (currentWorkspace) loadTasks(currentWorkspace.id);
  }, [currentWorkspace, loadTasks]);

  // ── Drag & Drop ──────────────────────────────────────────────
  const handleDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Optimistic update
    const srcTasks = Array.from(columns[source.droppableId]);
    const dstTasks = source.droppableId === destination.droppableId
      ? srcTasks
      : Array.from(columns[destination.droppableId]);

    const [moved] = srcTasks.splice(source.index, 1);
    const updatedTask = { ...moved, status: destination.droppableId };
    dstTasks.splice(destination.index, 0, updatedTask);

    setColumns((prev) => ({
      ...prev,
      [source.droppableId]: srcTasks,
      [destination.droppableId]: dstTasks,
    }));

    // Sync to backend
    try {
      await api.put(`/tasks/${draggableId}`, {
        status: destination.droppableId,
        position: destination.index,
      });
    } catch {
      // Revert on failure
      loadTasks(currentWorkspace.id);
      showToast("Failed to move task", "error");
    }
  };

  // ── Create task ───────────────────────────────────────────────
  const handleCreateTask = async (formData) => {
    if (!currentWorkspace) throw new Error("No workspace selected");
    const { data } = await api.post("/tasks", {
      ...formData,
      workspace_id: currentWorkspace.id,
    });
    setColumns((prev) => ({
      ...prev,
      [data.status]: [...prev[data.status], data],
    }));
    showToast("Task created");
  };

  // ── Delete task ───────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    // Optimistic
    setColumns((prev) => {
      const next = {};
      for (const col of Object.keys(prev)) {
        next[col] = prev[col].filter((t) => t.id !== taskId);
      }
      return next;
    });
    try {
      await api.delete(`/tasks/${taskId}`);
      showToast("Task deleted");
    } catch {
      loadTasks(currentWorkspace.id);
      showToast("Failed to delete task", "error");
    }
  };

  // ── Create workspace ──────────────────────────────────────────
  const handleCreateWorkspace = async (name) => {
    const { data } = await api.post("/workspaces", { name });
    setWorkspaces((prev) => [...prev, data]);
    setCurrentWorkspace(data);
    showToast("Workspace created");
  };

  // ── Open create task (from column button or navbar) ───────────
  const openCreateTask = (status = "todo") => {
    setCreateTaskStatus(status);
    setShowCreateTask(true);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        Loading your workspace…
      </div>
    );
  }

  const totalTasks = Object.values(columns).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="app-layout">
      <Sidebar
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
        onNewWorkspace={() => setShowWorkspaceModal(true)}
      />

      <div className="main-area">
        <Navbar
          workspaceName={currentWorkspace?.name}
          onCreateTask={() => openCreateTask("todo")}
          user={user}
        />

        <div className="board-content">
          {/* Board header */}
          <div className="board-header">
            <div className="board-title-area">
              <h1>{currentWorkspace?.name || "Select a workspace"}</h1>
              <p>{totalTasks} task{totalTasks !== 1 ? "s" : ""} across all columns</p>
            </div>
            <div className="board-header-actions">
              <button className="btn-secondary" onClick={() => openCreateTask("todo")}>
                + Add task
              </button>
            </div>
          </div>

          {/* Kanban */}
          {currentWorkspace ? (
            <div className="kanban-scroll">
              <KanbanBoard
                columns={columns}
                onDragEnd={handleDragEnd}
                onAddTask={openCreateTask}
                onDeleteTask={handleDeleteTask}
              />
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: 80 }}>
              <div className="empty-state-icon" style={{ fontSize: 48 }}>🗂️</div>
              <div className="empty-state-text" style={{ fontSize: 16, marginTop: 12 }}>
                No workspace selected
              </div>
              <button
                className="btn-secondary"
                style={{ marginTop: 16 }}
                onClick={() => setShowWorkspaceModal(true)}
              >
                Create your first workspace
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateTask && (
        <CreateTaskModal
          defaultStatus={createTaskStatus}
          onClose={() => setShowCreateTask(false)}
          onSubmit={handleCreateTask}
        />
      )}

      {showWorkspaceModal && (
        <WorkspaceModal
          onClose={() => setShowWorkspaceModal(false)}
          onSubmit={handleCreateWorkspace}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
