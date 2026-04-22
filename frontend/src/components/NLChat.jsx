import { useState, useRef, useEffect } from "react";
import api from "../api/api";

const SUGGESTIONS = [
  "Show overdue tasks",
  "What tasks are blocked?",
  "Show high risk tasks",
  "Who is overloaded?",
  "Show my tasks",
  "What's due this week?",
  "Show high priority tasks",
  "Give me a summary",
  "Show unassigned tasks",
];

const STATUS_COLOR = { todo: "#94a3b8", inprogress: "#6366f1", done: "#10b981" };
const PRIORITY_DOT = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

function TaskResult({ task }) {
  return (
    <div className="nlc-task-row">
      <span className="nlc-task-priority">{PRIORITY_DOT[task.priority] || "⚪"}</span>
      <div className="nlc-task-info">
        <div className="nlc-task-title">{task.title}</div>
        <div className="nlc-task-meta">
          <span style={{ color: STATUS_COLOR[task.status] || "#94a3b8", textTransform: "capitalize" }}>
            {task.status}
          </span>
          {task.assignee_name && <span>· {task.assignee_name}</span>}
          {task.due_date && (
            <span style={{ color: new Date(task.due_date) < new Date() ? "#dc2626" : "#64748b" }}>
              · Due {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          {(task._risk || task.risk_score) > 0 && (
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              · Risk {task._risk || task.risk_score}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberResult({ member }) {
  const loadPct = member.load_pct || 0;
  const color   = loadPct > 100 ? "#dc2626" : loadPct >= 80 ? "#f59e0b" : "#10b981";
  return (
    <div className="nlc-task-row">
      <div className="nlc-task-info">
        <div className="nlc-task-title">{member.name}</div>
        <div className="nlc-task-meta">
          <span style={{ color, fontWeight: 700 }}>{loadPct}% load</span>
          <span>· {member.scheduled_hours || 0}h scheduled / {member.daily_hours || 8}h capacity</span>
        </div>
      </div>
    </div>
  );
}

function SummaryResult({ data }) {
  return (
    <div className="nlc-summary">
      {[
        { label: "Open",        val: data.open,       color: "#6366f1" },
        { label: "Done",        val: data.done,       color: "#10b981" },
        { label: "Overdue",     val: data.overdue,    color: "#dc2626" },
        { label: "High Pri",    val: data.high_pri,   color: "#f59e0b" },
        { label: "Unassigned",  val: data.unassigned, color: "#94a3b8" },
      ].map(m => (
        <div key={m.label} className="nlc-summary-stat">
          <div className="nlc-summary-val" style={{ color: m.color }}>{m.val}</div>
          <div className="nlc-summary-lbl">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === "user") {
    return (
      <div className="nlc-msg nlc-msg-user">
        <div className="nlc-bubble-user">{msg.text}</div>
      </div>
    );
  }

  return (
    <div className="nlc-msg nlc-msg-bot">
      <div className="nlc-bot-avatar">🧠</div>
      <div className="nlc-bot-content">
        <div className="nlc-bubble-bot">{msg.answer}</div>
        {msg.type === "summary" && msg.tasks?.[0] && <SummaryResult data={msg.tasks[0]} />}
        {msg.type === "tasks" && msg.tasks?.length > 0 && (
          <div className="nlc-results">
            {msg.tasks.map(t => <TaskResult key={t.id} task={t} />)}
            {msg.more > 0 && <div className="nlc-more">+{msg.more} more tasks</div>}
          </div>
        )}
        {msg.type === "members" && msg.tasks?.length > 0 && (
          <div className="nlc-results">
            {msg.tasks.map((m, i) => <MemberResult key={i} member={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NLChat({ workspaceId }) {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      answer: "Hi! I can answer questions about your workspace. Try asking: 'Show overdue tasks', 'Who is overloaded?', or 'What is due this week?'",
      type: "text",
      tasks: [],
    },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (query) => {
    const q = (query || input).trim();
    if (!q || !workspaceId) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setLoading(true);

    try {
      const res = await api.post(`/nlquery/${workspaceId}`, { query: q });
      const d = res.data;
      setMessages(prev => [...prev, {
        role:   "bot",
        answer: d.answer,
        type:   d.type,
        tasks:  d.tasks?.slice(0, 8) || [],
        more:   Math.max(0, (d.tasks?.length || 0) - 8),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "bot", answer: "Sorry, something went wrong. Try again.", type: "text", tasks: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!workspaceId) return null;

  return (
    <div className="nlc-panel">
      <div className="nlc-header">
        <div className="nlc-header-title">
          <span className="ai-pulse" />
          <span>AI Workspace Assistant</span>
        </div>
        <div className="nlc-header-sub">Ask anything about your tasks, team, or deadlines</div>
      </div>

      {/* Messages */}
      <div className="nlc-messages">
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div className="nlc-msg nlc-msg-bot">
            <div className="nlc-bot-avatar">🧠</div>
            <div className="nlc-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div className="nlc-suggestions">
        {SUGGESTIONS.slice(0, 5).map(s => (
          <button key={s} className="nlc-suggestion-chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="nlc-input-row">
        <input
          className="nlc-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about tasks, team, deadlines…"
          disabled={loading}
        />
        <button
          className="nlc-send-btn"
          onClick={() => send()}
          disabled={!input.trim() || loading}
        >
          {loading ? "…" : "↑"}
        </button>
      </div>
    </div>
  );
}
