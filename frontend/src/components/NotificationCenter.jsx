import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const TYPE_CONFIG = {
  approval_request:    { icon: "📋", color: "text-blue-600",   bg: "bg-blue-50" },
  approval_approved:   { icon: "✅", color: "text-green-600",  bg: "bg-green-50" },
  approval_rejected:   { icon: "❌", color: "text-red-600",    bg: "bg-red-50" },
  approval_escalated:  { icon: "⚡", color: "text-purple-600", bg: "bg-purple-50" },
  approval_info_needed:{ icon: "❓", color: "text-yellow-600", bg: "bg-yellow-50" },
  mention:             { icon: "💬", color: "text-indigo-600", bg: "bg-indigo-50" },
  task_assigned:       { icon: "🎯", color: "text-cyan-600",   bg: "bg-cyan-50" },
  task_due_soon:       { icon: "⏰", color: "text-orange-600", bg: "bg-orange-50" },
  system:              { icon: "🔔", color: "text-gray-600",   bg: "bg-gray-50" },
};

function cfg(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.system;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Bell button shown in the topbar
export function NotificationBell() {
  const { token } = useAuth();
  const [open, setOpen]     = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [unread, setUnread] = useState(0);
  const panelRef = useRef(null);
  const headers  = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/notifications`, {
        headers,
        params: { limit: 30 },
      });
      setNotifs(data);
      setUnread(data.filter(n => !n.read).length);
    } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Real-time: listen on socket via window event (fired from notificationService)
  useEffect(() => {
    const handler = (e) => {
      setNotifs(prev => [e.detail, ...prev]);
      setUnread(c => c + 1);
    };
    window.addEventListener("taskora:notification", handler);
    return () => window.removeEventListener("taskora:notification", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function markRead(id) {
    try {
      await axios.put(`${API}/api/notifications/${id}/read`, {}, { headers });
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnread(c => Math.max(0, c - 1));
    } catch {}
  }

  async function markAllRead() {
    try {
      await axios.put(`${API}/api/notifications/read-all`, {}, { headers });
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch {}
  }

  const FILTER_TYPES = [
    { id: "all",      label: "All" },
    { id: "approval", label: "Approvals" },
    { id: "mention",  label: "Mentions" },
    { id: "task",     label: "Tasks" },
  ];

  const filtered = notifs.filter(n => {
    if (filter === "all")      return true;
    if (filter === "approval") return n.type?.startsWith("approval");
    if (filter === "mention")  return n.type === "mention";
    if (filter === "task")     return n.type?.startsWith("task");
    return true;
  });

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border z-50 flex flex-col max-h-[520px]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 px-3 py-2 border-b">
            {FILTER_TYPES.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`text-xs px-3 py-1 rounded-full transition ${
                  filter === f.id
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <div className="text-3xl mb-2">🔔</div>
                No notifications yet
              </div>
            ) : (
              filtered.map(n => {
                const c = cfg(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition ${
                      !n.read ? "bg-indigo-50/40" : ""
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${c.bg}`}>
                      {c.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${!n.read ? "text-gray-900" : "text-gray-600"} truncate`}>
                        {n.title}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</div>
                      <div className="text-xs text-gray-300 mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Full-page notification center (routed view)
export default function NotificationCenter() {
  const { token } = useAuth();
  const [notifs, setNotifs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/notifications`, {
        headers,
        params: { limit: 100 },
      });
      setNotifs(data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id) {
    await axios.put(`${API}/api/notifications/${id}/read`, {}, { headers }).catch(() => {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await axios.put(`${API}/api/notifications/read-all`, {}, { headers }).catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  const FILTERS = [
    { id: "all",      label: "All" },
    { id: "unread",   label: "Unread" },
    { id: "approval", label: "Approvals" },
    { id: "mention",  label: "Mentions" },
    { id: "task",     label: "Tasks" },
  ];

  const filtered = notifs.filter(n => {
    if (filter === "all")      return true;
    if (filter === "unread")   return !n.read;
    if (filter === "approval") return n.type?.startsWith("approval");
    if (filter === "mention")  return n.type === "mention";
    if (filter === "task")     return n.type?.startsWith("task");
    return true;
  });

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-indigo-600 hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-sm px-4 py-1.5 rounded-full border transition ${
              filter === f.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "text-gray-600 border-gray-200 hover:border-indigo-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-gray-400 py-16">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <div className="text-4xl mb-3">🔔</div>
          <div>Nothing here yet.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const c = cfg(n.type);
            return (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition hover:shadow-sm ${
                  !n.read ? "bg-indigo-50/50 border-indigo-100" : "bg-white"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${c.bg}`}>
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${!n.read ? "text-gray-900" : "text-gray-600"}`}>
                    {n.title}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{n.body}</div>
                  <div className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
