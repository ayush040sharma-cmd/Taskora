import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

// ── All views organized by section ─────────────────────────────────────────────
const SECTIONS = [
  {
    label: "WORKSPACE",
    views: [
      { id: "board",        icon: "📋", label: "Board" },
      { id: "summary",      icon: "📊", label: "Summary" },
      { id: "calendar",     icon: "📅", label: "Calendar" },
      { id: "sprints",      icon: "🏃", label: "Sprints" },
      { id: "gantt",        icon: "🗓", label: "Gantt Chart" },
    ],
  },
  {
    label: "TEAM",
    views: [
      { id: "manager",      icon: "🏢", label: "Manager View" },
      { id: "workload",     icon: "👥", label: "Team Workload" },
      { id: "members",      icon: "👤", label: "Members" },
      { id: "capacity",     icon: "⚡", label: "My Capacity" },
      { id: "collaboration",icon: "🤝", label: "Collaboration" },
    ],
  },
  {
    label: "AI & INSIGHTS",
    views: [
      { id: "ai-risk",      icon: "🔥", label: "AI Risk Map" },
      { id: "analytics",    icon: "📈", label: "Analytics" },
      { id: "chat",          icon: "🧠", label: "AI Assistant" },
      { id: "simulation",   icon: "🔬", label: "What-If Sim" },
    ],
  },
  {
    label: "MORE",
    views: [
      { id: "activity",     icon: "⚡", label: "Activity Feed" },
      { id: "graph",        icon: "🕸",  label: "Dep. Graph" },
      { id: "integrations", icon: "🔗", label: "Integrations" },
    ],
  },
];

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function WorkspaceAvatar({ name, size = 28 }) {
  const colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
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
  open = false,
  onClose,
  workspaces = [],
  currentWorkspace,
  onWorkspaceChange,
  onNewWorkspace,
  onDeleteWorkspace,
  activeView,
  onViewChange,
  onOpenPalette,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
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

      {/* ⌘K search launcher */}
      <button className="sidebar-cmd-btn" onClick={onOpenPalette} title="Command palette (⌘K)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>

      {/* All sections — no locks, no "More" dropdown */}
      <div className="sidebar-nav-scroll">
        {SECTIONS.map(section => (
          <div key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            <nav className="sidebar-nav">
              {section.views.map(v => (
                <button
                  key={v.id}
                  className={`sidebar-nav-item ${activeView === v.id ? "active" : ""}`}
                  onClick={() => { onViewChange?.(v.id); onClose?.(); }}
                >
                  <span className="sidebar-nav-icon">{v.icon}</span>
                  <span>{v.label}</span>
                </button>
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* Workspaces */}
      <div className="sidebar-section-label" style={{ marginTop: 12 }}>WORKSPACES</div>
      <div className="sidebar-workspaces">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={`sidebar-workspace-item ${currentWorkspace?.id === ws.id ? "active" : ""}`}
          >
            <button className="sidebar-ws-select" onClick={() => onWorkspaceChange?.(ws)}>
              <WorkspaceAvatar name={ws.name} />
              <span className="sidebar-workspace-name">{ws.name}</span>
            </button>
            {workspaces.length > 1 && (
              <button
                className="sidebar-ws-delete"
                title="Delete workspace"
                onClick={e => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${ws.name}"?\n\nThis will permanently delete all tasks. This cannot be undone.`)) {
                    onDeleteWorkspace?.(ws.id);
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
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
