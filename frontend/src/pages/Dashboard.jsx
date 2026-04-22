import { useState, useEffect, useCallback } from "react";
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
import DependencyGraph from "../components/DependencyGraph";
import CollaborationScore from "../components/CollaborationScore";
import SimulationPanel from "../components/SimulationPanel";
import AIRiskHeatmap from "../components/AIRiskHeatmap";
import NLChat from "../components/NLChat";
import GanttChart from "../components/GanttChart";
import AnalyticsDashboard from "../components/AnalyticsDashboard";
import HelpGuide from "../components/HelpGuide";
import TaskDetailModal from "../components/TaskDetailModal";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";
import AIInsightsPanel from "../components/AIInsightsPanel";

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
  const [view, setView]                       = useState("board"); // summary | board | workload | calendar | sprints | manager | capacity | members

  const [showCreateTask, setShowCreateTask]       = useState(false);
  const [createTaskStatus, setCreateTaskStatus]   = useState("todo");
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showSprintModal, setShowSprintModal]     = useState(false);
  const [detailTask, setDetailTask]               = useState(null);
  const [filters, setFilters] = useState({ search: "", type: "", priority: "", status: "", assignee: "" });

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

  // ── Real-time socket events ──────────────────────────────────────
  useSocket(currentWorkspace?.id, {
    "task:created": (task) => {
      setAllTasks(prev => {
        if (prev.find(t => t.id === task.id)) return prev; // already exists (own action)
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

  // ── Filter logic ─────────────────────────────────────────────────
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

  // Unique assignees for filter dropdown
  const assignees = Array.from(
    new Map(
      allTasks
        .filter(t => t.assigned_user_id && t.assignee_name)
        .map(t => [t.assigned_user_id, { id: t.assigned_user_id, name: t.assignee_name }])
    ).values()
  );

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
            { id: "summary",  label: "📊 Summary" },
            { id: "board",    label: "📋 Board" },
            { id: "workload", label: "👥 Workload" },
            { id: "calendar", label: "📅 Calendar" },
            { id: "sprints",  label: "🏃 Sprints" },
            { id: "manager",  label: "🏢 Manager" },
            { id: "capacity", label: "⚡ Capacity" },
            { id: "members",       label: "👥 Members" },
            { id: "integrations",  label: "🔗 Integrations" },
            { id: "graph",         label: "🕸 Dependencies" },
            { id: "collaboration", label: "🤝 Collaboration" },
            { id: "simulation",    label: "⚡ Simulate" },
            { id: "ai-risk",       label: "🔥 AI Risk" },
            { id: "chat",          label: "💬 AI Chat" },
            { id: "gantt",         label: "📅 Gantt" },
            { id: "analytics",     label: "📈 Analytics" },
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
          {/* ── Summary view ── */}
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

              {/* AI Insights Panel */}
              <AIInsightsPanel workspaceId={currentWorkspace?.id} />

              {/* Filter bar */}
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
              <CalendarView
                tasks={allTasks}
                workspaceId={currentWorkspace?.id}
                onTaskClick={setDetailTask}
              />
            </>
          )}

          {/* ── Manager Dashboard ── */}
          {view === "manager" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Manager Dashboard</h1>
                  <p>Team workload, predictions, approvals & audit log</p>
                </div>
              </div>
              <AIInsightsPanel workspaceId={currentWorkspace?.id} />
              <ManagerDashboard workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Capacity Settings ── */}
          {view === "capacity" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>My Capacity</h1>
                  <p>Configure your daily hours, travel mode, and leave</p>
                </div>
              </div>
              <CapacityPanel />
            </>
          )}

          {/* ── Members view ── */}
          {view === "members" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Members</h1>
                  <p>Manage who has access to {currentWorkspace?.name || "this workspace"}</p>
                </div>
              </div>
              <MembersPanel workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Integrations view ── */}
          {view === "integrations" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Integrations</h1>
                  <p>Connect Slack, GitHub, Jira, and more</p>
                </div>
              </div>
              <IntegrationsPanel workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── AI Risk Heatmap ── */}
          {view === "ai-risk" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>AI Risk Intelligence</h1>
                  <p>Per-task risk predictions, heatmap, and prescriptive actions</p>
                </div>
              </div>
              <AIRiskHeatmap workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── NL Chat ── */}
          {view === "chat" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>AI Workspace Assistant</h1>
                  <p>Ask questions about your tasks, team, and deadlines in plain English</p>
                </div>
              </div>
              <NLChat workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Gantt Chart ── */}
          {view === "gantt" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Gantt Chart</h1>
                  <p>Timeline view of tasks with start and due dates</p>
                </div>
              </div>
              <GanttChart workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Analytics ── */}
          {view === "analytics" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Analytics</h1>
                  <p>Velocity, throughput, completion trends, and team insights</p>
                </div>
              </div>
              <AnalyticsDashboard workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Simulation view ── */}
          {view === "simulation" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>What-If Simulation</h1>
                  <p>Preview assignment impact before committing</p>
                </div>
              </div>
              <SimulationPanel workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Dependency Graph view ── */}
          {view === "graph" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Dependency Graph</h1>
                  <p>Visualize task dependencies and identify blockers</p>
                </div>
              </div>
              <DependencyGraph workspaceId={currentWorkspace?.id} />
            </>
          )}

          {/* ── Collaboration view ── */}
          {view === "collaboration" && (
            <>
              <div className="board-header">
                <div className="board-title-area">
                  <h1>Team Intelligence</h1>
                  <p>Collaboration scores and engagement analytics</p>
                </div>
              </div>
              <CollaborationScore workspaceId={currentWorkspace?.id} />
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

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          currentUser={user}
          onClose={() => setDetailTask(null)}
          onUpdate={(updated) => {
            handleTaskUpdated(updated);
            setDetailTask(updated);
          }}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      <HelpGuide />
    </div>
  );
}
