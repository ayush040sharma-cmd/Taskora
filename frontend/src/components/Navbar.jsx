import { useState, useEffect } from "react";
import NotificationBell from "./NotificationBell";
import api from "../api/api";
import { LuSearch, LuPlus } from "react-icons/lu";

const IconSearch = () => <LuSearch size={14} />;
const IconPlus   = () => <LuPlus size={14} />;

export default function Navbar({ workspaceName, onCreateTask, onMenuToggle, onOpenPalette, canEdit = true, user }) {
  const [myStatus, setMyStatus] = useState(null); // null | "on_leave" | "travel"

  useEffect(() => {
    if (!user?.id) return;
    api.get("/capacity/me").then(res => {
      if (res.data.on_leave) setMyStatus("on_leave");
      else if (res.data.travel_mode) setMyStatus("travel");
      else setMyStatus(null);
    }).catch(() => {});
  }, [user?.id]);

  return (
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

      <div className="navbar-search" onClick={onOpenPalette} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") onOpenPalette?.(); }}>
        <div className="navbar-search-icon"><IconSearch /></div>
        <input type="text" placeholder="Search tasks… (⌘K)" readOnly style={{ cursor: "pointer" }} tabIndex={-1} />
      </div>

      <div className="navbar-actions">
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

        <NotificationBell />

        {canEdit && (
          <button className="btn-create" onClick={onCreateTask} title="Create a new task">
            <IconPlus />
            New task
          </button>
        )}
      </div>
    </header>
  );
}
