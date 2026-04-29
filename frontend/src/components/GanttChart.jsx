import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const STATUS_COLOR  = { todo: "#94a3b8", inprogress: "#6366f1", in_progress: "#6366f1", done: "#10b981", review: "#f59e0b" };
const PRIORITY_COLOR = { critical: "#dc2626", high: "#ef4444", medium: "#f59e0b", low: "#10b981" };
const ROW_H   = 36;
const LABEL_W = 220;
const DAY_W   = 28;
const HEADER_H = 48;

function daysRange(start, end) {
  const days = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatDay(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GanttChart({ workspaceId }) {
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tooltip, setTooltip]     = useState(null);
  const [groupBy, setGroupBy]     = useState("status"); // status | priority | assignee
  const [viewRange, setViewRange] = useState(30); // days to show
  const containerRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    api.get(`/tasks/workspace/${workspaceId}`)
      .then(res => setTasks(res.data.filter(t => t.start_date || t.due_date)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (!workspaceId) return null;

  if (loading) {
    return (
      <div className="gantt-loading">
        <div className="spinner" style={{ width: 24, height: 24 }} />
        <span>Loading Gantt chart…</span>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="gantt-empty">
        No tasks with dates found. Add start or due dates to tasks to see them on the Gantt chart.
      </div>
    );
  }

  // Compute date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allDates = tasks.flatMap(t => [
    t.start_date ? new Date(t.start_date) : null,
    t.due_date   ? new Date(t.due_date)   : null,
  ]).filter(Boolean);

  const minDate = new Date(Math.min(today, ...allDates.map(d => d.getTime())));
  minDate.setDate(minDate.getDate() - 2);

  const maxDate = new Date(Math.max(today, ...allDates.map(d => d.getTime())));
  maxDate.setDate(maxDate.getDate() + Math.max(4, viewRange - (allDates.length > 0
    ? Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) : 0)));

  const days = daysRange(minDate, maxDate);

  // Group tasks
  const grouped = {};
  tasks.forEach(t => {
    const key =
      groupBy === "priority" ? (t.priority || "none") :
      groupBy === "assignee" ? (t.assignee_name || "Unassigned") :
      t.status;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  // Build flat row list with group headers
  const rows = [];
  Object.entries(grouped).forEach(([group, groupTasks]) => {
    rows.push({ type: "group", label: group });
    groupTasks.forEach(t => rows.push({ type: "task", task: t }));
  });

  const svgWidth  = LABEL_W + days.length * DAY_W;
  const svgHeight = HEADER_H + rows.length * ROW_H + 8;

  const dayX = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((d - minDate) / (1000 * 60 * 60 * 24));
    return LABEL_W + diff * DAY_W;
  };

  const todayX = dayX(today);

  return (
    <div className="gantt-wrap">
      {/* Toolbar */}
      <div className="gantt-toolbar">
        <div className="gantt-group-btns">
          <span className="gantt-toolbar-label">Group by:</span>
          {["status", "priority", "assignee"].map(g => (
            <button
              key={g}
              className={`gantt-group-btn ${groupBy === g ? "active" : ""}`}
              onClick={() => setGroupBy(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="gantt-range-btns">
          <span className="gantt-toolbar-label">View:</span>
          {[14, 30, 60].map(r => (
            <button
              key={r}
              className={`gantt-group-btn ${viewRange === r ? "active" : ""}`}
              onClick={() => setViewRange(r)}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="gantt-scroll-wrap" ref={containerRef}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ fontFamily: "inherit", display: "block" }}
        >
          {/* Column backgrounds — alternate weeks */}
          {days.map((d, i) => {
            const week = Math.floor(i / 7);
            return (
              <rect
                key={i}
                x={LABEL_W + i * DAY_W}
                y={0}
                width={DAY_W}
                height={svgHeight}
                fill={week % 2 === 0 ? "#fafbff" : "#f8f9fc"}
                opacity={0.5}
              />
            );
          })}

          {/* Today line */}
          <line
            x1={todayX + DAY_W / 2} y1={0}
            x2={todayX + DAY_W / 2} y2={svgHeight}
            stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3"
          />
          <text x={todayX + DAY_W / 2 + 3} y={14} fill="#6366f1" fontSize={10} fontWeight={600}>
            Today
          </text>

          {/* Date header */}
          {days.map((d, i) => {
            // Show label every 3rd day or on week start
            const show = d.getDay() === 1 || i === 0 || i === days.length - 1;
            return show ? (
              <text
                key={i}
                x={LABEL_W + i * DAY_W + DAY_W / 2}
                y={HEADER_H - 8}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={9}
                fontWeight={d.getDay() === 1 ? 700 : 400}
              >
                {formatDay(d)}
              </text>
            ) : null;
          })}

          {/* Row separator */}
          <line x1={0} y1={HEADER_H} x2={svgWidth} y2={HEADER_H} stroke="#e2e8f0" />

          {/* Rows */}
          {rows.map((row, ri) => {
            const y = HEADER_H + ri * ROW_H;

            if (row.type === "group") {
              return (
                <g key={`group-${ri}`}>
                  <rect x={0} y={y} width={svgWidth} height={ROW_H} fill="#f1f5f9" />
                  <text x={10} y={y + ROW_H / 2 + 5} fontSize={11} fontWeight={700} fill="#374151"
                    style={{ textTransform: "capitalize" }}>
                    {row.label}
                  </text>
                  <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#e2e8f0" />
                </g>
              );
            }

            const t = row.task;
            const start = t.start_date ? new Date(t.start_date) : (t.due_date ? new Date(t.due_date) : null);
            const end   = t.due_date   ? new Date(t.due_date)   : start;

            if (!start) return null;

            const x1 = dayX(start);
            const x2 = dayX(end) + DAY_W;
            const barW = Math.max(DAY_W, x2 - x1);
            const barColor = STATUS_COLOR[t.status] || "#94a3b8";
            const priColor = PRIORITY_COLOR[t.priority] || "#94a3b8";
            const isOverdue = end < today && t.status !== "done";

            return (
              <g key={`task-${t.id}`}>
                {/* Row bg on hover */}
                <rect x={0} y={y} width={svgWidth} height={ROW_H} fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e => setTooltip({ task: t, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                />

                {/* Label area */}
                <foreignObject x={4} y={y + 4} width={LABEL_W - 8} height={ROW_H - 8}>
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{
                    fontSize: 11, color: "#1e293b", overflow: "hidden",
                    whiteSpace: "nowrap", textOverflow: "ellipsis",
                    display: "flex", alignItems: "center", gap: 4, height: "100%",
                  }}>
                    <span style={{ width: 6, height: 6, background: priColor, borderRadius: "50%", flexShrink: 0 }} />
                    {t.title}
                  </div>
                </foreignObject>

                {/* Bar */}
                <rect
                  x={x1}
                  y={y + 7}
                  width={barW}
                  height={ROW_H - 14}
                  rx={4}
                  fill={isOverdue ? "#fca5a5" : barColor}
                  opacity={0.85}
                />

                {/* Progress overlay */}
                {t.progress > 0 && t.progress < 100 && (
                  <rect
                    x={x1}
                    y={y + 7}
                    width={barW * (t.progress / 100)}
                    height={ROW_H - 14}
                    rx={4}
                    fill={barColor}
                    opacity={1}
                  />
                )}

                {/* Task title in bar */}
                {barW > 40 && (
                  <text
                    x={x1 + 6}
                    y={y + ROW_H / 2 + 4}
                    fontSize={10}
                    fill="#fff"
                    fontWeight={600}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {t.title.slice(0, Math.floor(barW / 7))}
                    {t.title.length > Math.floor(barW / 7) ? "…" : ""}
                  </text>
                )}

                <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#f1f5f9" />
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="gantt-tooltip"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <div className="gantt-tt-title">{tooltip.task.title}</div>
            <div className="gantt-tt-row">
              <span>Status</span><span style={{ textTransform: "capitalize" }}>{tooltip.task.status}</span>
            </div>
            <div className="gantt-tt-row">
              <span>Priority</span><span style={{ textTransform: "capitalize" }}>{tooltip.task.priority}</span>
            </div>
            {tooltip.task.start_date && (
              <div className="gantt-tt-row">
                <span>Start</span><span>{new Date(tooltip.task.start_date).toLocaleDateString()}</span>
              </div>
            )}
            {tooltip.task.due_date && (
              <div className="gantt-tt-row">
                <span>Due</span>
                <span style={{ color: new Date(tooltip.task.due_date) < new Date() && tooltip.task.status !== "done" ? "#dc2626" : "inherit" }}>
                  {new Date(tooltip.task.due_date).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="gantt-tt-row">
              <span>Progress</span><span>{tooltip.task.progress || 0}%</span>
            </div>
            {tooltip.task.assignee_name && (
              <div className="gantt-tt-row">
                <span>Assignee</span><span>{tooltip.task.assignee_name}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="gantt-legend">
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <span key={s} className="gantt-legend-item">
            <span style={{ background: c }} className="gantt-legend-dot" />
            {s}
          </span>
        ))}
        <span className="gantt-legend-item">
          <span style={{ background: "#fca5a5" }} className="gantt-legend-dot" />
          overdue
        </span>
        <span className="gantt-legend-item" style={{ color: "#6366f1" }}>
          ┆ today
        </span>
      </div>
    </div>
  );
}
