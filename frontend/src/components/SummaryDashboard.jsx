import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import "../styles/summary.css";

// ── Token-mapped color constants ──────────────────────────────────────────────

const PRIORITY_COLOR = {
  critical: "var(--tk-status-danger)",
  high:     "var(--tk-status-danger)",
  medium:   "var(--tk-status-warn)",
  low:      "var(--tk-status-ok)",
};

const PRIORITY_PILL = {
  critical: "tk-pill--danger",
  high:     "tk-pill--danger",
  medium:   "tk-pill--warn",
  low:      "tk-pill--ok",
};

const TYPE_ICON = {
  task: "📋", bug: "🐛", story: "📖", rfp: "📑",
  proposal: "📝", presentation: "🎤", upgrade: "⬆️", poc: "🔬",
};

const RISK_COLOR = {
  critical: "var(--tk-status-danger)",
  high:     "var(--tk-status-danger)",
  medium:   "var(--tk-status-warn)",
  low:      "var(--tk-text-muted)",
};

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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// ── Today Focus Card ──────────────────────────────────────────────────────────

function TodayFocusCard({ todayFocus, user }) {
  const { attention_count, due_today_count, overdue_count, free_hours, recommended_task } = todayFocus;

  const urgencyLevel = overdue_count > 0 ? "critical"
    : due_today_count > 0 ? "warning"
    : attention_count > 2 ? "moderate"
    : "calm";

  const urgencyConfig = {
    critical: { variantClass: "sd-focus-card--danger", textColor: "var(--tk-status-danger)", icon: "🚨", label: "Needs urgent attention" },
    warning:  { variantClass: "sd-focus-card--warn",   textColor: "var(--tk-status-warn)",   icon: "⚠️", label: "Action required today" },
    moderate: { variantClass: "sd-focus-card--warn",   textColor: "var(--tk-status-warn)",   icon: "👀", label: "A few things to watch" },
    calm:     { variantClass: "sd-focus-card--ok",     textColor: "var(--tk-status-ok)",     icon: "✅", label: "Looking good today!" },
  };

  const cfg = urgencyConfig[urgencyLevel];

  return (
    <div className={`sd-focus-card ${cfg.variantClass}`}>
      <div className="sd-focus-top">
        <div className="sd-focus-greeting">
          <span className="sd-focus-icon">{cfg.icon}</span>
          <div>
            <div className="sd-focus-name">Good {getGreeting()}, {user?.name?.split(" ")[0]}</div>
            <div className="sd-focus-status" style={{ color: cfg.textColor }}>{cfg.label}</div>
          </div>
        </div>
        <div className="sd-focus-free">
          <div className="sd-focus-free-num">{free_hours}h</div>
          <div className="sd-focus-free-label">free today</div>
        </div>
      </div>

      <div className="sd-focus-pills">
        {overdue_count > 0 && (
          <span className="tk-pill tk-pill--danger">{overdue_count} overdue</span>
        )}
        {due_today_count > 0 && (
          <span className="tk-pill tk-pill--warn">{due_today_count} due today</span>
        )}
        {attention_count === 0 && (
          <span className="tk-pill tk-pill--ok">All clear</span>
        )}
      </div>

      {recommended_task && (
        <div className="sd-focus-rec">
          <span className="sd-focus-rec-label">Start with →</span>
          <span className="sd-focus-rec-task">{recommended_task}</span>
        </div>
      )}
    </div>
  );
}

// ── Next Best Action Panel ────────────────────────────────────────────────────

