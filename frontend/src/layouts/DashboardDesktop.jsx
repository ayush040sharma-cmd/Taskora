import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

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
      />

      <div className="main-area">
        <Navbar
          workspaceName={currentWorkspace?.name}
          onCreateTask={onCreateTask}
          onMenuToggle={onSidebarToggle}
          user={user}
        />
        <div className="board-content">
          {children}
        </div>
      </div>
    </>
  );
}
