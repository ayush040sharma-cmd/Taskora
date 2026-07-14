import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import DemoSessionBadge from "../components/DemoSessionBadge";

/**
 * Desktop layout: fixed left sidebar + top navbar + scrollable content area.
 * All data/state lives in Dashboard.jsx; this is pure layout.
 */
export default function DashboardDesktop({
  sidebarOpen,
  onSidebarToggle,
  onSidebarClose,
  workspaces,
  currentWorkspace,
  onWorkspaceChange,
  onNewWorkspace,
  onDeleteWorkspace,
  activeView,
  onViewChange,
  onOpenPalette,
  onCreateTask,
  onOpenSettings,
  user,
  children,
}) {
  return (
    <>
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={onSidebarClose} />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={onSidebarClose}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={onWorkspaceChange}
        onNewWorkspace={onNewWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        activeView={activeView}
        onViewChange={onViewChange}
        onOpenPalette={onOpenPalette}
        onOpenSettings={onOpenSettings}
      />

      <div className="main-area">
        <Navbar
          workspaceName={currentWorkspace?.name}
          workspaceId={currentWorkspace?.id}
          onCreateTask={onCreateTask}
          onMenuToggle={onSidebarToggle}
          onOpenSettings={onOpenSettings}
          user={user}
        />
        <div className="board-content">
          {children}
        </div>
      </div>

      <DemoSessionBadge />
    </>
  );
}
