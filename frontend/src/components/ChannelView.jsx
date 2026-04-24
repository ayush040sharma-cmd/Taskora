import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../hooks/useSocket";

const POLL_INTERVAL = 5000;

const EMOJIS = [
  "😀","😂","🥲","😍","🤔","😮","😢","😎","🤗","🙄",
  "👍","👎","👋","🙏","💪","🤝","👀","✌️","🫡","🫶",
  "❤️","🔥","⚡","🎉","✅","❌","💡","🚀","📋","🐛",
  "⏰","📌","🏆","🎯","💬","🔔","⭐","💯","🎊","🆕",
];

const SIDEBAR_ITEMS = [
  { id: "followers", icon: "👥", label: "Followers" },
  { id: "search",    icon: "🔍", label: "Search" },
  { id: "replies",   icon: "💬", label: "Replies" },
  { id: "assigned",  icon: "📌", label: "Assigned" },
  { id: "settings",  icon: "⚙️", label: "Settings" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function FeatureCard({ icon, title, desc, bg, onClick }) {
  return (
    <div className="ch-feature-card" style={{ background: bg, cursor: "pointer" }} onClick={onClick}>
      <div className="ch-feature-icon">{icon}</div>
      <div className="ch-feature-title">{title}</div>
      <div className="ch-feature-desc">{desc}</div>
    </div>
  );
}

// ── Add People Modal ──────────────────────────────────────────────────────────
function AddPeopleModal({ workspaceId, onClose }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [added, setAdded] = useState([]);
  const [done,  setDone]  = useState(false);

  useEffect(() => {
    if (!query) { setUsers([]); return; }
    const t = setTimeout(async () => {
      try { const r = await api.get(`/workload/users?q=${encodeURIComponent(query)}`); setUsers(r.data); }
      catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title">Add People to Channel</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 600, color: "#172b4d" }}>
                {added.length} person{added.length !== 1 ? "s" : ""} added to channel!
              </div>
            </div>
          ) : (
            <>
              <input className="modal-input" placeholder="Search by name or email…"
                value={query} onChange={e => setQuery(e.target.value)} autoFocus />
              {users.length > 0 && (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                  {users.map(u => (
                    <div key={u.id} className="user-dropdown-item" onClick={() => {
                      if (!added.find(a => a.id === u.id)) setAdded(p => [...p, u]);
                      setQuery(""); setUsers([]);
                    }}>
                      <div className="user-dropdown-avatar">{u.name.slice(0,2).toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div className="user-dropdown-name">{u.name}</div>
                        <div className="user-dropdown-email">{u.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {added.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>To be added:</div>
                  {added.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                      <div className="user-dropdown-avatar">{u.name.slice(0,2).toUpperCase()}</div>
                      <span style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{u.name}</span>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14 }}
                        onClick={() => setAdded(p => p.filter(a => a.id !== u.id))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>{done ? "Close" : "Cancel"}</button>
          {!done && (
            <button className="btn-modal-submit" disabled={added.length === 0}
              onClick={() => setDone(true)}>
              Add {added.length > 0 ? `${added.length} person${added.length !== 1 ? "s" : ""}` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Invite via Email Modal ────────────────────────────────────────────────────
function InviteEmailModal({ workspaceName, onClose }) {
  const [emails, setEmails] = useState("");
  const [sent,   setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!emails.trim()) return;
    setLoading(true);
    // Simulate async send (real impl would POST to /workspaces/invite)
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <span className="modal-title">Invite via Email</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {sent ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📨</div>
              <div style={{ fontWeight: 600, color: "#172b4d" }}>Invites sent!</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                Invitation emails have been dispatched to your teammates.
              </div>
            </div>
          ) : (
            <>
              <label className="modal-label">Email address(es)</label>
              <textarea className="modal-textarea" placeholder="colleague@company.com, another@company.com"
                value={emails} onChange={e => setEmails(e.target.value)} rows={3} autoFocus />
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                Separate multiple emails with commas. They'll be invited to join <strong>{workspaceName || "this workspace"}</strong>.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>{sent ? "Close" : "Cancel"}</button>
          {!sent && (
            <button className="btn-modal-submit" onClick={send} disabled={!emails.trim() || loading}>
              {loading ? "Sending…" : "Send Invites"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Start a Call Modal ────────────────────────────────────────────────────────
function StartCallModal({ channelName, onClose }) {
  const link = `${window.location.origin}/call/${(channelName || "channel").replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <span className="modal-title">🎥 Start a Call</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: "center", padding: "8px 0 8px" }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>📞</div>
            <div style={{ fontWeight: 600, color: "#172b4d", marginBottom: 4 }}>
              Start a call in #{channelName}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Share this link with your team to join.
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#64748b", wordBreak: "break-all", textAlign: "left", marginBottom: 12 }}>
              {link}
            </div>
            <button className="btn-primary" onClick={copy} style={{ width: "100%" }}>
              {copied ? "✓ Copied!" : "📋 Copy Call Link"}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-modal-submit" onClick={() => { copy(); onClose(); }}>Start Call</button>
        </div>
      </div>
    </div>
  );
}

// ── + Attach menu ─────────────────────────────────────────────────────────────
function PlusMenu({ onFile, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { icon: "📎", label: "Attach File",   action: onFile },
    { icon: "📋", label: "Link Task",     action: onClose },
    { icon: "📄", label: "Share Doc",     action: onClose },
    { icon: "🖼",  label: "Upload Image", action: () => { onFile(); onClose(); } },
  ];

  return (
    <div ref={ref} className="ch-plus-menu">
      {items.map(it => (
        <button key={it.label} className="ch-plus-menu-item" onClick={() => { it.action(); onClose(); }}>
          <span>{it.icon}</span> {it.label}
        </button>
      ))}
    </div>
  );
}

// ── Sidebar Panel ─────────────────────────────────────────────────────────────
function SidebarPanel({ activeId, messages, onClose, workspaceId }) {
  const [panelMembers,  setPanelMembers]  = useState([]);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [settingsName,  setSettingsName]  = useState("");
  const [settingsNotif, setSettingsNotif] = useState("All messages");
  const [settingsDesc,  setSettingsDesc]  = useState("");
  const [saved,         setSaved]         = useState(false);

  useEffect(() => {
    if ((activeId === "followers" || activeId === "assigned") && workspaceId) {
      api.get(`/workload/users?q=`).then(r => setPanelMembers(r.data)).catch(() => {});
    }
  }, [activeId, workspaceId]);

  if (!activeId) return null;

  const TITLES = {
    followers: "👥 Followers",
    search:    "🔍 Search",
    replies:   "💬 Replies",
    assigned:  "📌 Assigned (@mentions)",
    settings:  "⚙️ Settings",
  };

  const filteredMsgs    = searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : messages;
  const mentionedMsgs   = messages.filter(m => m.content.includes("@"));

  return (
    <div className="ch-side-panel">
      <div className="ch-side-panel-header">
        <span>{TITLES[activeId]}</span>
        <button className="ch-side-panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="ch-side-panel-body">

        {/* Followers */}
        {activeId === "followers" && (
          panelMembers.length === 0
            ? <div className="ch-panel-empty">No workspace members found.</div>
            : panelMembers.map(u => (
              <div key={u.id} className="ch-panel-member-row">
                <Avatar name={u.name} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#172b4d" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                </div>
              </div>
            ))
        )}

        {/* Search */}
        {activeId === "search" && (
          <>
            <input className="modal-input" placeholder="Search messages…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ marginBottom: 8 }} autoFocus />
            {messages.length === 0 && <div className="ch-panel-empty">No messages yet.</div>}
            {messages.length > 0 && searchQuery && filteredMsgs.length === 0 && (
              <div className="ch-panel-empty">No messages match "{searchQuery}"</div>
            )}
            {(searchQuery ? filteredMsgs : messages).map(m => (
              <div key={m.id} className="ch-panel-msg-result">
                <div className="ch-panel-msg-sender">{m.sender_name}</div>
                <div className="ch-panel-msg-text">{m.content}</div>
                <div className="ch-panel-msg-time">{timeAgo(m.created_at)}</div>
              </div>
            ))}
          </>
        )}

        {/* Replies */}
        {activeId === "replies" && (
          messages.length === 0
            ? <div className="ch-panel-empty">No messages to reply to yet.</div>
            : [...messages].reverse().slice(0, 20).map(m => (
              <div key={m.id} className="ch-panel-msg-result">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Avatar name={m.sender_name} size={20} />
                  <div className="ch-panel-msg-sender">{m.sender_name}</div>
                </div>
                <div className="ch-panel-msg-text">{m.content}</div>
                <div className="ch-panel-msg-time">{timeAgo(m.created_at)}</div>
              </div>
            ))
        )}

        {/* Assigned (@mentions) */}
        {activeId === "assigned" && (
          mentionedMsgs.length === 0
            ? <div className="ch-panel-empty">No @mentions in this channel yet.</div>
            : mentionedMsgs.map(m => (
              <div key={m.id} className="ch-panel-msg-result">
                <div className="ch-panel-msg-sender">{m.sender_name}</div>
                <div className="ch-panel-msg-text">{m.content}</div>
                <div className="ch-panel-msg-time">{timeAgo(m.created_at)}</div>
              </div>
            ))
        )}

        {/* Settings */}
        {activeId === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {saved && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#15803d", fontWeight: 500 }}>
                ✓ Settings saved
              </div>
            )}
            <div>
              <label className="modal-label">Channel name</label>
              <input className="modal-input" value={settingsName} onChange={e => setSettingsName(e.target.value)}
                placeholder="e.g. general, design, engineering" style={{ marginTop: 4 }} />
            </div>
            <div>
              <label className="modal-label">Description</label>
              <textarea className="modal-textarea" value={settingsDesc} onChange={e => setSettingsDesc(e.target.value)}
                placeholder="What is this channel for?" style={{ marginTop: 4 }} rows={3} />
            </div>
            <div>
              <label className="modal-label">Notifications</label>
              <select className="modal-select" value={settingsNotif} onChange={e => setSettingsNotif(e.target.value)} style={{ marginTop: 4 }}>
                <option>All messages</option>
                <option>Mentions only</option>
                <option>Nothing</option>
              </select>
            </div>
            <button className="btn-primary" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}>
              Save Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ChannelView({ workspaceId, workspaceName, onNavigate }) {
  const { user } = useAuth();
  const [messages,      setMessages]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [text,          setText]          = useState("");
  const [sending,       setSending]       = useState(false);
  const [banner,        setBanner]        = useState(true);
  const [activeSidebar, setActiveSidebar] = useState(null);
  const [showEmoji,     setShowEmoji]     = useState(false);
  const [showPlusMenu,  setShowPlusMenu]  = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [showInvite,    setShowInvite]    = useState(false);
  const [showCall,      setShowCall]      = useState(false);
  const [mentionQuery,  setMentionQuery]  = useState(null);
  const [mentionUsers,  setMentionUsers]  = useState([]);

  const bottomRef   = useRef(null);
  const pollRef     = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef  = useRef(null);
  const hasMessages  = messages.length > 0;
  const channelName  = workspaceName || "Channel";

  // ── Load messages ─────────────────────────────────────────────────
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

  useEffect(() => {
    if (!workspaceId) return;
    pollRef.current = setInterval(() => loadMessages(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [workspaceId, loadMessages]);

  // ── Socket real-time ──────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    const socket = getSocket();
    const handler = (msg) => setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    socket.on("channel:message", handler);
    return () => socket.off("channel:message", handler);
  }, [workspaceId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── @ mention search ──────────────────────────────────────────────
  useEffect(() => {
    if (mentionQuery === null) { setMentionUsers([]); return; }
    const t = setTimeout(async () => {
      try { const r = await api.get(`/workload/users?q=${encodeURIComponent(mentionQuery)}`); setMentionUsers(r.data); }
      catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  // ── Send message ──────────────────────────────────────────────────
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.post(`/channels/${workspaceId}/messages`, { content: text.trim() });
      setMessages(prev => [...prev.filter(m => m.id !== r.data.id), r.data]);
      setText(""); setBanner(false); setMentionQuery(null); setShowEmoji(false);
    } catch {}
    finally { setSending(false); }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(val[lastAt - 1]))) {
      setMentionQuery(val.slice(lastAt + 1).split(" ")[0]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") { setMentionQuery(null); setShowEmoji(false); setShowPlusMenu(false); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const insertMention = (u) => {
    const lastAt = text.lastIndexOf("@");
    const newText = text.slice(0, lastAt) + `@${u.name} `;
    setText(newText); setMentionQuery(null); setMentionUsers([]);
    textareaRef.current?.focus();
  };

  const insertEmoji = (emoji) => {
    setText(t => t + emoji); setShowEmoji(false); textareaRef.current?.focus();
  };

  const triggerFile = () => fileInputRef.current?.click();

  return (
    <div className="ch-root">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" style={{ display: "none" }} multiple
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) setText(t => t + (t ? " " : "") + `[📎 ${files.map(f => f.name).join(", ")}]`);
          e.target.value = "";
          textareaRef.current?.focus();
        }} />

      {/* ── Main ── */}
      <div className="ch-main">
        <div className="ch-messages">
          {loading ? (
            <div className="ch-center"><div className="af-spinner" /><span>Loading channel…</span></div>
          ) : !hasMessages ? (
            <div className="ch-empty">
              <h2 className="ch-empty-heading">Chat in #{channelName}</h2>
              <p className="ch-empty-sub">
                Collaborate seamlessly across tasks and conversations. Start chatting with your team or connect tasks to stay on top of your work.
              </p>
              <div className="ch-empty-actions">
                <button className="ch-cta-btn" onClick={() => setShowAddPeople(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                  + Add People
                </button>
                <button className="ch-cta-btn" onClick={() => setShowInvite(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="8" width="18" height="13" rx="2"/><path d="M1 8l11-5 11 5"/>
                  </svg>
                  Invite via Email
                </button>
              </div>
              <div className="ch-feature-cards">
                <FeatureCard icon="📋" title="Track Tasks" bg="#f5f3ff"
                  desc="Manage tasks, bugs, people, and more"
                  onClick={() => onNavigate ? onNavigate("board") : alert("Navigate to Board view")} />
                <FeatureCard icon="📄" title="Add Doc" bg="#eff6ff"
                  desc="Take notes or create detailed documents"
                  onClick={async () => {
                    const content = "📄 A new document has been shared in this channel.";
                    try {
                      const r = await api.post(`/channels/${workspaceId}/messages`, { content });
                      setMessages(prev => [...prev, r.data]);
                    } catch {}
                  }} />
                <FeatureCard icon="🎥" title="Start a Call" bg="#f0fdf4"
                  desc="Jump on a voice or video call"
                  onClick={() => setShowCall(true)} />
              </div>
            </div>
          ) : (
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
                      <div className={`ch-msg-bubble ${isMe ? "ch-msg-bubble--me" : ""}`}>{msg.content}</div>
                      {(!showName || isMe) && <div className="ch-msg-time-small">{timeAgo(msg.created_at)}</div>}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Onboarding banner */}
        {banner && !hasMessages && (
          <div className="ch-onboarding-banner">
            <span>👋 Send a message to #{channelName} to get the conversation started!</span>
            <button className="ch-banner-dismiss" onClick={() => setBanner(false)}>Dismiss</button>
          </div>
        )}

        {/* @ mention dropdown */}
        {mentionQuery !== null && mentionUsers.length > 0 && (
          <div className="ch-mention-dropdown">
            {mentionUsers.map(u => (
              <div key={u.id} className="ch-mention-item" onClick={() => insertMention(u)}>
                <Avatar name={u.name} size={22} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div className="ch-emoji-picker">
            {EMOJIS.map(e => (
              <button key={e} className="ch-emoji-btn" onClick={() => insertEmoji(e)}>{e}</button>
            ))}
          </div>
        )}

        {/* + menu */}
        {showPlusMenu && (
          <PlusMenu onFile={triggerFile} onClose={() => setShowPlusMenu(false)} />
        )}

        {/* ── Input bar ── */}
        <div className="ch-input-bar">
          <button className="ch-input-icon-btn" title="Attach / more options"
            onClick={() => { setShowPlusMenu(v => !v); setShowEmoji(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <select className="ch-msg-type">
            <option>Message</option>
          </select>
          <textarea ref={textareaRef} className="ch-input-text" rows={1}
            placeholder={`Send a message to #${channelName}…`}
            value={text} onChange={handleTextChange} onKeyDown={handleKeyDown} />
          <div className="ch-input-icons">
            <button className="ch-input-icon-btn" title="Emoji"
              onClick={() => { setShowEmoji(v => !v); setShowPlusMenu(false); }}>😊</button>
            <button className="ch-input-icon-btn" title="@Mention"
              onClick={() => { setText(t => t.endsWith(" ") || t === "" ? t + "@" : t + " @"); setMentionQuery(""); textareaRef.current?.focus(); }}>@</button>
            <button className="ch-input-icon-btn" title="Attach file" onClick={triggerFile}>📎</button>
          </div>
          <button className="ch-send-btn" onClick={send} disabled={!text.trim() || sending} title="Send (Enter)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Expandable sidebar panel ── */}
      <SidebarPanel
        activeId={activeSidebar}
        messages={messages}
        onClose={() => setActiveSidebar(null)}
        workspaceId={workspaceId}
      />

      {/* ── Icon sidebar ── */}
      <div className="ch-sidebar">
        {SIDEBAR_ITEMS.map(item => (
          <button key={item.id}
            className={`ch-sidebar-item ${activeSidebar === item.id ? "active" : ""}`}
            onClick={() => setActiveSidebar(v => v === item.id ? null : item.id)}
            title={item.label}>
            <span className="ch-sidebar-icon">{item.icon}</span>
            <span className="ch-sidebar-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── Modals ── */}
      {showAddPeople && <AddPeopleModal workspaceId={workspaceId} onClose={() => setShowAddPeople(false)} />}
      {showInvite    && <InviteEmailModal workspaceName={workspaceName} onClose={() => setShowInvite(false)} />}
      {showCall      && <StartCallModal channelName={channelName} onClose={() => setShowCall(false)} />}
    </div>
  );
}
