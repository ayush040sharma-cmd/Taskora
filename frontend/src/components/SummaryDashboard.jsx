import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysLeft(dueDateStr) {
  if (!dueDateStr) return null;
  const diff = (new Date(dueDateStr) - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

const PRIORITY_COLOR = { critical: "#7c3aed", high: "#ef4444", medium: "#f59e0b", low: "#10b981" };
const TYPE_ICON = {
  task: "📋", bug: "🐛", story: "📖", rfp: "📑",
  proposal: "📝", presentation: "🎤", upgrade: "⬆️", poc: "🔬",
};
const RISK_COLOR = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#94a3b8" };

// ── Today Focus Card ──────────────────────────────────────────────────────────

function TodayFocusCard({ todayFocus, user }) {
  const { attention_count, due_today_count, overdue_count, free_hours, recommended_task } = todayFocus;

  const urgencyLevel = overdue_count > 0 ? "critical"
    : due_today_count > 0 ? "warning"
    : attention_count > 2 ? "moderate"
    : "calm";

  const urgencyConfig = {
    critical: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", icon: "🚨", label: "Needs urgent attention" },
    warning:  { bg: "#fffbeb", border: "#fde68a", text: "#d97706", icon: "⚠️", label: "Action required today" },
    moderate: { bg: "#fff7ed", border: "#fed7aa", text: "#ea580c", icon: "👀", label: "A few things to watch" },
    calm:     { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a", icon: "✅", label: "Looking good today!" },
  };

  const cfg = urgencyConfig[urgencyLevel];

  return (
    <div className="ped-focus-card" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="ped-focus-top">
        <div className="ped-focus-greeting">
          <span className="ped-focus-icon">{cfg.icon}</span>
          <div>
            <div className="ped-focus-name">Good {getGreeting()}, {user?.name?.split(" ")[0]}</div>
            <div className="ped-focus-status" style={{ color: cfg.text }}>{cfg.label}</div>
          </div>
        </div>
        <div className="ped-focus-free">
          <div className="ped-focus-free-num">{free_hours}h</div>
          <div className="ped-focus-free-label">free today</div>
        </div>
      </div>

      <div className="ped-focus-pills">
        {overdue_count > 0 && (
          <span className="ped-focus-pill ped-focus-pill--red">{overdue_count} overdue</span>
        )}
        {due_today_count > 0 && (
          <span className="ped-focus-pill ped-focus-pill--yellow">{due_today_count} due today</span>
        )}
        {attention_count === 0 && (
          <span className="ped-focus-pill ped-focus-pill--green">All clear</span>
        )}
      </div>

      {recommended_task && (
        <div className="ped-focus-rec">
          <span className="ped-focus-rec-label">Start with →</span>
          <span className="ped-focus-rec-task">{recommended_task}</span>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// ── Next Best Action Panel ────────────────────────────────────────────────────

function NextActionPanel({ nextAction, onOpenTask }) {
  if (!nextAction) {
    return (
      <div className="ped-card">
        <div className="ped-card-header">
          <span className="ped-card-icon">⚡</span>
          <span className="ped-card-title">Next Best Action</span>
        </div>
        <div className="ped-empty">No active tasks — you're all caught up!</div>
      </div>
    );
  }

  const { task, score, reason } = nextAction;
  const dl = daysLeft(task.due_date);
  const pColor = PRIORITY_COLOR[task.priority] || "#94a3b8";

  return (
    <div className="ped-card ped-card--accent">
      <div className="ped-card-header">
        <span className="ped-card-icon">⚡</span>
        <span className="ped-card-title">Next Best Action</span>
        <span className="ped-score-badge">{score}pts</span>
      </div>

      <div className="ped-next-task" onClick={() => onOpenTask && onOpenTask(task)}>
        <div className="ped-next-type">{TYPE_ICON[task.type] || "📋"} {task.type || "task"}</div>
        <div className="ped-next-title">{task.title}</div>
        <div className="ped-next-meta">
          <span className="ped-priority-dot" style={{ background: pColor }} />
          <span className="ped-next-priority">{task.priority}</span>
          {task.due_date && (
            <span className={`ped-due-label ${dl !== null && dl < 0 ? "ped-due--overdue" : dl !== null && dl < 2 ? "ped-due--soon" : ""}`}>
              {dl !== null && dl < 0 ? `${Math.abs(dl)}d overdue` : `Due ${fmtDate(task.due_date)}`}
            </span>
          )}
          {task.progress > 0 && (
            <span className="ped-progress-label">{task.progress}% done</span>
          )}
        </div>
        <div className="ped-next-reason">💡 {reason}</div>
      </div>
    </div>
  );
}

// ── Day Timeline ──────────────────────────────────────────────────────────────

function DayTimeline({ dayPlan }) {
  if (!dayPlan?.length) {
    return (
      <div className="ped-card">
        <div className="ped-card-header">
          <span className="ped-card-icon">🗓️</span>
          <span className="ped-card-title">My Day Plan</span>
        </div>
        <div className="ped-empty">No tasks to plan — add some tasks to get started.</div>
      </div>
    );
  }

  return (
    <div className="ped-card">
      <div className="ped-card-header">
        <span className="ped-card-icon">🗓️</span>
        <span className="ped-card-title">My Day Plan</span>
        <span className="ped-card-sub">{dayPlan.length} blocks</span>
      </div>

      <div className="ped-timeline">
        {dayPlan.map((block, i) => {
          const pColor = PRIORITY_COLOR[block.priority] || "#94a3b8";
          return (
            <div key={block.task_id} className="ped-tl-row">
              <div className="ped-tl-time">
                <div className="ped-tl-start">{block.start}</div>
                <div className="ped-tl-end">{block.end}</div>
              </div>
              <div className="ped-tl-connector">
                <div className="ped-tl-dot" style={{ background: pColor }} />
                {i < dayPlan.length - 1 && <div className="ped-tl-line" />}
              </div>
              <div className="ped-tl-block">
                <div className="ped-tl-task-title">
                  {TYPE_ICON[block.type] || "📋"} {block.title}
                  {block.is_partial && <span className="ped-tl-partial">partial</span>}
                </div>
                <div className="ped-tl-meta">
                  <span style={{ color: pColor }}>{block.priority}</span>
                  <span className="ped-tl-hours">{block.hours}h</span>
                  {block.progress > 0 && <span className="ped-tl-prog">{block.progress}%</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Capacity Widget ───────────────────────────────────────────────────────────

function CapacityWidget({ capacity }) {
  const { daily_hours, used_hours, free_hours, load_percent, tomorrow_load_pct, tomorrow_overloaded, on_leave, travel_mode } = capacity;

  const barColor = load_percent >= 90 ? "#ef4444" : load_percent >= 70 ? "#f59e0b" : "#10b981";

  if (on_leave) {
    return (
      <div className="ped-card ped-card--muted">
        <div className="ped-card-header">
          <span className="ped-card-icon">🏖️</span>
          <span className="ped-card-title">Capacity</span>
        </div>
        <div className="ped-empty" style={{ color: "#6366f1" }}>You're marked as on leave today.</div>
      </div>
    );
  }

  return (
    <div className="ped-card">
      <div className="ped-card-header">
        <span className="ped-card-icon">⚙️</span>
        <span className="ped-card-title">Capacity</span>
        {travel_mode && <span className="ped-travel-badge">✈️ Travel mode</span>}
      </div>

      <div className="ped-cap-ring-wrap">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={barColor} strokeWidth="10"
            strokeDasharray={`${load_percent * 2.513} 251.3`}
            strokeDashoffset="62.8"
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
          <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">{load_percent}%</text>
          <text x="50" y="60" textAnchor="middle" fontSize="9" fill="#64748b">load</text>
        </svg>

        <div className="ped-cap-stats">
          <div className="ped-cap-stat">
            <div className="ped-cap-num" style={{ color: "#ef4444" }}>{used_hours}h</div>
            <div className="ped-cap-label">committed</div>
          </div>
          <div className="ped-cap-stat">
            <div className="ped-cap-num" style={{ color: "#10b981" }}>{free_hours}h</div>
            <div className="ped-cap-label">free</div>
          </div>
          <div className="ped-cap-stat">
            <div className="ped-cap-num">{daily_hours}h</div>
            <div className="ped-cap-label">daily</div>
          </div>
        </div>
      </div>

      <div className="ped-cap-bar-wrap">
        <div className="ped-cap-bar-track">
          <div className="ped-cap-bar-fill" style={{ width: `${load_percent}%`, background: barColor }} />
        </div>
      </div>

      <div className="ped-cap-tomorrow">
        <span className="ped-cap-tm-label">Tomorrow forecast:</span>
        <span className={`ped-cap-tm-val ${tomorrow_overloaded ? "ped-cap-tm--warn" : ""}`}>
          {tomorrow_load_pct}% {tomorrow_overloaded ? "⚠️ Heavy" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Risk Radar ────────────────────────────────────────────────────────────────

function RiskRadar({ risks }) {
  if (!risks?.length) {
    return (
      <div className="ped-card">
        <div className="ped-card-header">
          <span className="ped-card-icon">🛡️</span>
          <span className="ped-card-title">Risk Radar</span>
        </div>
        <div className="ped-empty ped-empty--green">No risks detected — great work!</div>
      </div>
    );
  }

  const RISK_ICON = {
    overdue:      "🔴",
    due_today:    "🟠",
    stuck:        "🔶",
    not_started:  "🟡",
    no_deadline:  "⚪",
  };

  return (
    <div className="ped-card">
      <div className="ped-card-header">
        <span className="ped-card-icon">🛡️</span>
        <span className="ped-card-title">Risk Radar</span>
        <span className="ped-risk-count">{risks.length} item{risks.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="ped-risk-list">
        {risks.map((r, i) => (
          <div key={i} className="ped-risk-row" style={{ borderLeftColor: RISK_COLOR[r.severity] }}>
            <span className="ped-risk-icon">{RISK_ICON[r.riskType] || "⚠️"}</span>
            <div className="ped-risk-body">
              <div className="ped-risk-title">{r.task.title}</div>
              <div className="ped-risk-meta">
                <span className="ped-risk-label" style={{ color: RISK_COLOR[r.severity] }}>{r.label}</span>
                {r.task.due_date && <span className="ped-risk-date">Due {fmtDate(r.task.due_date)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Progress Momentum ─────────────────────────────────────────────────────────

function ProgressMomentum({ progress }) {
  const { completed_week, completed_prev_week, inprogress, delayed, trend, trend_pct } = progress;

  const trendColor = trend === "up" ? "#10b981" : trend === "down" ? "#ef4444" : "#94a3b8";
  const trendIcon  = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";

  const stats = [
    { label: "Done this week",  value: completed_week, color: "#10b981", icon: "✅" },
    { label: "Last week",       value: completed_prev_week, color: "#94a3b8", icon: "📅" },
    { label: "In progress",     value: inprogress, color: "#6366f1", icon: "🔄" },
    { label: "Delayed",         value: delayed,    color: "#ef4444", icon: "⏰" },
  ];

  return (
    <div className="ped-card">
      <div className="ped-card-header">
        <span className="ped-card-icon">📈</span>
        <span className="ped-card-title">Progress</span>
        <span className="ped-trend" style={{ color: trendColor }}>
          {trendIcon} {trend_pct !== 0 ? `${Math.abs(trend_pct)}%` : ""}
          <span className="ped-trend-label">{trend === "up" ? "vs last week" : trend === "down" ? "vs last week" : "flat"}</span>
        </span>
      </div>

      <div className="ped-momentum-grid">
        {stats.map(s => (
          <div key={s.label} className="ped-momentum-stat">
            <div className="ped-momentum-icon">{s.icon}</div>
            <div className="ped-momentum-num" style={{ color: s.color }}>{s.value}</div>
            <div className="ped-momentum-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Mini sparkline bar */}
      {(completed_week > 0 || completed_prev_week > 0) && (
        <div className="ped-sparkbar">
          <div className="ped-sparkbar-label">This week vs last week</div>
          <div className="ped-sparkbar-row">
            <span className="ped-sparkbar-week">Last</span>
            <div className="ped-sparkbar-track">
              <div
                className="ped-sparkbar-fill ped-sparkbar-fill--prev"
                style={{ width: `${Math.min(100, completed_prev_week * 15)}%` }}
              />
            </div>
            <span className="ped-sparkbar-val">{completed_prev_week}</span>
          </div>
          <div className="ped-sparkbar-row">
            <span className="ped-sparkbar-week">Now</span>
            <div className="ped-sparkbar-track">
              <div
                className="ped-sparkbar-fill ped-sparkbar-fill--cur"
                style={{ width: `${Math.min(100, completed_week * 15)}%` }}
              />
            </div>
            <span className="ped-sparkbar-val">{completed_week}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart Activity Feed ───────────────────────────────────────────────────────

const FEED_COLOR = { completed: "#10b981", inprogress: "#6366f1", created: "#3b82f6", updated: "#f59e0b" };
const FEED_ICON  = { completed: "✅", inprogress: "🔄", created: "➕", updated: "✏️" };

function SmartActivityFeed({ feed }) {
  return (
    <div className="ped-card">
      <div className="ped-card-header">
        <span className="ped-card-icon">📡</span>
        <span className="ped-card-title">Activity Feed</span>
      </div>

      {!feed?.length ? (
        <div className="ped-empty">No recent activity yet.</div>
      ) : (
        <div className="ped-feed-list">
          {feed.map((item, i) => (
            <div key={i} className="ped-feed-row">
              <div
                className="ped-feed-dot"
                style={{ background: FEED_COLOR[item.type] || "#94a3b8" }}
              >
                {FEED_ICON[item.type] || "•"}
              </div>
              <div className="ped-feed-body">
                <div className="ped-feed-msg">{item.message}</div>
                <div className="ped-feed-time">{timeAgo(item.time)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── My Tasks Table ────────────────────────────────────────────────────────────

function SortBtn({ field, label, activeSort, onSort }) {
  return (
    <button
      className={`ped-tasks-sort ${activeSort === field ? "active" : ""}`}
      onClick={() => onSort(field)}
    >
      {label}
    </button>
  );
}

function MyTasksTable({ tasks }) {
  const [sort, setSort] = useState("score"); // score | priority | due | title

  const sorted = [...(tasks || [])].sort((a, b) => {
    if (sort === "score")    return (b._score || 0) - (a._score || 0);
    if (sort === "priority") {
      const ord = { critical: 0, high: 1, medium: 2, low: 3 };
      return (ord[a.priority] ?? 9) - (ord[b.priority] ?? 9);
    }
    if (sort === "due") {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    }
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="ped-card ped-card--full">
      <div className="ped-card-header">
        <span className="ped-card-icon">📋</span>
        <span className="ped-card-title">My Active Tasks</span>
        <div className="ped-tasks-sorts">
          <SortBtn field="score"    label="Recommended" activeSort={sort} onSort={setSort} />
          <SortBtn field="priority" label="Priority"    activeSort={sort} onSort={setSort} />
          <SortBtn field="due"      label="Due date"    activeSort={sort} onSort={setSort} />
        </div>
        <span className="ped-card-sub">{tasks?.length || 0} tasks</span>
      </div>

      {!sorted.length ? (
        <div className="ped-empty">No active tasks — nice work!</div>
      ) : (
        <div className="ped-tasks-list">
          {sorted.map((task, i) => {
            const dl     = daysLeft(task.due_date);
            const pColor = PRIORITY_COLOR[task.priority] || "#94a3b8";
            const isOverdue = dl !== null && dl < 0;
            const isDueToday = dl !== null && dl < 1 && dl >= 0;

            return (
              <div key={task.id} className={`ped-task-row ${isOverdue ? "ped-task-row--overdue" : isDueToday ? "ped-task-row--today" : ""}`}>
                <div className="ped-task-rank">#{i + 1}</div>
                <div className="ped-task-icon">{TYPE_ICON[task.type] || "📋"}</div>
                <div className="ped-task-main">
                  <div className="ped-task-title">{task.title}</div>
                  <div className="ped-task-meta">
                    <span className="ped-task-priority-dot" style={{ background: pColor }} />
                    <span style={{ color: pColor, fontSize: 11 }}>{task.priority}</span>
                    <span className="ped-task-type">{task.type}</span>
                  </div>
                </div>
                <div className="ped-task-progress-wrap">
                  <div className="ped-task-prog-bar">
                    <div
                      className="ped-task-prog-fill"
                      style={{
                        width: `${task.progress || 0}%`,
                        background: (task.progress || 0) >= 80 ? "#10b981" : "#6366f1",
                      }}
                    />
                  </div>
                  <span className="ped-task-prog-pct">{task.progress || 0}%</span>
                </div>
                <div className={`ped-task-due ${isOverdue ? "ped-task-due--overdue" : isDueToday ? "ped-task-due--today" : ""}`}>
                  {task.due_date
                    ? (isOverdue
                        ? `${Math.abs(dl)}d late`
                        : isDueToday
                          ? "Today"
                          : fmtDate(task.due_date))
                    : "—"}
                </div>
                <div className="ped-task-status">
                  <span className={`ped-status-pill ped-status--${task.status === "in_progress" ? "inprogress" : task.status}`}>
                    {task.status === "inprogress" || task.status === "in_progress" ? "In Progress"
                      : task.status === "todo" ? "To Do"
                      : task.status === "review" ? "In Review"
                      : task.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Focus Mode Overlay ────────────────────────────────────────────────────────

const POMODORO = 25 * 60;

function FocusMode({ task, onClose }) {
  const [timeLeft, setTimeLeft] = useState(POMODORO);
  const [running, setRunning]   = useState(false);
  const [phase, setPhase]       = useState("focus"); // focus | break
  const intervalRef = useRef(null);

  const tick = useCallback(() => {
    setTimeLeft(t => {
      if (t <= 1) {
        clearInterval(intervalRef.current);
        setRunning(false);
        setPhase(prev => {
          const next = prev === "focus" ? "break" : "focus";
          setTimeout(() => setTimeLeft(next === "break" ? 5 * 60 : POMODORO), 0);
          return next;
        });
        return 0;
      }
      return t - 1;
    });
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, tick]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");
  const progress = phase === "focus"
    ? ((POMODORO - timeLeft) / POMODORO) * 100
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  const circumference = 2 * Math.PI * 70;

  return (
    <div className="ped-focus-overlay">
      <div className="ped-focus-modal">
        <button className="ped-focus-close" onClick={onClose}>✕</button>
        <div className="ped-focus-badge">{phase === "focus" ? "🎯 Focus" : "☕ Break"}</div>

        {task && (
          <div className="ped-focus-task-label">
            {TYPE_ICON[task.type] || "📋"} {task.title}
          </div>
        )}

        <div className="ped-focus-timer-wrap">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r="70" fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
              cx="90" cy="90" r="70" fill="none"
              stroke={phase === "focus" ? "#6366f1" : "#10b981"}
              strokeWidth="8"
              strokeDasharray={`${(progress / 100) * circumference} ${circumference}`}
              strokeDashoffset={circumference / 4}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1s linear" }}
            />
            <text x="90" y="84" textAnchor="middle" fontSize="32" fontWeight="800" fill="#0f172a">{mins}:{secs}</text>
            <text x="90" y="105" textAnchor="middle" fontSize="12" fill="#64748b">
              {phase === "focus" ? "remaining" : "break"}
            </text>
          </svg>
        </div>

        <div className="ped-focus-controls">
          <button
            className={`ped-focus-btn ${running ? "ped-focus-btn--pause" : "ped-focus-btn--start"}`}
            onClick={() => setRunning(r => !r)}
          >
            {running ? "⏸ Pause" : "▶ Start"}
          </button>
          <button
            className="ped-focus-btn ped-focus-btn--reset"
            onClick={() => { setRunning(false); setTimeLeft(POMODORO); setPhase("focus"); }}
          >
            ↺ Reset
          </button>
        </div>

        <div className="ped-focus-tips">
          {phase === "focus"
            ? "Stay focused — one task at a time. No distractions."
            : "Take a real break — stretch, hydrate, breathe."}
        </div>
      </div>
    </div>
  );
}

// ── Quick Actions Bar ─────────────────────────────────────────────────────────

function QuickActions({ nextTask, onFocusMode, onRefresh }) {
  return (
    <div className="ped-quick-actions">
      <button className="ped-qa-btn ped-qa-btn--primary" onClick={() => onFocusMode(nextTask)}>
        🎯 Enter Focus Mode
      </button>
      <button className="ped-qa-btn" onClick={onRefresh}>
        🔄 Refresh
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SummaryDashboard({ workspaceId }) {
  useAuth();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [refresh,    setRefresh]    = useState(0);
  const [focusTask,  setFocusTask]  = useState(null);
  const [focusOpen,  setFocusOpen]  = useState(false);

  useEffect(() => {
    if (!workspaceId) { setLoading(false); setData(null); return; }
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    api.get(`/personal/dashboard?workspace_id=${workspaceId}`)
      .then(r => {
        if (!cancelled) { setData(r.data); setLoading(false); }
      })
      .catch(err => {
        if (!cancelled) {
          const msg = err.response?.data?.message || err.message || "Failed to load dashboard";
          setError(msg);
          setLoading(false);
          console.error("Personal dashboard error:", err);
        }
      });
    return () => { cancelled = true; };
  }, [workspaceId, refresh]);

  const load = useCallback(() => setRefresh(n => n + 1), []);

  const openFocus = (task) => {
    setFocusTask(task || data?.next_action?.task || null);
    setFocusOpen(true);
  };

  if (loading) {
    return (
      <div className="ped-root">
        <div className="ped-loading">
          <div className="ped-loading-spinner" />
          <span>Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ped-root">
        <div className="ped-error-state">
          <div className="ped-error-icon">⚠️</div>
          <div className="ped-error-msg">{error}</div>
          <button className="ped-qa-btn" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ped-root">
        <div className="ped-empty-state">Select a workspace to see your personal dashboard.</div>
      </div>
    );
  }

  return (
    <div className="ped-root">
      {/* Focus Mode Overlay */}
      {focusOpen && (
        <FocusMode
          task={focusTask}
          onClose={() => setFocusOpen(false)}
        />
      )}

      {/* Quick Actions */}
      <QuickActions
        nextTask={data.next_action?.task}
        onFocusMode={openFocus}
        onRefresh={load}
      />

      {/* Row 1: Today Focus + Next Action + Capacity */}
      <div className="ped-row-3">
        <TodayFocusCard todayFocus={data.today_focus} user={data.user} />
        <NextActionPanel nextAction={data.next_action} onOpenTask={null} />
        <CapacityWidget capacity={data.capacity} />
      </div>

      {/* Row 2: Day Timeline + Risk Radar */}
      <div className="ped-row-2">
        <DayTimeline dayPlan={data.day_plan} />
        <RiskRadar risks={data.risk_radar} />
      </div>

      {/* Row 3: Progress + Activity Feed */}
      <div className="ped-row-2">
        <ProgressMomentum progress={data.progress} />
        <SmartActivityFeed feed={data.activity_feed} />
      </div>

      {/* Full-width: My Tasks Table */}
      <MyTasksTable tasks={data.my_tasks} />
    </div>
  );
}
