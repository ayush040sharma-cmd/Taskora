import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { canViewSidebar, canAccess } from "../utils/canAccess";
import { PLAN_LABELS } from "../config/features";

const ALL_VIEWS = [
  { id: "board",        icon: "📋", label: "Board",        primary: true },
  { id: "summary",      icon: "📊", label: "Summary",      primary: true },
  { id: "calendar",     icon: "📅", label: "Calendar",     primary: true },
  { id: "sprints",      icon: "🏃", label: "Sprints",      primary: true,  plan: "pro" },
  { id: "manager",      icon: "🏢", label: "Manager",      primary: true },
  { id: "gantt",        icon: "🗓", label: "Gantt",                         plan: "pro" },
  { id: "ai-risk",      icon: "🔥", label: "AI Risk",                       plan: "enterprise" },
  { id: "integrations", icon: "🔗", label: "Integrations",                  plan: "enterprise" },
  { id: "activity",     icon: "⚡", label: "Activity" },
  { id: "simulation",   icon: "🔬", label: "Simulate",                      plan: "enterprise" },
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

function PlanLock({ plan }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      color: plan === "enterprise" ? "#c4b5fd" : "#a5b4fc",
      background: plan === "enterprise" ? "rgba(139,92,246,0.15)" : "rgba(99,102,241,0.15)",
      border: `1px solid ${plan === "enterprise" ? "rgba(139,92,246,0.3)" : "rgba(99,102,241,0.3)"}`,
      borderRadius: 4,
      padding: "1px 5px",
      marginLeft: "auto",
      flexShrink: 0,
    }}>
      {PLAN_LABELS[plan]}
    </span>
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
  const [showMore, setShowMore] = useState(false);

  const role = user?.onboarding_role || "member";
  const plan = user?.plan || "free";
  const isAdmin = user?.is_admin ?? false;

  // Filter views by role visibility
  const visibleViews = ALL_VIEWS.filter(v => canViewSidebar(v.id, role));
  const primaryViews = visibleViews.filter(v => v.primary);
  const moreViews = visibleViews.filter(v => !v.primary);

  const activeIsMore = moreViews.some(v => v.id === activeView);

  function handleViewClick(view) {
    const allowed = !view.plan || canAccess(view.id, plan, isAdmin);
    if (!allowed) {
      navigate("/pricing");
      return;
    }
    onViewChange?.(view.id);
  }

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        {/* Close button — only visible on mobile */}
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

      {/* Plan badge */}
      {plan !== "free" && (
        <div style={{
          margin: "0 10px 8px",
          padding: "4px 10px",
          background: plan === "enterprise" ? "rgba(139,92,246,0.1)" : "rgba(99,102,241,0.1)",
          border: `1px solid ${plan === "enterprise" ? "rgba(139,92,246,0.2)" : "rgba(99,102,241,0.2)"}`,
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 600,
          color: plan === "enterprise" ? "#c4b5fd" : "#a5b4fc",
          textAlign: "center",
        }}>
          {plan === "enterprise" ? "🏢" : "⚡"} {PLAN_LABELS[plan]} Plan
        </div>
      )}

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
        {primaryViews.map(v => {
          const locked = v.plan && !canAccess(v.id, plan);
          return (
            <button
              key={v.id}
              className={`sidebar-nav-item ${activeView === v.id ? "active" : ""} ${locked ? "locked" : ""}`}
              onClick={() => handleViewClick(v)}
              title={locked ? `Requires ${PLAN_LABELS[v.plan]} plan` : undefined}
              style={{ opacity: locked ? 0.6 : 1 }}
            >
              <span className="sidebar-nav-icon">{v.icon}</span>
              <span style={{ flex: 1 }}>{v.label}</span>
              {locked && <PlanLock plan={v.plan} />}
            </button>
          );
        })}

        {moreViews.length > 0 && (
          <>
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
            {(showMore || activeIsMore) && moreViews.map(v => {
              const locked = v.plan && !canAccess(v.id, plan);
              return (
                <button
                  key={v.id}
                  className={`sidebar-nav-item sidebar-nav-item--sub ${activeView === v.id ? "active" : ""}`}
                  onClick={() => handleViewClick(v)}
                  title={locked ? `Requires ${PLAN_LABELS[v.plan]} plan` : undefined}
                  style={{ opacity: locked ? 0.6 : 1 }}
                >
                  <span className="sidebar-nav-icon">{v.icon}</span>
                  <span style={{ flex: 1 }}>{v.label}</span>
                  {locked && <PlanLock plan={v.plan} />}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Upgrade CTA for free users — hidden for admin */}
      {plan === "free" && !isAdmin && (
        <button
          onClick={() => navigate("/pricing")}
          style={{
            margin: "12px 10px 0",
            padding: "10px 12px",
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 10,
            color: "#a5b4fc",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            width: "calc(100% - 20px)",
          }}
        >
          ⚡ Upgrade plan
          <div style={{ color: "#6366f1", fontSize: 11, fontWeight: 400, marginTop: 2 }}>
            Unlock Gantt, Sprints, AI & more
          </div>
        </button>
      )}

      {/* Workspaces */}
      <div className="sidebar-section-label" style={{ marginTop: 20 }}>WORKSPACES</div>
      <div className="sidebar-workspaces">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={`sidebar-workspace-item ${currentWorkspace?.id === ws.id ? "active" : ""}`}
          >
            <button
              className="sidebar-ws-select"
              onClick={() => onWorkspaceChange?.(ws)}
            >
              <WorkspaceAvatar name={ws.name} />
              <span className="sidebar-workspace-name">{ws.name}</span>
            </button>
            {workspaces.length > 1 && (
              <button
                className="sidebar-ws-delete"
                title="Delete workspace"
                onClick={e => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${ws.name}"?\n\nThis will permanently delete the workspace and ALL its tasks. This cannot be undone.`)) {
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