function NextActionPanel({ nextAction, onOpenTask }) {
  if (!nextAction) {
    return (
      <div className="tk-card">
        <div className="sd-card-header">
          <span className="sd-card-icon">⚡</span>
          <span className="sd-card-title">Next Best Action</span>
        </div>
        <div className="sd-empty">No active tasks — you're all caught up!</div>
      </div>
    );
  }

  const { task, score, reason } = nextAction;
  const dl = daysLeft(task.due_date);
  const pColor = PRIORITY_COLOR[task.priority] || "var(--tk-text-secondary)";
  const isOverdue = dl !== null && dl < 0;
  const isSoon    = dl !== null && dl >= 0 && dl < 2;

  return (
    <div className="tk-card-ai">
      <div className="tk-card-ai__glow" />
      <div className="sd-card-header">
        <span className="sd-card-icon">⚡</span>
        <span className="sd-card-title">Next Best Action</span>
        <span className="sd-score-badge">{score}pts</span>
      </div>

      <div className="sd-next-task" onClick={() => onOpenTask && onOpenTask(task)}>
        <div className="sd-next-type">{TYPE_ICON[task.type] || "📋"} {task.type || "task"}</div>
        <div className="sd-next-title">{task.title}</div>
        <div className="sd-next-meta">
          <span className="tk-dot" style={{ background: pColor }} />
          <span className="sd-next-priority">{task.priority}</span>
          {task.due_date && (
            <span className={`sd-due-label${isOverdue ? " sd-due--overdue" : isSoon ? " sd-due--soon" : ""}`}>
              {isOverdue ? `${Math.abs(dl)}d overdue` : `Due ${fmtDate(task.due_date)}`}
            </span>
          )}
          {task.progress > 0 && (
            <span className="sd-progress-label">{task.progress}% done</span>
          )}
        </div>
        <div className="sd-next-reason">💡 {reason}</div>
      </div>
    </div>
  );
}

// ── Day Timeline ──────────────────────────────────────────────────────────────

