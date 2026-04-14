import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const IconDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const IconBoard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function Sidebar({ workspaces, currentWorkspace, onWorkspaceChange, onNewWorkspace }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const getInitials = (name = "") =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const getWorkspaceColor = (id) => {
    const colors = ["#0052cc", "#00875a", "#ff5630", "#8777d9", "#ff8b00", "#00b8d9"];
    return colors[id % colors.length];
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">K</div>
          <span className="sidebar-logo-name">KanFlow</span>
        </div>
      </div>

      {/* Main Nav */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Menu</div>
        <div className="sidebar-nav-item active">
          <IconDashboard />
          Dashboard
        </div>
        <div className="sidebar-nav-item">
          <IconBoard />
          Boards
        </div>
      </div>

      {/* Workspaces */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Workspaces</div>
      </div>

      <div className="sidebar-workspace-list">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className={`sidebar-workspace-item ${currentWorkspace?.id === ws.id ? "active" : ""}`}
            onClick={() => onWorkspaceChange(ws)}
          >
            <div
              className="sidebar-workspace-avatar"
              style={{ background: getWorkspaceColor(ws.id) }}
            >
              {getInitials(ws.name)}
            </div>
            <span className="sidebar-workspace-name">{ws.name}</span>
          </div>
        ))}

        <button className="sidebar-add-workspace" onClick={onNewWorkspace}>
          <IconPlus />
          Add workspace
        </button>
      </div>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{getInitials(user?.name)}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout} title="Sign out">
            <IconLogout />
          </button>
        </div>
      </div>
    </aside>
  );
}
