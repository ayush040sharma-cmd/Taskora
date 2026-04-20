import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import TaskoraLogo from "./TaskoraLogo";

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

const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const IconSprint = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

const IconCapacity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);

const IconManager = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const NAV_ITEMS = [
  { id: "summary",  label: "Summary",   Icon: IconChart },
  { id: "board",    label: "Board",     Icon: IconBoard },
  { id: "workload", label: "Workload",  Icon: IconUsers },
  { id: "calendar", label: "Calendar",  Icon: IconCalendar },
  { id: "sprints",  label: "Sprints",   Icon: IconSprint },
  { id: "manager",  label: "Manager",   Icon: IconManager },
  { id: "capacity", label: "Capacity",  Icon: IconCapacity },
];

export default function Sidebar({ workspaces, currentWorkspace, onWorkspaceChange, onNewWorkspace, activeView, onViewChange }) {
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
          <TaskoraLogo size={26} color="#ffffff" showName nameColor="#ffffff" />
        </div>
      </div>

      {/* Main Nav */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Views</div>
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <div
            key={id}
            className={`sidebar-nav-item ${activeView === id ? "active" : ""}`}
            onClick={() => onViewChange && onViewChange(id)}
          >
            <Icon />
            {label}
          </div>
        ))}
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
