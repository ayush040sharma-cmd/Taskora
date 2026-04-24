import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import KanbanBoard from "../components/KanbanBoard";
import CreateTaskModal from "../components/CreateTaskModal";
import WorkspaceModal from "../components/WorkspaceModal";
import WorkloadDashboard from "../components/WorkloadDashboard";
import CalendarView from "../components/CalendarView";
import SummaryDashboard from "../components/SummaryDashboard";
import SprintView from "../components/SprintView";
import SprintModal from "../components/SprintModal";
import ManagerDashboard from "../components/ManagerDashboard";
import CapacityPanel from "../components/CapacityPanel";
import MembersPanel from "../components/MembersPanel";
import FilterBar from "../components/FilterBar";
import IntegrationsPanel from "../components/IntegrationsPanel";
import ActivityFeed from "../components/ActivityFeed";
import SimulationPanel from "../components/SimulationPanel";
import AIRiskHeatmap from "../components/AIRiskHeatmap";
import NLChat from "../components/NLChat";
import GanttChart from "../components/GanttChart";
import AnalyticsDashboard from "../components/AnalyticsDashboard";
import HelpGuide from "../components/HelpGuide";
import TaskDetailModal from "../components/TaskDetailModal";
import CommandPalette from "../components/CommandPalette";
import AIBubble from "../components/AIBubble";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";
import AIInsightsPanel from "../components/AIInsightsPanel";

const EMPTY_COLS = { todo: [], inprogress: [], done: [] };

function tasksToColumns(tasks) {
  const c = { todo: [], inprogress: [], done: [] };
  tasks.forEach(t => { if (c[t.status]) c[t.status].push(t); });
  return c;
}

