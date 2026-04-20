import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const TYPE_ICON = {
  task_assigned:     "📋",
  approval_pending:  "⏳",
  approval_resolved: "✅",
  overload_warning:  "⚠️",
  sla_alert:         "🚨",
  leave_blocked:     "🏖️",
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [open,   setOpen]   = useState(false);
  const [items,  setItems]  = useState([]);
  const [count,  setCount]  = useState(0);
  const ref = useRef(null);

  const fetchCount = async () => {
    try {
      const { data } = await api.get("/notifications/count");
      setCount(data.count);
    } catch {}
  };

  const fetchAll = async () => {
    try {
      const { data } = await api.get("/notifications?limit=20");
      setItems(data);
      setCount(data.filter(n => !n.read).length);
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchAll();
  }, [open]);

  // Click-outside close
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setCount(c => Math.max(0, c - 1));
  };

  const markAll = async () => {
    await api.patch("/notifications/read-all");
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setCount(0);
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="notif-bell" onClick={() => setOpen(v => !v)} title="Notifications">
        <IconBell />
        {count > 0 && <span className="notif-badge">{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span className="notif-title">Notifications</span>
            {count > 0 && (
              <button className="notif-mark-all" onClick={markAll}>Mark all read</button>
            )}
          </div>

          <div className="notif-list">
            {items.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              items.map(n => (
                <div
                  key={n.id}
                  className={`notif-item ${n.read ? "notif-item--read" : ""}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <div className="notif-icon">{TYPE_ICON[n.type] || "🔔"}</div>
                  <div className="notif-body">
                    <div className="notif-item-title">{n.title}</div>
                    {n.body && <div className="notif-item-body">{n.body}</div>}
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && <div className="notif-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