function DayTimeline({ dayPlan }) {
  if (!dayPlan?.length) {
    return (
      <div className="tk-card">
        <div className="sd-card-header">
          <span className="sd-card-icon">🗓️</span>
          <span className="sd-card-title">My Day Plan</span>
        </div>
        <div className="sd-empty">No tasks to plan — add some tasks to get started.</div>
      </div>
    );
  }

  return (
    <div className="tk-card">
      <div className="sd-card-header">
        <span className="sd-card-icon">🗓️</span>
        <span className="sd-card-title">My Day Plan</span>
        <span className="sd-card-sub">{dayPlan.length} blocks</span>
      </div>

      <div className="sd-timeline">
        {dayPlan.map((block, i) => {
          const pColor = PRIORITY_COLOR[block.priority] || "var(--tk-text-secondary)";
          return (
            <div key={block.task_id} className="sd-tl-row">
              <div className="sd-tl-time">
                <div className="sd-tl-start">{block.start}</div>
                <div className="sd-tl-end">{block.end}</div>
              </div>
              <div className="sd-tl-connector">
                <div className="sd-tl-dot" style={{ background: pColor }} />
                {i < dayPlan.length - 1 && <div className="sd-tl-line" />}
              </div>
              <div className="sd-tl-block">
                <div className="sd-tl-task-title">
                  {TYPE_ICON[block.type] || "📋"} {block.title}
                  {block.is_partial && <span className="sd-tl-partial">partial</span>}
                </div>
                <div className="sd-tl-meta">
                  <span style={{ color: pColor }}>{block.priority}</span>
                  <span className="sd-tl-hours">{block.hours}h</span>
                  {block.progress > 0 && <span className="sd-tl-prog">{block.progress}%</span>}
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

  const barColor = load_percent >= 90 ? "var(--tk-status-danger)"
                 : load_percent >= 70 ? "var(--tk-status-warn)"
                 : "var(--tk-status-ok)";

  const barClass = load_percent >= 90 ? "tk-progress-fill--danger"
                 : load_percent >= 70 ? "tk-progress-fill--warn"
                 : "";

  if (on_leave) {
    return (
      <div className="tk-card">
        <div className="sd-card-header">
          <span className="sd-card-icon">🏖️</span>
          <span className="sd-card-title">Capacity</span>
        </div>
        <div className="sd-empty" style={{ color: "var(--tk-accent)" }}>You're marked as on leave today.</div>
      </div>
    );
  }

  return (
    <div className="tk-card">
      <div className="sd-card-header">
        <span className="sd-card-icon">⚙️</span>
        <span className="sd-card-title">Capacity</span>
        {travel_mode && <span className="sd-travel-badge">✈️ Travel mode</span>}
      </div>

      <div className="sd-cap-ring-wrap">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" className="sd-ring-track" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={barColor}
            strokeWidth="10"
            strokeDasharray={`${load_percent * 2.513} 251.3`}
            strokeDashoffset="62.8"
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
          <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" className="sd-ring-text-main">{load_percent}%</text>
          <text x="50" y="60" textAnchor="middle" fontSize="9" className="sd-ring-text-sub">load</text>
        </svg>

        <div className="sd-cap-stats">
          <div className="sd-cap-stat">
            <div className="sd-cap-num" style={{ color: "var(--tk-status-danger)" }}>{used_hours}h</div>
            <div className="sd-cap-label">committed</div>
          </div>
          <div className="sd-cap-stat">
            <div className="sd-cap-num" style={{ color: "var(--tk-status-ok)" }}>{free_hours}h</div>
            <div className="sd-cap-label">free</div>
          </div>
          <div className="sd-cap-stat">
            <div className="sd-cap-num" style={{ color: "var(--tk-text-secondary)" }}>{daily_hours}h</div>
            <div className="sd-cap-label">daily</div>
          </div>
        </div>
      </div>

      <div className="sd-cap-bar-wrap">
        <div className="tk-progress-track">
          <div className={`tk-progress-fill ${barClass}`} style={{ width: `${Math.min(load_percent, 100)}%` }} />
        </div>
      </div>

      <div className="sd-cap-tomorrow">
        <span className="sd-cap-tm-label">Tomorrow forecast:</span>
        <span className={`sd-cap-tm-val${tomorrow_overloaded ? " sd-cap-tm--warn" : ""}`}>
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
      <div className="tk-card">
        <div className="sd-card-header">
          <span className="sd-card-icon">🛡️</span>
          <span className="sd-card-title">Risk Radar</span>
        </div>
        <div className="sd-empty sd-empty--green">No risks detected — great work!</div>
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
    <div className="tk-card">
      <div className="sd-card-header">
        <span className="sd-card-icon">🛡️</span>
        <span className="sd-card-title">Risk Radar</span>
        <span className="sd-risk-count">{risks.length} item{risks.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="sd-risk-list">
        {risks.map((r, i) => (
          <div key={i} className="sd-risk-row" style={{ borderLeftColor: RISK_COLOR[r.severity] || "var(--tk-border)" }}>
            <span className="sd-risk-icon">{RISK_ICON[r.riskType] || "⚠️"}</span>
            <div className="sd-risk-body">
              <div className="sd-risk-title">{r.task.title}</div>
              <div className="sd-risk-meta">
                <span className="sd-risk-label" style={{ color: RISK_COLOR[r.severity] || "var(--tk-text-muted)" }}>{r.label}</span>
                {r.task.due_date && <span className="sd-risk-date">Due {fmtDate(r.task.due_date)}</span>}
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

  const trendColor = trend === "up"   ? "var(--tk-status-ok)"
                   : trend === "down" ? "var(--tk-status-danger)"
                   : "var(--tk-text-secondary)";

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";

  const stats = [
    { label: "Done this week",  value: completed_week,      color: "var(--tk-status-ok)",     icon: "✅" },
    { label: "Last week",       value: completed_prev_week, color: "var(--tk-text-secondary)", icon: "📅" },
    { label: "In progress",     value: inprogress,           color: "var(--tk-accent)",         icon: "🔄" },
    { label: "Delayed",         value: delayed,              color: "var(--tk-status-danger)",  icon: "⏰" },
  ];

  return (
    <div className="tk-card">
      <div className="sd-card-header">
        <span className="sd-card-icon">📈</span>
        <span className="sd-card-title">Progress</span>
        <span className="sd-trend" style={{ color: trendColor }}>
          {trendIcon} {trend_pct !== 0 ? `${Math.abs(trend_pct)}%` : ""}
          <span className="sd-trend-label">{trend === "up" ? "vs last week" : trend === "down" ? "vs last week" : "flat"}</span>
        </span>
      </div>

      <div className="sd-momentum-grid">
        {stats.map(s => (
          <div key={s.label} className="sd-momentum-stat">
            <div className="sd-momentum-icon">{s.icon}</div>
            <div className="sd-momentum-num" style={{ color: s.color }}>{s.value}</div>
            <div className="sd-momentum-label">{s.label}</div>
          </div>
        ))}
      </div>

      {(completed_week > 0 || completed_prev_week > 0) && (
        <div className="sd-sparkbar">
          <div className="sd-sparkbar-label">This week vs last week</div>
          <div className="sd-sparkbar-row">
            <span className="sd-sparkbar-week">Last</span>
            <div className="sd-sparkbar-track">
              <div className="sd-sparkbar-fill--prev" style={{ width: `${Math.min(100, completed_prev_week * 15)}%` }} />
            </div>
            <span className="sd-sparkbar-val">{completed_prev_week}</span>
          </div>
          <div className="sd-sparkbar-row">
            <span className="sd-sparkbar-week">Now</span>
            <div className="sd-sparkbar-track">
              <div className="sd-sparkbar-fill--cur" style={{ width: `${Math.min(100, completed_week * 15)}%` }} />
            </div>
            <span className="sd-sparkbar-val">{completed_week}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart Activity Feed ───────────────────────────────────────────────────────

const FEED_COLOR = {
  completed:  "var(--tk-status-ok)",
  inprogress: "var(--tk-accent)",
  created:    "var(--tk-accent)",
  updated:    "var(--tk-status-warn)",
};

function SmartActivityFeed({ feed }) {
  const FEED_ICON = { completed: "✅", inprogress: "🔄", created: "➕", updated: "✏️" };

  return (
    <div className="tk-card">
      <div className="sd-card-header">
        <span className="sd-card-icon">📡</span>
        <span className="sd-card-title">Activity Feed</span>
      </div>

      {!feed?.length ? (
        <div className="sd-empty">No recent activity yet.</div>
      ) : (
        <div className="sd-feed-list">
          {feed.map((item, i) => (
            <div key={i} className="sd-feed-row">
              <div
                className="sd-feed-dot"
                style={{ background: FEED_COLOR[item.type] || "var(--tk-border)" }}
              >
                {FEED_ICON[item.type] || "•"}
              </div>
              <div className="sd-feed-body">
                <div className="sd-feed-msg">{item.message}</div>
                <div className="sd-feed-time">{timeAgo(item.time)}</div>
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
      className={`sd-tasks-sort${activeSort === field ? " active" : ""}`}
      onClick={() => onSort(field)}
    >
      {label}
    </button>
  );
}

function MyTasksTable({ tasks }) {
  const [sort, setSort] = useState("score");

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

  const statusClass = (status) => {
    if (status === "todo")                              return "sd-status-todo";
    if (status === "inprogress" || status === "in_progress") return "sd-status-inprogress";
    if (status === "review")                            return "sd-status-review";
    if (status === "done")                              return "sd-status-done";
    return "sd-status-todo";
  };

  const statusLabel = (status) => {
    if (status === "inprogress" || status === "in_progress") return "In Progress";
    if (status === "todo")   return "To Do";
    if (status === "review") return "In Review";
    if (status === "done")   return "Done";
    return status;
  };

  return (
    <div className="tk-card sd-card-full">
      <div className="sd-card-header">
        <span className="sd-card-icon">📋</span>
        <span className="sd-card-title">My Active Tasks</span>
        <div className="sd-tasks-sorts">
          <SortBtn field="score"    label="Recommended" activeSort={sort} onSort={setSort} />
          <SortBtn field="priority" label="Priority"    activeSort={sort} onSort={setSort} />
          <SortBtn field="due"      label="Due date"    activeSort={sort} onSort={setSort} />
        </div>
        <span className="sd-card-sub">{tasks?.length || 0} tasks</span>
      </div>

      {!sorted.length ? (
        <div className="sd-empty">No active tasks — nice work!</div>
      ) : (
        <div className="sd-tasks-list">
          {sorted.map((task, i) => {
            const dl         = daysLeft(task.due_date);
            const pColor     = PRIORITY_COLOR[task.priority] || "var(--tk-text-secondary)";
            const isOverdue  = dl !== null && dl < 0;
            const isDueToday = dl !== null && dl < 1 && dl >= 0;

            return (
              <div
                key={task.id}
                className={`sd-task-row${isOverdue ? " sd-task-row--overdue" : isDueToday ? " sd-task-row--today" : ""}`}
              >
                <div className="sd-task-rank">#{i + 1}</div>
                <div className="sd-task-icon">{TYPE_ICON[task.type] || "📋"}</div>
                <div className="sd-task-main">
                  <div className="sd-task-title">{task.title}</div>
                  <div className="sd-task-meta">
                    <span className="sd-task-priority-dot" style={{ background: pColor }} />
                    <span style={{ color: pColor, fontSize: 11, fontFamily: "var(--tk-font-body)" }}>{task.priority}</span>
                    <span className="sd-task-type">{task.type}</span>
                  </div>
                </div>
                <div className="sd-task-progress-wrap">
                  <div className="tk-progress-track" style={{ flex: 1 }}>
                    <div
                      className="tk-progress-fill"
                      style={{ width: `${task.progress || 0}%` }}
                    />
                  </div>
                  <span className="sd-task-prog-pct">{task.progress || 0}%</span>
                </div>
                <div className={`sd-task-due${isOverdue ? " sd-task-due--overdue" : isDueToday ? " sd-task-due--today" : ""}`}>
                  {task.due_date
                    ? (isOverdue
                        ? `${Math.abs(dl)}d late`
                        : isDueToday
                          ? "Today"
                          : fmtDate(task.due_date))
                    : "—"}
                </div>
                <div className="sd-task-status">
                  <span className={`tk-pill ${statusClass(task.status)}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                    {statusLabel(task.status)}
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
  const [phase, setPhase]       = useState("focus");
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
  const activeStroke  = phase === "focus" ? "var(--tk-accent)" : "var(--tk-status-ok)";

  return (
    <div className="sd-focus-overlay">
      <div className="sd-focus-modal">
        <button className="sd-focus-close" onClick={onClose}>✕</button>
        <div className="sd-focus-timer-badge">{phase === "focus" ? "🎯 Focus" : "☕ Break"}</div>

        {task && (
          <div className="sd-focus-task-label">
            {TYPE_ICON[task.type] || "📋"} {task.title}
          </div>
        )}

        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="70" fill="none" className="sd-timer-track" strokeWidth="8" />
          <circle
            cx="90" cy="90" r="70" fill="none"
            stroke={activeStroke}
            strokeWidth="8"
            strokeDasharray={`${(progress / 100) * circumference} ${circumference}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s linear" }}
          />
          <text x="90" y="84" textAnchor="middle" fontSize="32" fontWeight="800" className="sd-timer-text-main">{mins}:{secs}</text>
          <text x="90" y="105" textAnchor="middle" fontSize="12" className="sd-timer-text-sub">
            {phase === "focus" ? "remaining" : "break"}
          </text>
        </svg>

        <div className="sd-focus-controls">
          <button
            className={running ? "tk-btn-secondary" : "tk-btn-primary"}
            onClick={() => setRunning(r => !r)}
          >
            {running ? "⏸ Pause" : "▶ Start"}
          </button>
          <button
            className="tk-btn-ghost"
            onClick={() => { setRunning(false); setTimeLeft(POMODORO); setPhase("focus"); }}
          >
            ↺ Reset
          </button>
        </div>

        <div className="sd-focus-tips">
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
    <div className="sd-quick-actions">
      <button className="tk-btn-primary" onClick={() => onFocusMode(nextTask)}>
        🎯 Enter Focus Mode
      </button>
      <button className="tk-btn-secondary" onClick={onRefresh}>
        🔄 Refresh
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SummaryDashboard({ workspaceId }) {
  useAuth();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [refresh,   setRefresh]   = useState(0);
  const [focusTask, setFocusTask] = useState(null);
  const [focusOpen, setFocusOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) { setLoading(false); setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/personal/dashboard?workspace_id=${workspaceId}`)
      .then(r => { if (!cancelled) { setData(r.data); setLoading(false); } })
      .catch(err => {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || "Failed to load dashboard");
          setLoading(false);
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
      <div className="sd-root">
        <div className="sd-loading">
          <div className="sd-loading-spinner" />
          <span>Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sd-root">
        <div className="sd-error-state">
          <div className="sd-error-icon">⚠️</div>
          <div className="sd-error-msg">{error}</div>
          <button className="tk-btn-secondary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sd-root">
        <div className="sd-empty-state">Select a workspace to see your personal dashboard.</div>
      </div>
    );
  }

  return (
    <div className="sd-root">
      {focusOpen && <FocusMode task={focusTask} onClose={() => setFocusOpen(false)} />}

      <QuickActions nextTask={data.next_action?.task} onFocusMode={openFocus} onRefresh={load} />

      <div className="sd-row-3">
        <TodayFocusCard todayFocus={data.today_focus} user={data.user} />
        <NextActionPanel nextAction={data.next_action} onOpenTask={null} />
        <CapacityWidget capacity={data.capacity} />
      </div>

      <div className="sd-row-2">
        <DayTimeline dayPlan={data.day_plan} />
        <RiskRadar risks={data.risk_radar} />
      </div>

      <div className="sd-row-2">
        <ProgressMomentum progress={data.progress} />
        <SmartActivityFeed feed={data.activity_feed} />
      </div>

      <MyTasksTable tasks={data.my_tasks} />
    </div>
  );
}
