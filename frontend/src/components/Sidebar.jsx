import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { canViewSidebar } from "../utils/canAccess";

// ── All views organized by section ─────────────────────────────────────────────
const SECTIONS = [
  {
    label: "WORKSPACE",
    views: [
      { id: "board",          icon: "📋", label: "Board" },
      { id: "summary",        icon: "📊", label: "Summary" },
      { id: "calendar",       icon: "📅", label: "Calendar" },
      { id: "sprints",        icon: "🏃", label: "Sprints" },
      { id: "gantt",          icon: "🗓", label: "Gantt Chart" },
    ],
  },
  {
    label: "TEAM",
    views: [
      { id: "teams",        icon: "🏢", label: "Teams" },
      { id: "manager",      icon: "📌", label: "Manager View" },
      { id: "workload",     icon: "👥", label: "Team Workload" },
      { id: "members",      icon: "👤", label: "Members" },
      { id: "capacity",     icon: "⚡", label: "My Capacity" },
      { id: "collaboration",icon: "🤝", label: "Collaboration" },
      { id: "approvals",    icon: "✅", label: "Approvals" },
    ],
  },
  {
    label: "AI & INSIGHTS",
    views: [
      { id: "ai-risk",      icon: "🔥", label: "AI Risk Map" },
      { id: "analytics",    icon: "📈", label: "Analytics" },
      { id: "simulation",   icon: "🔬", label: "What-If Sim" },
    ],
  },
  {
    label: "MORE",
    views: [
      { id: "activity",     icon: "📡", label: "Activity Feed" },
      { id: "graph",        icon: "🕸",  label: "Dep. Graph" },
      { id: "integrations", icon: "🔗", label: "Integrations" },
    ],
  },
];

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function WorkspaceAvatar({ name, size = 28 }) {
  const colors = ["#3B82F6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
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
  onOpenSettings,
}) {
  const { user, logout, sidebarViews } = useAuth();
  const navigate = useNavigate();
  const [deleteModalWs, setDeleteModalWs]       = useState(null); // workspace object being deleted
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="tkMark_sb" x1="8" y1="20" x2="94" y2="90" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#3B82F6"/>
              <stop offset="1" stopColor="#06B6D4"/>
            </linearGradient>
          </defs>
          <path d="M8 20 L62 20 L94 28 L62 36 L43 36 L43 90 L27 90 L27 36 L8 36 Z" fill="url(#tkMark_sb)"/>
        </svg>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: "-0.2px" }}>
          <span style={{ color: "#E2E8F0" }}>Task</span><span style={{ background: "linear-gradient(90deg,#3B82F6,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>ora</span>
        </span>
      </div>

      {/* ⌘K search launcher */}
      <button className="sidebar-cmd-btn" onClick={onOpenPalette} title="Command palette (⌘K)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="sidebar-nav-scroll">
        {SECTIONS.map(section => {
          const visibleViews = section.views.filter(v => canViewSidebar(v.id, user?.role, sidebarViews));
          if (visibleViews.length === 0) return null;
          return (
            <div key={section.label}>
              <div className="sidebar-section-label">{section.label}</div>
              <nav className="sidebar-nav">
                {visibleViews.map(v => (
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
          );
        })}
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
                onClick={e => { e.stopPropagation(); setDeleteModalWs(ws); setDeleteConfirmText(""); }}
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
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="sidebar-logout"
            title="Settings"
            onClick={() => { onOpenSettings?.(); onClose?.(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
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
      </div>
      {/* Workspace delete — typed confirmation modal */}
      {deleteModalWs && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setDeleteModalWs(null); setDeleteConfirmText(""); } }}
        >
          <div style={{ background: "var(--card-bg, #fff)", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #0f172a)", marginBottom: 8 }}>Delete workspace?</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently delete <strong style={{ color: "var(--text-primary, #0f172a)" }}>{deleteModalWs.name}</strong> and all its tasks, sprints, and members. This cannot be undone.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 6 }}>
              Type <strong>{deleteModalWs.name}</strong> to confirm
            </label>
            <input
              type="text"
              autoFocus
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setDeleteModalWs(null); setDeleteConfirmText(""); }
                if (e.key === "Enter" && deleteConfirmText === deleteModalWs.name) {
                  onDeleteWorkspace?.(deleteModalWs.id);
                  setDeleteModalWs(null); setDeleteConfirmText("");
                }
              }}
              placeholder={deleteModalWs.name}
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--border, #e2e8f0)", borderRadius: 8, fontSize: 14, color: "var(--text-primary, #0f172a)", background: "var(--input-bg, #f8fafc)", outline: "none", boxSizing: "border-box", marginBottom: 16, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setDeleteModalWs(null); setDeleteConfirmText(""); }}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid var(--border, #e2e8f0)", background: "none", fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #64748b)", cursor: "pointer" }}
              >Cancel</button>
              <button
                disabled={deleteConfirmText !== deleteModalWs.name}
                onClick={() => { onDeleteWorkspace?.(deleteModalWs.id); setDeleteModalWs(null); setDeleteConfirmText(""); }}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: deleteConfirmText === deleteModalWs.name ? "#ef4444" : "#fca5a5", fontSize: 13, fontWeight: 700, color: "#fff", cursor: deleteConfirmText === deleteModalWs.name ? "pointer" : "not-allowed", transition: "background 0.15s" }}
              >Delete workspace</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
