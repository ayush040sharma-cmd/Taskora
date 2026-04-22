import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const NAV_VIEWS = [
  { id: "summary",   icon: "📊", label: "Summary" },
  { id: "board",     icon: "📋", label: "Board" },
  { id: "workload",  icon: "👥", label: "Workload" },
  { id: "calendar",  icon: "📅", label: "Calendar" },
  { id: "sprints",   icon: "🏃", label: "Sprints" },
  { id: "manager",   icon: "🏢", label: "Manager" },
  { id: "capacity",  icon: "⚡", label: "Capacity" },
];

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function WorkspaceAvatar({ name, size = 28 }) {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: colors[idx], display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff",
    }}>
      {getInitials(name)}
    </div>
  );
}

export default function Sidebar({
  workspaces = [],
  currentWorkspace,
  onWorkspaceChange,
  onNewWorkspace,
  activeView,
  onViewChange,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="10" width="4" height="12" rx="1.5" fill="#fff"/>
            <rect x="10" y="6" width="4" height="16" rx="1.5" fill="#fff"/>
            <rect x="18" y="2" width="4" height="20" rx="1.5" fill="#fff"/>
          </svg>
        </div>
        <span className="sidebar-logo-text">Taskora</span>
        <span className="sidebar-ai-badge">AI</span>
      </div>

      {/* Views nav */}
      <div className="sidebar-section-label">VIEWS</div>
      <nav className="sidebar-nav">
        {NAV_VIEWS.map(v => (
          <button
            key={v.id}
            className={`sidebar-nav-item ${activeView === v.id ? "active" : ""}`}
            onClick={() => onViewChange?.(v.id)}
          >
            <span className="sidebar-nav-icon">{v.icon}</span>
            <span>{v.label}</span>
          </button>
        ))}
      </nav>

      {/* Workspaces */}
      <div className="sidebar-section-label" style={{ marginTop: 20 }}>WORKSPACES</div>
      <div className="sidebar-workspaces">
        {workspaces.map(ws => (
          <button
            key={ws.id}
            className={`sidebar-workspace-item ${currentWorkspace?.id === ws.id ? "active" : ""}`}
            onClick={() => onWorkspaceChange?.(ws)}
          >
            <WorkspaceAvatar name={ws.name} />
            <span className="sidebar-workspace-name">{ws.name}</span>
          </button>
        ))}
        <button className="sidebar-workspace-add" onClick={onNewWorkspace}>
          <span className="sidebar-workspace-add-icon">+</span>
          <span>Add workspace</span>
        </button>
      </div>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{getInitials(user?.name)}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
        </div>
        <button
          className="sidebar-logout"
          title="Sign out"
          onClick={() => { logout(); navigate("/"); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}
