import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../hooks/useSocket";

const POLL_INTERVAL = 5000;

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)        return "just now";
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ name, size = 32 }) {
  const COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  const bg = COLORS[(name?.charCodeAt(0) || 0) % COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0,
    }}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Feature card for empty state ─────────────────────────────────────────────
function FeatureCard({ icon, title, desc, bg }) {
  return (
    <div className="ch-feature-card" style={{ background: bg }}>
      <div className="ch-feature-icon">{icon}</div>
      <div className="ch-feature-title">{title}</div>
      <div className="ch-feature-desc">{desc}</div>
    </div>
  );
}

// ── Right sidebar icon button ─────────────────────────────────────────────────
function SidebarItem({ icon, label, active, onClick }) {
  return (
    <button className={`ch-sidebar-item ${active ? "active" : ""}`} onClick={onClick} title={label}>
      <span className="ch-sidebar-icon">{icon}</span>
      <span className="ch-sidebar-label">{label}</span>
    </button>
  );
}

export default function ChannelView({ workspaceId, workspaceName }) {
  const { user } = useAuth();
  const [messages,       setMessages]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [text,           setText]           = useState("");
  const [sending,        setSending]        = useState(false);
  const [banner,         setBanner]         = useState(true);       // onboarding banner
  const [activeSidebar,  setActiveSidebar]  = useState(null);
  const bottomRef = useRef(null);
  const pollRef   = useRef(null);
  const hasMessages = messages.length > 0;

  // ── Load messages ───────────────────────────────────────────────
  const loadMessages = useCallback(async (silent = false) => {
    if (!workspaceId) return;
    if (!silent) setLoading(true);
    try {
      const r = await api.get(`/channels/${workspaceId}/messages?limit=100`);
      setMessages(r.data);
    } catch {}
    finally { if (!silent) setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── Polling every 5 seconds ─────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    pollRef.current = setInterval(() => loadMessages(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [workspaceId, loadMessages]);

  // ── Socket: real-time messages ──────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    const socket = getSocket();
    const handler = (msg) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    socket.on("channel:message", handler);
    return () => socket.off("channel:message", handler);
  }, [workspaceId]);

  // ── Auto-scroll to bottom ───────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ────────────────────────────────────────────────
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.post(`/channels/${workspaceId}/messages`, { content: text.trim() });
      setMessages(prev => [...prev.filter(m => m.id !== r.data.id), r.data]);
      setText("");
      setBanner(false);
    } catch {}
    finally { setSending(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const channelName = workspaceName || "Channel";

  // ── Sidebar panels ───────────────────────────────────────────────
  const SIDEBAR_ITEMS = [
    { id: "followers", icon: "👥", label: "Followers" },
    { id: "search",    icon: "🔍", label: "Search" },
    { id: "replies",   icon: "💬", label: "Replies" },
    { id: "assigned",  icon: "📌", label: "Assigned" },
    { id: "settings",  icon: "⚙️", label: "Settings" },
  ];

  return (
    <div className="ch-root">
      {/* ── Main area ── */}
      <div className="ch-main">
        {/* Messages or empty state */}
        <div className="ch-messages">
          {loading ? (
            <div className="ch-center">
              <div className="af-spinner" />
              <span>Loading channel…</span>
            </div>
          ) : !hasMessages ? (
            /* ── Empty state ── */
            <div className="ch-empty">
              <h2 className="ch-empty-heading">Chat in #{channelName}</h2>
              <p className="ch-empty-sub">
                Collaborate seamlessly across tasks and conversations. Start chatting with your team or connect tasks to stay on top of your work.
              </p>

              <div className="ch-empty-actions">
                <button className="ch-cta-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                  + Add People
                </button>
                <button className="ch-cta-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="8" width="18" height="13" rx="2"/><path d="M1 8l11-5 11 5"/>
                  </svg>
                  Invite via Email
                </button>
              </div>

              <div className="ch-feature-cards">
                <FeatureCard icon="📋" title="Track Tasks"
                  desc="Manage tasks, bugs, people, and more"
                  bg="#f5f3ff" />
                <FeatureCard icon="📄" title="Add Doc"
                  desc="Take notes or create detailed documents"
                  bg="#eff6ff" />
                <FeatureCard icon="🎥" title="Start a Call"
                  desc="Jump on a voice or video call"
                  bg="#f0fdf4" />
              </div>
            </div>
          ) : (
            /* ── Messages list ── */
            <div className="ch-message-list">
              {messages.map((msg, i) => {
                const isMe = msg.sender_id === user?.id;
                const showName = i === 0 || messages[i - 1]?.sender_id !== msg.sender_id;
                return (
                  <div key={msg.id} className={`ch-msg-row ${isMe ? "ch-msg-row--me" : ""}`}>
                    {!isMe && showName && <Avatar name={msg.sender_name} size={28} />}
                    {!isMe && !showName && <div style={{ width: 28 }} />}
                    <div className="ch-msg-content">
                      {showName && !isMe && (
                        <div className="ch-msg-sender">
                          {msg.sender_name}
                          <span className="ch-msg-time">{timeAgo(msg.created_at)}</span>
                        </div>
                      )}
                      <div className={`ch-msg-bubble ${isMe ? "ch-msg-bubble--me" : ""}`}>
                        {msg.content}
                      </div>
                      {(!showName || isMe) && (
                        <div className="ch-msg-time-small">{timeAgo(msg.created_at)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Onboarding banner ── */}
        {banner && !hasMessages && (
          <div className="ch-onboarding-banner">
            <span>👋 Send a message to #{channelName} to get the conversation started!</span>
            <button className="ch-banner-dismiss" onClick={() => setBanner(false)}>Dismiss</button>
          </div>
        )}

        {/* ── Input bar ── */}
        <div className="ch-input-bar">
          <button className="ch-input-icon-btn" title="Attach">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <select className="ch-msg-type">
            <option>Message</option>
          </select>
          <textarea
            className="ch-input-text"
            rows={1}
            placeholder={`Send a message to #${channelName}…`}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="ch-input-icons">
            <button className="ch-input-icon-btn" title="Emoji">😊</button>
            <button className="ch-input-icon-btn" title="Mention">@</button>
            <button className="ch-input-icon-btn" title="Attach">📎</button>
          </div>
          <button
            className="ch-send-btn"
            onClick={send}
            disabled={!text.trim() || sending}
            title="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="ch-sidebar">
        {SIDEBAR_ITEMS.map(item => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeSidebar === item.id}
            onClick={() => setActiveSidebar(v => v === item.id ? null : item.id)}
          />
        ))}
      </div>
    </div>
  );
}
