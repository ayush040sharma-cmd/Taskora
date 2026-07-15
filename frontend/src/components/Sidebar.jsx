import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { canViewSidebar } from "../utils/canAccess";
import { getInitials } from "../utils/avatar";
import Logo from "./Logo";
import ProfileModal from "./ProfileModal";
import AccountSettingsModal from "./AccountSettingsModal";
import { useTheme } from "../hooks/useTheme";
import { LuUser, LuUserCog, LuSettings, LuPalette, LuKeyboard, LuLogOut } from "react-icons/lu";

const IconUser     = () => <LuUser size={15} />;
const IconAccount  = () => <LuUserCog size={15} />;
const IconWorkspace= () => <LuSettings size={15} />;
const IconPalette  = () => <LuPalette size={15} />;
const IconKeyboard = () => <LuKeyboard size={15} />;
const IconLogout   = () => <LuLogOut size={15} />;

// ── All views organized by section ─────────────────────────────────────────────
// "YOU" holds the view that's workspace-agnostic (aggregates across every
// workspace the user belongs to) — everything else here is scoped to
// whichever workspace is currently selected below.
//
// Task Approvals live only inside Manager View (its own tab) — there is no
// standalone "Approvals" entry here anymore, it was a duplicate surface for
// the same /approvals data. Sprints and Dependency Graph moved out of their
// own section: sprint planning is everyday planning work (→ WORK), and the
// dependency graph is an analysis tool like AI Risk / Analytics (→ INSIGHTS).
const SECTIONS = [
  {
    label: "YOU",
    views: [
      { id: "today", icon: "☀️", label: "Today" },
    ],
  },
  {
    label: "WORK",
    views: [
      { id: "board",    icon: "📋", label: "Board" },
      { id: "calendar", icon: "📅", label: "Calendar" },
      { id: "summary",  icon: "📊", label: "Summary" },
      { id: "gantt",    icon: "🗓", label: "Gantt Chart" },
      { id: "sprints",  icon: "🏃", label: "Sprints" },
    ],
  },
  {
    label: "TEAM",
    views: [
      { id: "members",      icon: "👤", label: "Members" },
      { id: "workload",     icon: "👥", label: "Team Workload" },
      { id: "capacity",     icon: "⚡", label: "My Capacity" },
      { id: "collaboration",icon: "🤝", label: "Collaboration" },
      { id: "manager",      icon: "📌", label: "Manager View" },
    ],
  },
  {
    label: "INSIGHTS",
    views: [
      { id: "ai-risk",      icon: "🔥", label: "AI Risk Map" },
      { id: "analytics",    icon: "📈", label: "Analytics" },
      { id: "simulation",   icon: "🔬", label: "What-If Sim" },
      { id: "activity",     icon: "📡", label: "Activity Feed" },
      { id: "integrations", icon: "🔗", label: "Integrations" },
      { id: "graph",        icon: "🕸", label: "Dep. Graph" },
    ],
  },
];

// Hidden from the sidebar for a workspace whose workspace_type is
// 'individual' -- there's no team in it to view workload for, manage
// members of, or measure collaboration across.
const TEAM_ONLY_VIEWS = new Set(["members", "workload", "collaboration", "manager"]);

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
  onShowShortcuts,
}) {
  const { user, logout, sidebarViews } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [deleteModalWs, setDeleteModalWs]       = useState(null); // workspace object being deleted
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [profileMenuOpen, setProfileMenuOpen]   = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [accountSection, setAccountSection]     = useState("appearance");
  const profileRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <Logo iconSize={20} wordmarkSize={15} letterSpacing="-0.2px" />
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
          // Individual workspaces have no team to view/manage -- hide the
          // collaboration-only views for this one workspace rather than
          // gating them by platform role like the rest of canViewSidebar.
          const isIndividualWorkspace = currentWorkspace?.workspace_type === "individual";
          const visibleViews = section.views
            .filter(v => canViewSidebar(v.id, user?.role, sidebarViews))
            .filter(v => !isIndividualWorkspace || !TEAM_ONLY_VIEWS.has(v.id));
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

      {/* User footer — single profile entry point: click to open the account menu */}
      <div className="sidebar-footer" ref={profileRef} style={{ position: "relative" }}>
        <button
          className="sidebar-user"
          onClick={() => setProfileMenuOpen(v => !v)}
          style={{ background: "none", border: "none", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}
        >
          <div className="sidebar-user-avatar">{getInitials(user?.name)}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
        </button>

        {profileMenuOpen && (
          <div className="profile-dropdown profile-dropdown--up">
            <div className="profile-dropdown-header">
              <div className="profile-dropdown-avatar">{getInitials(user?.name)}</div>
              <div className="profile-dropdown-info">
                <div className="profile-dropdown-name">{user?.name}</div>
                <div className="profile-dropdown-email">{user?.email}</div>
              </div>
            </div>

            <div className="profile-dropdown-divider" />

            <div className="profile-dropdown-menu">
              <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); setShowProfileModal(true); }}>
                <IconUser />
                <span>Profile</span>
              </button>
              <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); setAccountSection("security"); setShowAccountSettings(true); }}>
                <IconAccount />
                <span>Account Settings</span>
              </button>
              <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); onOpenSettings?.(); onClose?.(); }}>
                <IconWorkspace />
                <span>Workspace Settings</span>
              </button>
            </div>

            <div className="profile-dropdown-divider" />

            <div className="profile-dropdown-menu">
              <div className="profile-menu-item" style={{ cursor: "default" }}>
                <IconPalette />
                <span>Appearance</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (isDark) toggleTheme(); }}
                    style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border)", background: !isDark ? "var(--primary)" : "transparent", color: !isDark ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}
                  >
                    Light
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!isDark) toggleTheme(); }}
                    style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border)", background: isDark ? "var(--primary)" : "transparent", color: isDark ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}
                  >
                    Dark
                  </button>
                </div>
              </div>
              <button className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); onShowShortcuts?.(); }}>
                <IconKeyboard />
                <span>Keyboard Shortcuts</span>
              </button>
            </div>

            <div className="profile-dropdown-divider" />

            <div className="profile-dropdown-menu">
              <button className="profile-menu-item profile-menu-item--danger" onClick={() => { logout(); navigate("/"); }}>
                <IconLogout />
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
      {showAccountSettings && (
        <AccountSettingsModal
          initialSection={accountSection}
          currentWorkspaceId={currentWorkspace?.id}
          onClose={() => setShowAccountSettings(false)}
        />
      )}

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
