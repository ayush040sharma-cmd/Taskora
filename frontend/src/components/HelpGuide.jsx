import { useState } from "react";

const TIPS = [
  { icon: "📋", title: "Kanban Board",    desc: "Drag tasks between columns. Click + in any column to add a task to that status." },
  { icon: "🔥", title: "AI Risk",         desc: "The AI Risk tab scores every active task 0-100. Red = critical. Click Analyze all to refresh." },
  { icon: "💬", title: "AI Chat",         desc: "Ask plain English questions: show overdue tasks, who is overloaded, what is due this week?" },
  { icon: "📅", title: "Gantt Chart",     desc: "Set start + due dates on tasks to see them on the Gantt timeline. Group by status, priority, or assignee." },
  { icon: "⚡", title: "Simulate",        desc: "Before assigning a task, run a simulation to see how it affects that person's workload over 14 days." },
  { icon: "🕸", title: "Dependencies",    desc: "Link tasks so blocked work is visible. Tasks with unresolved deps show an orange blocked banner." },
  { icon: "🤝", title: "Collaboration",   desc: "See per-member engagement scores based on completions, comments, and at-risk tasks." },
  { icon: "🔗", title: "Integrations",    desc: "Paste a Slack webhook URL to get AI alert notifications. Import from Jira CSV in one click." },
  { icon: "📈", title: "Analytics",       desc: "Weekly throughput, sprint velocity, priority breakdown, and completion rate trends." },
  { icon: "👥", title: "Workload",        desc: "Green under 80% · Yellow 80-100% · Red over 100%. Background agents re-sync workload every 30 min." },
];

export default function HelpGuide() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("taskora_help_dismissed") !== "1"; } catch { return true; }
  });
  const [page, setPage] = useState(0);

  const dismiss = () => {
    try { localStorage.setItem("taskora_help_dismissed", "1"); } catch {}
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="help-guide-fab" onClick={() => setOpen(true)} title="Help guide">?</button>
    );
  }

  const tip = TIPS[page];

  return (
    <>
      <div className="help-guide-backdrop" onClick={dismiss} />
      <div className="help-guide-modal">
        <div className="help-guide-header">
          <span className="help-guide-brand">Taskora Guide</span>
          <button className="help-guide-close" onClick={dismiss}>✕</button>
        </div>

        <div className="help-guide-tip">
          <div className="help-guide-tip-icon">{tip.icon}</div>
          <div className="help-guide-tip-title">{tip.title}</div>
          <div className="help-guide-tip-desc">{tip.desc}</div>
        </div>

        {/* Dot navigation */}
        <div className="help-guide-dots">
          {TIPS.map((_, i) => (
            <button
              key={i}
              className={`help-guide-dot ${i === page ? "active" : ""}`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>

        <div className="help-guide-actions">
          <button
            className="btn-secondary"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Prev
          </button>
          {page < TIPS.length - 1 ? (
            <button className="btn-primary" onClick={() => setPage(p => p + 1)}>
              Next →
            </button>
          ) : (
            <button className="btn-primary" onClick={dismiss}>
              Got it!
            </button>
          )}
        </div>
      </div>
    </>
  );
}
