import { useState, useEffect, useRef } from "react";
import api from "../api/api";
import { getSocket } from "../hooks/useSocket";
import { useAuth } from "../context/AuthContext";
import { LuBell } from "react-icons/lu";

const IconBell = () => <LuBell size={16} />;

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
  const { user } = useAuth();
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
    if (!user) return;
    fetchCount();
    // Poll every 2 min as a fallback only — socket handles real-time delivery
    const interval = setInterval(fetchCount, 120000);
    return () => clearInterval(interval);
  }, [user]);

  // Real-time: listen on personal socket room for instant notification delivery
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    const handler = (notif) => {
      setCount(c => c + 1);
      setItems(prev => [notif, ...prev].slice(0, 20));
    };
    socket.on("notification", handler);
    return () => socket.off("notification", handler);
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
