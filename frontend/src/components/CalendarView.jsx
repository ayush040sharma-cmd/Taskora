import { useState, useMemo } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

export default function CalendarView({ tasks = [], onTaskClick }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    return arr;
  }, [year, month, firstDay, daysInMonth]);

  // Map tasks to their due_date
  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = new Date(t.due_date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  const getTasksForDay = (date) => {
    if (!date) return [];
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return tasksByDate[key] || [];
  };

  const priorityColor = (p) => p === "high" ? "#de350b" : p === "medium" ? "#ff8b00" : "#00875a";

  return (
    <div className="cal-root">
      {/* Header */}
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
        <h2 className="cal-title">{MONTHS[month]} {year}</h2>
        <button className="cal-nav-btn" onClick={nextMonth}>›</button>
        <button className="cal-today-btn" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>
          Today
        </button>
      </div>

      {/* Day names */}
      <div className="cal-day-names">
        {DAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
      </div>

      {/* Grid */}
      <div className="cal-grid">
        {cells.map((date, idx) => {
          const isToday = date && isSameDay(date, today);
          const dayTasks = getTasksForDay(date);
          return (
            <div
              key={idx}
              className={`cal-cell ${!date ? "cal-cell--empty" : ""} ${isToday ? "cal-cell--today" : ""}`}
            >
              {date && (
                <>
                  <div className="cal-date-num">{date.getDate()}</div>
                  <div className="cal-task-chips">
                    {dayTasks.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        className="cal-task-chip"
                        style={{ borderLeft: `3px solid ${priorityColor(t.priority)}` }}
                        onClick={() => onTaskClick && onTaskClick(t)}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="cal-more">+{dayTasks.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <span className="cal-legend-item" style={{ borderLeft: "3px solid #de350b" }}>High</span>
        <span className="cal-legend-item" style={{ borderLeft: "3px solid #ff8b00" }}>Medium</span>
        <span className="cal-legend-item" style={{ borderLeft: "3px solid #00875a" }}>Low</span>
      </div>
    </div>
  );
}
