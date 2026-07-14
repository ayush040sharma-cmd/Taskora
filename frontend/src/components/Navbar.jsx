import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import ProfileModal from "./ProfileModal";
import NotificationBell from "./NotificationBell";
import { useTheme } from "../hooks/useTheme";
import api from "../api/api";
import { getInitials } from "../utils/avatar";
import { LuSearch, LuPlus, LuUser, LuSettings, LuLogOut } from "react-icons/lu";

const IconSearch   = () => <LuSearch size={14} />;
const IconPlus     = () => <LuPlus size={14} />;
const IconUser     = () => <LuUser size={15} />;
const IconSettings = () => <LuSettings size={15} />;
const IconLogout   = () => <LuLogOut size={15} />;

export default function Navbar({ workspaceName, workspaceId, onCreateTask, onMenuToggle, onOpenSettings, user }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [myStatus, setMyStatus] = useState(null); // null | "on_leave" | "travel"
  const ref = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    api.get("/capacity/me").then(res => {
      if (res.data.on_leave) setMyStatus("on_leave");
      else if (res.data.travel_mode) setMyStatus("travel");
      else setMyStatus(null);
    }).catch(() => {});
  }, [user?.id]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <>
    <header className="navbar">
      {/* Hamburger — only visible on mobile */}
      <button className="navbar-hamburger" onClick={onMenuToggle} aria-label="Open menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <div className="navbar-breadcrumb">
        <span>Taskora</span>
        <span>/</span>
        <span className="navbar-breadcrumb-current">{workspaceName || "Select a workspace"}</span>
      </div>

      <div className="navbar-search">
        <div className="navbar-search-icon"><IconSearch /></div>
        <input type="text" placeholder="Search tasks… (⌘K)" readOnly style={{ cursor: "pointer" }} />
      </div>

      <div className="navbar-actions">
        <button className="btn-create" onClick={onCreateTask} title="Create a new task">
          <IconPlus />
          New task
        </button>
        <NotificationBell />

        {/* Theme toggle — quick access near notification bell */}
        <button
          className="navbar-theme-btn"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            width: 34, height: 34, borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--column-bg)",
            fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {/* Status pill — shown when on leave or travelling */}
        {myStatus === "on_leave" && (
          <div className="navbar-status-pill navbar-status-pill--leave" title="You are marked as on leave">
            🌴 On Leave
          </div>
        )}
        {myStatus === "travel" && (
          <div className="navbar-status-pill navbar-status-pill--travel" title="You are in travel mode (reduced capacity)">
            ✈️ Travelling
          </div>
        )}

        {/* Avatar + dropdown */}
        <div className="navbar-profile" ref={ref}>
          <button
            className={`navbar-avatar ${myStatus === "on_leave" ? "navbar-avatar--leave" : myStatus === "travel" ? "navbar-avatar--travel" : ""}`}
            onClick={() => setOpen(v => !v)}
            title={user?.name}
          >
            {getInitials(user?.name)}
          </button>

          {open && (
            <div className="profile-dropdown">
              {/* Header */}
              <div className="profile-dropdown-header">
                <div className={`profile-dropdown-avatar ${myStatus === "on_leave" ? "avatar--leave" : myStatus === "travel" ? "avatar--travel" : ""}`}>
                  {getInitials(user?.name)}
                </div>
                <div className="profile-dropdown-info">
                  <div className="profile-dropdown-name">{user?.name}</div>
                  <div className="profile-dropdown-email">{user?.email}</div>
                  {myStatus === "on_leave" && (
                    <div className="profile-status-badge profile-status-badge--leave">🌴 On Leave</div>
                  )}
                  {myStatus === "travel" && (
                    <div className="profile-status-badge profile-status-badge--travel">✈️ Travelling</div>
                  )}
                </div>
              </div>

              <div className="profile-dropdown-divider" />

              {/* Menu items */}
              <div className="profile-dropdown-menu">
                <button className="profile-menu-item" onClick={() => { setOpen(false); setShowProfile(true); }}>
                  <IconUser />
                  <span>Profile</span>
                </button>
                <button className="profile-menu-item" onClick={() => { setOpen(false); onOpenSettings?.(); }}>
                  <IconSettings />
                  <span>Settings</span>
                </button>
              </div>

              <div className="profile-dropdown-divider" />

              <div className="profile-dropdown-menu">
                <button className="profile-menu-item profile-menu-item--danger" onClick={handleLogout}>
                  <IconLogout />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
  </>
  );
}
