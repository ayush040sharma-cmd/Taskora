import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DemoSessionBadge from "../components/DemoSessionBadge";

/* ── Bottom tab definitions ─────────────────────────────── */
const TABS = [
  { id: "board",    icon: "📋", label: "Board" },
  { id: "calendar", icon: "📅", label: "Calendar" },
  { id: "summary",  icon: "📊", label: "Summary" },
  { id: "manager",  icon: "🏢", label: "Manager" },
  { id: "more",     icon: "⋯",  label: "More" },
];

const MORE_ITEMS = [
  { id: "today",        icon: "☀️", label: "Today" },
  { id: "my-tasks",     icon: "✅", label: "My Tasks" },
  { id: "sprints",      icon: "🏃", label: "Sprints" },
  { id: "gantt",        icon: "🗓", label: "Gantt" },
  { id: "activity",     icon: "⚡", label: "Activity" },
  { id: "integrations", icon: "🔗", label: "Integrations" },
  { id: "ai-risk",      icon: "🔥", label: "AI Risk" },
  { id: "simulation",   icon: "🔬", label: "Simulate" },
];

/* ── Workspace switcher sheet ──────────────────────────── */
function WorkspaceSheet({ workspaces, current, onSelect, onNew, onClose }) {
  return (
    <div className="mob-sheet-overlay" onClick={onClose}>
      <div className="mob-sheet" onClick={e => e.stopPropagation()}>
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-title">Workspaces</div>
        {workspaces.map(ws => (
          <button
            key={ws.id}
            className={`mob-sheet-item ${current?.id === ws.id ? "mob-sheet-item--active" : ""}`}
            onClick={() => { onSelect(ws); onClose(); }}
          >
            <div className="mob-ws-avatar" style={{ background: avatarColor(ws.name) }}>
              {initials(ws.name)}
            </div>
            <span>{ws.name}</span>
            {current?.id === ws.id && <span className="mob-sheet-check">✓</span>}
          </button>
        ))}
        <button className="mob-sheet-item mob-sheet-item--add" onClick={() => { onNew(); onClose(); }}>
          <div className="mob-ws-avatar mob-ws-avatar--add">+</div>
          <span>Add workspace</span>
        </button>
      </div>
    </div>
  );
}

/* ── "More" sheet ──────────────────────────────────────── */
function MoreSheet({ onSelect, onClose }) {
  return (
    <div className="mob-sheet-overlay" onClick={onClose}>
      <div className="mob-sheet" onClick={e => e.stopPropagation()}>
        <div className="mob-sheet-handle" />
        <div className="mob-sheet-title">More views</div>
        <div className="mob-more-grid">
          {MORE_ITEMS.map(item => (
            <button
              key={item.id}
              className="mob-more-tile"
              onClick={() => { onSelect(item.id); onClose(); }}
            >
              <span className="mob-more-icon">{item.icon}</span>
              <span className="mob-more-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Profile sheet ─────────────────────────────────────── */
function ProfileSheet({ user, onClose, onLogout }) {
  return (
    <div className="mob-sheet-overlay" onClick={onClose}>
      <div className="mob-sheet" onClick={e => e.stopPropagation()}>
        <div className="mob-sheet-handle" />
        <div className="mob-profile-header">
          <div className="mob-profile-avatar">{initials(user?.name)}</div>
          <div>
            <div className="mob-profile-name">{user?.name}</div>
            <div className="mob-profile-email">{user?.email}</div>
            {user?.plan && (
              <div className="mob-profile-plan">{user.plan.toUpperCase()}</div>
            )}
          </div>
        </div>
        <button className="mob-sheet-item mob-sheet-item--danger" onClick={onLogout}>
          <span>🚪</span>
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────── */
function initials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}
const COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
function avatarColor(name = "") {
  return COLORS[name.charCodeAt(0) % COLORS.length];
}

/* ═══════════════════════════════════════════════════════════
   Main mobile layout wrapper — renders the top header,
   content slot, and bottom tab bar.
   All data state lives in Dashboard.jsx; this is pure UI.
═══════════════════════════════════════════════════════════ */
export default function DashboardMobile({
  workspaces,
  currentWorkspace,
  onWorkspaceChange,
  onNewWorkspace,
  activeView,
  onViewChange,
  onCreateTask,
  children,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showWsSheet, setShowWsSheet] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);

  const activeTab = TABS.find(t => t.id === activeView) ? activeView : "more";

  function handleTabPress(tabId) {
    if (tabId === "more") {
      setShowMoreSheet(true);
    } else {
      onViewChange(tabId);
    }
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="mob-root">
      {/* ── Top header ─────────────────────────────────────── */}
      <header className="mob-header">
        <button className="mob-ws-btn" onClick={() => setShowWsSheet(true)}>
          <div className="mob-ws-avatar-sm" style={{ background: avatarColor(currentWorkspace?.name || "") }}>
            {initials(currentWorkspace?.name || "")}
          </div>
          <span className="mob-ws-name">{currentWorkspace?.name || "Workspace"}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        <div className="mob-header-actions">
          <button className="mob-icon-btn" onClick={onCreateTask} title="New task">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button className="mob-avatar-btn" onClick={() => setShowProfileSheet(true)}>
            {initials(user?.name)}
          </button>
        </div>
      </header>

      <DemoSessionBadge variant="top-banner" />

      {/* ── Scrollable content ─────────────────────────────── */}
      <main className="mob-content">
        {children}
      </main>

      {/* ── Bottom tab bar ─────────────────────────────────── */}
      <nav className="mob-tabbar">
        {TABS.map(tab => {
          const isActive = tab.id === "more"
            ? MORE_ITEMS.some(m => m.id === activeView)
            : activeView === tab.id;
          return (
            <button
              key={tab.id}
              className={`mob-tab ${isActive ? "mob-tab--active" : ""}`}
              onClick={() => handleTabPress(tab.id)}
            >
              <span className="mob-tab-icon">{tab.icon}</span>
              <span className="mob-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Sheets ─────────────────────────────────────────── */}
      {showWsSheet && (
        <WorkspaceSheet
          workspaces={workspaces}
          current={currentWorkspace}
          onSelect={onWorkspaceChange}
          onNew={onNewWorkspace}
          onClose={() => setShowWsSheet(false)}
        />
      )}
      {showMoreSheet && (
        <MoreSheet
          onSelect={onViewChange}
          onClose={() => setShowMoreSheet(false)}
        />
      )}
      {showProfileSheet && (
        <ProfileSheet
          user={user}
          onClose={() => setShowProfileSheet(false)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