// ── Undo Toast ────────────────────────────────────────────────────
function UndoToast({ item, onUndo, onDismiss }) {
  const [secs, setSecs] = useState(5);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { clearInterval(timerRef.current); onDismiss(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [onDismiss]);

  return (
    <div className="undo-toast">
      <span className="undo-toast-msg">{item.msg}</span>
      <button className="undo-toast-btn" onClick={() => { clearInterval(timerRef.current); onUndo(); }}>
        Undo
      </button>
      <span className="undo-toast-timer">{secs}s</span>
      <button className="undo-toast-close" onClick={() => { clearInterval(timerRef.current); onDismiss(); }}>✕</button>
    </div>
  );
}

// ── Keyboard cheatsheet modal ──────────────────────────────────────
const SHORTCUTS = [
  { key: "⌘K / Ctrl+K", desc: "Open command palette" },
  { key: "N",            desc: "New task" },
  { key: "?",            desc: "Show this cheatsheet" },
  { key: "/",            desc: "Focus search" },
  { key: "E",            desc: "Edit selected task" },
  { key: "J",            desc: "Next task" },
  { key: "K",            desc: "Previous task" },
  { key: "D",            desc: "Move to Done" },
  { key: "Esc",          desc: "Close modal / deselect" },
];

function ShortcutsModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <span>Keyboard shortcuts</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-modal-list">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="shortcuts-modal-row">
              <kbd className="shortcuts-kbd">{s.key}</kbd>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const [workspaces, setWorkspaces]             = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [allTasks, setAllTasks]                 = useState([]);
  const [columns, setColumns]                   = useState(EMPTY_COLS);
  const [sprints, setSprints]                   = useState([]);
  const [activeSprint, setActiveSprint]         = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [view, setView]                         = useState("board");

  const [showCreateTask, setShowCreateTask]       = useState(false);
  const [createTaskStatus, setCreateTaskStatus]   = useState("todo");
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showSprintModal, setShowSprintModal]     = useState(false);
  const [detailTask, setDetailTask]               = useState(null);
  const [filters, setFilters] = useState({ search: "", type: "", priority: "", status: "", assignee: "" });

  // UI overlays
  const [cmdOpen, setCmdOpen]           = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Undo state: { msg, undo: async fn }
  const [undoPending, setUndoPending]   = useState(null);
  const undoDataRef                     = useRef(null); // stores the actual data for undo

  // Simple success toast (non-undo)
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

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

  // ── Global keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
                      document.activeElement?.isContentEditable;

      // ⌘K / Ctrl+K — always fires
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(v => !v);
        return;
      }

      // ⌘/ — AI bubble (we just open it via DOM event; AIBubble manages its own state)
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        // dispatch custom event that AIBubble listens to
        window.dispatchEvent(new CustomEvent("taskora:open-ai"));
        return;
      }

      // Shortcuts that should NOT fire when typing in an input
      if (inInput) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openCreateTask("todo");
      } else if (e.key === "/" ) {
        e.preventDefault();
        setCmdOpen(true);
      } else if (e.key === "Escape") {
        setCmdOpen(false);
        setShowShortcuts(false);
        setDetailTask(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line

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

  // ── Delete task — with 5-second undo ─────────────────────────
  const handleDeleteTask = async (taskId) => {
    const taskToDelete = allTasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    // Optimistically remove from UI
    const next = allTasks.filter(t => t.id !== taskId);
    setAllTasks(next);
    setColumns(tasksToColumns(next));

    // Store for potential undo
    undoDataRef.current = { taskId, task: taskToDelete, wsId: currentWorkspace?.id };
    let deleted = false;

    // Show undo toast
    setUndoPending({
      msg: `"${taskToDelete.title}" deleted`,
      undo: async () => {
        deleted = true; // cancel the deletion
        // Restore task in UI immediately
        const restored = [...next, taskToDelete];
        setAllTasks(restored);
        setColumns(tasksToColumns(restored));
        setUndoPending(null);
        showToast("Task restored");
      },
    });

    // After 5 seconds, actually delete if not undone
    setTimeout(async () => {
      if (!deleted) {
        try {
          await api.delete(`/tasks/${taskId}`);
        } catch {
          // If delete fails, restore
          loadTasks(currentWorkspace?.id);
          showToast("Failed to delete task", "error");
        }
        setUndoPending(null);
      }
    }, 5500); // slight buffer after toast dismisses
  };

  // ── Update task ───────────────────────────────────────────────
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

  // ── Real-time socket events ───────────────────────────────────
  useSocket(currentWorkspace?.id, {
    "task:created": (task) => {
      setAllTasks(prev => {
        if (prev.find(t => t.id === task.id)) return prev;
        return [...prev, task];
      });
      setColumns(prev => {
        const col = task.status in prev ? task.status : "todo";
        if (prev[col]?.find(t => t.id === task.id)) return prev;
        return { ...prev, [col]: [...(prev[col] || []), task] };
      });
    },
    "task:updated": (task) => {
      setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...task } : t));
      setColumns(prev => {
        const next = { todo: [], inprogress: [], done: [] };
        [...prev.todo, ...prev.inprogress, ...prev.done]
          .map(t => t.id === task.id ? { ...t, ...task } : t)
          .forEach(t => { if (next[t.status]) next[t.status].push(t); });
        return next;
      });
    },
    "task:deleted": ({ id }) => {
      setAllTasks(prev => prev.filter(t => t.id !== id));
      setColumns(prev => ({
        todo:       prev.todo.filter(t => t.id !== id),
        inprogress: prev.inprogress.filter(t => t.id !== id),
        done:       prev.done.filter(t => t.id !== id),
      }));
    },
  });

  // ── Filter logic ──────────────────────────────────────────────
  const applyFilters = (tasks) => {
    return tasks.filter(t => {
      if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.assignee) {
        if (filters.assignee === "__unassigned__" && t.assigned_user_id) return false;
        if (filters.assignee !== "__unassigned__" && String(t.assigned_user_id) !== filters.assignee) return false;
      }
      return true;
    });
  };

  const filteredTasks   = applyFilters(allTasks);
  const filteredColumns = {
    todo:       filteredTasks.filter(t => t.status === "todo"),
    inprogress: filteredTasks.filter(t => t.status === "inprogress"),
    done:       filteredTasks.filter(t => t.status === "done"),
  };

  const assignees = Array.from(
    new Map(
      allTasks
        .filter(t => t.assigned_user_id && t.assignee_name)
        .map(t => [t.assigned_user_id, { id: t.assigned_user_id, name: t.assignee_name }])
    ).values()
  );

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="app-layout">
        <div className="sidebar-skeleton">
          <div className="skel skel--logo" />
          <div className="skel skel--cmd" />
          {[...Array(5)].map((_, i) => <div key={i} className="skel skel--nav" />)}
        </div>
        <div className="main-area">
          <div className="skel skel--navbar" />
          <div className="board-content" style={{ padding: 24 }}>
            <div className="skel skel--title" />
            <div className="kanban-skeleton">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skel-col">
                  <div className="skel skel--col-header" />
                  {[...Array(3)].map((_, j) => <div key={j} className="skel skel--card" />)}
                </div>
              ))}
            </div>
          </div>
        </div>
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
        onOpenPalette={() => setCmdOpen(true)}
      />

      <div className="main-area">
        <Navbar
          workspaceName={currentWorkspace?.name}
          onCreateTask={() => openCreateTask("todo")}
          user={user}
        />

        {/* ── Content ────────────────────────────────────────────── */}
        <div className="board-content">

          {/* ── Board view ── */}
          {view === "board" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>{currentWorkspace?.name || "Select a workspace"}</h1>
                  <p>{totalTasks} task{totalTasks !== 1 ? "s" : ""} · Press <kbd className="inline-kbd">N</kbd> to add</p>
                </div>
                <div className="board-header-actions">
                  <button className="btn-primary" onClick={() => openCreateTask("todo")}>+ New task</button>
                </div>
              </div>

              <FilterBar
                filters={filters}
                onChange={setFilters}
                assignees={assignees}
                totalTasks={totalTasks}
                filteredCount={filteredTasks.length}
              />

              {currentWorkspace ? (
                <div className="kanban-scroll">
                  <KanbanBoard
                    columns={filteredColumns}
                    onDragEnd={handleDragEnd}
                    onAddTask={openCreateTask}
                    onDeleteTask={handleDeleteTask}
                    onUpdateTask={handleTaskUpdated}
                    onOpenDetail={setDetailTask}
                  />
                </div>
              ) : (
                <div className="empty-state" style={{ marginTop: 80 }}>
                  <div className="empty-state-icon" style={{ fontSize: 56 }}>🗂️</div>
                  <h2 style={{ marginTop: 16, color: "#172b4d" }}>No workspace yet</h2>
                  <p style={{ color: "#5e6c84", marginTop: 8 }}>Create a workspace to start tracking your work</p>
                  <button className="btn-primary" style={{ marginTop: 20 }}
                    onClick={() => setShowWorkspaceModal(true)}>
                    Create workspace
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Summary ── */}
          {view === "summary" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Summary</h1>
                  <p>Overview of {currentWorkspace?.name || "your workspace"}</p>
                </div>
              </div>
              <SummaryDashboard workspaceId={currentWorkspace?.id} />
            </>
          )}


          {/* ── Calendar ── */}
          {view === "calendar" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>Calendar</h1><p>Tasks scheduled by due date</p></div>
                <button className="btn-secondary" onClick={() => openCreateTask("todo")}>+ Add task</button>
              </div>
              <CalendarView tasks={allTasks} workspaceId={currentWorkspace?.id} onTaskClick={setDetailTask} />
            </>
          )}

          {/* ── Sprints ── */}
          {view === "sprints" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Sprint Planning</h1>
                  <p>{sprints.length} sprint{sprints.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="board-header-actions">
                  <button className="btn-secondary" onClick={() => setShowSprintModal(true)}>+ New Sprint</button>
                </div>
              </div>
              {sprints.length === 0 ? (
                <div className="empty-state" style={{ marginTop: 60 }}>
                  <div style={{ fontSize: 56 }}>🏃</div>
                  <h2 style={{ marginTop: 16 }}>No sprints yet</h2>
                  <p style={{ color: "#5e6c84", marginTop: 8 }}>Create a sprint to start planning iterations</p>
                  <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => setShowSprintModal(true)}>
                    Create first sprint
                  </button>
                </div>
              ) : (
                <div>
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

          {/* ── Manager ── */}
          {view === "manager" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>Manager</h1><p>Team workload, capacity, predictions, approvals & audit log</p></div>
              </div>
              <ManagerDashboard workspaceId={currentWorkspace?.id} workspaceName={currentWorkspace?.name} onNavigate={setView} />
            </>
          )}



          {/* ── Integrations ── */}
          {view === "integrations" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>Integrations</h1><p>Connect Slack, GitHub, Jira, and more</p></div>
              </div>
              <IntegrationsPanel workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── AI Risk Heatmap ── */}
          {view === "ai-risk" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>AI Risk Intelligence</h1><p>Per-task risk predictions, heatmap, and prescriptive actions</p></div>
              </div>
              <AIRiskHeatmap workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── NL Chat (accessible via AI bubble; tab kept for direct access) ── */}
          {view === "chat" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>AI Workspace Assistant</h1><p>Ask questions in plain English — or use the bubble ↘</p></div>
              </div>
              <NLChat workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Gantt ── */}
          {view === "gantt" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>Gantt Chart</h1><p>Timeline view of tasks with start and due dates</p></div>
              </div>
              <GanttChart workspaceId={currentWorkspace?.id} />
            </>
          )}


          {/* ── Simulation ── */}
          {view === "simulation" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>What-If Simulation</h1><p>Preview assignment impact before committing</p></div>
              </div>
              <SimulationPanel workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Activity Feed ── */}
          {view === "activity" && (
            <>
              <div className="board-header">
                <div className="board-title-area"><h1>Activity Feed</h1><p>All task and team events across {currentWorkspace?.name || "your workspace"}</p></div>
              </div>
              <ActivityFeed workspaceId={currentWorkspace?.id} />
            </>
          )}

        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
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
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          currentUser={user}
          onClose={() => setDetailTask(null)}
          onUpdate={(updated) => { handleTaskUpdated(updated); setDetailTask(updated); }}
        />
      )}

      {/* ── Command palette ───────────────────────────────────────── */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onViewChange={(v) => { setView(v); setCmdOpen(false); }}
        onCreateTask={() => { openCreateTask("todo"); setCmdOpen(false); }}
        tasks={allTasks}
        currentView={view}
      />

      {/* ── Keyboard shortcuts modal ─────────────────────────────── */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* ── Floating AI bubble ────────────────────────────────────── */}
      <AIBubble workspaceId={currentWorkspace?.id} />

      {/* ── Undo toast ───────────────────────────────────────────── */}
      {undoPending && (
        <UndoToast
          item={undoPending}
          onUndo={undoPending.undo}
          onDismiss={() => setUndoPending(null)}
        />
      )}

      {/* ── Regular toast ────────────────────────────────────────── */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <HelpGuide />
    </div>
  );
}
