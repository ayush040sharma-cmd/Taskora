import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

// Primary views — always visible
const PRIMARY_VIEWS = [
  { id: "board",    icon: "📋", label: "Board" },
  { id: "summary",  icon: "📊", label: "Summary" },
  { id: "calendar", icon: "📅", label: "Calendar" },
  { id: "sprints",  icon: "🏃", label: "Sprints" },
  { id: "manager",  icon: "🏢", label: "Manager" },
];

// Secondary views — shown when "More" is expanded
const MORE_VIEWS = [
  { id: "gantt",         icon: "🗓", label: "Gantt" },
  { id: "ai-risk",       icon: "🔥", label: "AI Risk" },
  { id: "integrations",  icon: "🔗", label: "Integrations" },
  { id: "activity",      icon: "⚡", label: "Activity" },
  { id: "simulation",    icon: "🔬", label: "Simulate" },
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
  workspaces = [],
  currentWorkspace,
  onWorkspaceChange,
  onNewWorkspace,
  activeView,
  onViewChange,
  onOpenPalette,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);

  // If active view is a "more" view, auto-expand
  const activeIsMore = MORE_VIEWS.some(v => v.id === activeView);

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

      {/* ⌘K launcher */}
      <button className="sidebar-cmd-btn" onClick={onOpenPalette} title="Command palette (⌘K)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>

      {/* Primary views */}
      <div className="sidebar-section-label">VIEWS</div>
      <nav className="sidebar-nav">
        {PRIMARY_VIEWS.map(v => (
          <button
            key={v.id}
            className={`sidebar-nav-item ${activeView === v.id ? "active" : ""}`}
            onClick={() => onViewChange?.(v.id)}
          >
            <span className="sidebar-nav-icon">{v.icon}</span>
            <span>{v.label}</span>
          </button>
        ))}

        {/* More toggle */}
        <button
          className={`sidebar-nav-item sidebar-more-btn ${activeIsMore ? "active" : ""}`}
          onClick={() => setShowMore(v => !v)}
        >
          <span className="sidebar-nav-icon">
            {showMore || activeIsMore ? "▾" : "▸"}
          </span>
          <span>More</span>
        </button>

        {/* More views expanded */}
        {(showMore || activeIsMore) && MORE_VIEWS.map(v => (
          <button
            key={v.id}
            className={`sidebar-nav-item sidebar-nav-item--sub ${activeView === v.id ? "active" : ""}`}
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
