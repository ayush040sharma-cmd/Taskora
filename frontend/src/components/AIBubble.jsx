import { useState, useRef, useEffect } from "react";
import api from "../api/api";

const SUGGESTIONS = [
  "What tasks are overdue?",
  "Who has the most tasks?",
  "What's blocked this sprint?",
  "Summarize today's work",
];

export default function AIBubble({ workspaceId }) {
  const [open, setOpen]       = useState(false);
  const [minimized, setMin]   = useState(false);
  const [messages, setMsgs]   = useState([
    { role: "assistant", text: "Hi! Ask me anything about your tasks, team, or deadlines. ✨" },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [messages, open, minimized]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const { data } = await api.post("/chat/query", { query: q, workspace_id: workspaceId });
      const answer = data.answer || data.response || data.message || "I couldn't find an answer to that.";
      setMsgs(m => [...m, { role: "assistant", text: answer }]);
    } catch {
      setMsgs(m => [...m, { role: "assistant", text: "Couldn't connect right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-bubble-root">
      {open && !minimized && (
        <div className="ai-bubble-panel">
          {/* Header */}
          <div className="ai-bubble-header">
            <div className="ai-bubble-header-left">
              <span className="ai-bubble-header-icon">✨</span>
              <span className="ai-bubble-header-title">AI Assistant</span>
              <span className="ai-bubble-header-badge">Beta</span>
            </div>
            <div className="ai-bubble-header-actions">
              <button className="ai-bubble-icon-btn" title="Minimize" onClick={() => setMin(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button className="ai-bubble-icon-btn" title="Close" onClick={() => setOpen(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="ai-bubble-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-bubble-msg ai-bubble-msg--${m.role}`}>
                {m.role === "assistant" && (
                  <span className="ai-bubble-msg-avatar">✨</span>
                )}
                <span className="ai-bubble-msg-text">{m.text}</span>
              </div>
            ))}
            {loading && (
              <div className="ai-bubble-msg ai-bubble-msg--assistant">
                <span className="ai-bubble-msg-avatar">✨</span>
                <span className="ai-bubble-typing">
                  <span /><span /><span />
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion chips — only show on first message */}
          {messages.length === 1 && (
            <div className="ai-bubble-chips">
              {SUGGESTIONS.map(s => (
                <button key={s} className="ai-bubble-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="ai-bubble-input-row">
            <input
              ref={inputRef}
              className="ai-bubble-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about tasks, team, deadlines…"
              disabled={loading}
            />
            <button
              className="ai-bubble-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Minimized bar */}
      {open && minimized && (
        <div className="ai-bubble-minimized" onClick={() => setMin(false)}>
          <span>✨ AI Assistant</span>
          <button className="ai-bubble-icon-btn" onClick={e => { e.stopPropagation(); setOpen(false); setMin(false); }}>✕</button>
        </div>
      )}

      {/* FAB trigger */}
      {!open && (
        <button
          className="ai-bubble-fab"
          onClick={() => { setOpen(true); setMin(false); }}
          title="AI Assistant (⌘/)"
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>✨</span>
        </button>
      )}
    </div>
  );
}
