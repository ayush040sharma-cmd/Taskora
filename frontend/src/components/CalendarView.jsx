/**
 * CalendarView — Phase 1 upgrade
 * Full month calendar with:
 *  - Real calendar_events from /api/calendar
 *  - Task deadline overlays from workspace tasks
 *  - Click-to-create events on any day
 *  - Event type colour coding
 *  - Upcoming events sidebar
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import api from "../api/api";

const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const EVENT_TYPES = [
  { value: "event",     label: "Event",     color: "#6366f1" },
  { value: "meeting",   label: "Meeting",   color: "#0ea5e9" },
  { value: "deadline",  label: "Deadline",  color: "#ef4444" },
  { value: "milestone", label: "Milestone", color: "#f59e0b" },
  { value: "leave",     label: "Leave",     color: "#10b981" },
  { value: "travel",    label: "Travel",    color: "#8b5cf6" },
];

const TYPE_COLOR = Object.fromEntries(EVENT_TYPES.map(t => [t.value, t.color]));
const PRIORITY_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#10b981" };

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

// ── Create Event Mini-Modal ────────────────────────────────────
function EventForm({ date, workspaceId, onSave, onClose }) {
  const [form, setForm] = useState({
    title:      "",
    type:       "event",
    start_date: date ? date.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    end_date:   "",
    description:"",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const submit = async () => {
    if (!form.title.trim()) { setError("Title required"); return; }
    setSaving(true);
    try {
      const r = await api.post("/calendar", {
        ...form,
        workspace_id: workspaceId,
        end_date: form.end_date || null,
        color: TYPE_COLOR[form.type] || "#6366f1",
      });
      onSave(r.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="cal-form-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cal-form-modal">
        <div className="cal-form-header">
          <h3>New Event</h3>
          <button className="cal-form-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="cal-form-error">{error}</div>}

        <input
          className="modal-input"
          placeholder="Event title…"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && submit()}
          autoFocus
        />

        <div className="cal-form-row">
          <div className="cal-form-group">
            <label className="cal-form-label">Type</label>
            <select
              className="modal-input"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            >
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="cal-form-group">
            <label className="cal-form-label">Start date</label>
            <input
              className="modal-input"
              type="date"
              value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            />
          </div>
          <div className="cal-form-group">
            <label className="cal-form-label">End date</label>
            <input
              className="modal-input"
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            />
          </div>
        </div>

        <textarea
          className="modal-input"
          placeholder="Description (optional)"
          rows={2}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          style={{ marginTop: 8, resize: "vertical" }}
        />

        <div className="cal-form-footer">
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-modal-submit" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Day Popover ───────────────────────────────────────────────
function DayPopover({ date, events, deadlines, onEventClick, onClose }) {
  const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="cal-popover-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cal-popover">
        <div className="cal-popover-header">
          <span>{label}</span>
          <button onClick={onClose}>✕</button>
        </div>
        {events.length === 0 && deadlines.length === 0 && (
          <div className="cal-popover-empty">Nothing scheduled</div>
        )}
        {events.map(ev => (
          <div
            key={ev.id}
            className="cal-popover-item"
            style={{ borderLeft: `3px solid ${ev.color || TYPE_COLOR[ev.type] || "#6366f1"}` }}
            onClick={() => onEventClick(ev)}
          >
            <div className="cal-popover-title">{ev.title}</div>
            <div className="cal-popover-meta">{ev.type} · {ev.created_by_name}</div>
          </div>
        ))}
        {deadlines.map(t => (
          <div
            key={`dl-${t.id}`}
            className="cal-popover-item cal-popover-item--deadline"
            style={{ borderLeft: `3px solid ${PRIORITY_COLOR[t.priority] || "#999"}` }}
          >
            <div className="cal-popover-title">🚩 {t.title}</div>
            <div className="cal-popover-meta">{t.type} · deadline</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main CalendarView ─────────────────────────────────────────
export default function CalendarView({ workspaceId, tasks = [], onTaskClick }) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [events,    setEvents]    = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const [createDate,  setCreateDate]  = useState(null); // Date obj — show create form
  const [popoverDate, setPopoverDate] = useState(null); // Date obj — show day popover
  const [selectedEv,  setSelectedEv]  = useState(null); // event detail (future)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Fetch events whenever month/year/workspace changes
  const fetchEvents = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const r = await api.get(`/calendar?workspace_id=${workspaceId}&year=${year}&month=${month}`);
      setEvents(r.data.events   || []);
      setDeadlines(r.data.task_deadlines || []);
    } catch {
      // Fallback to prop-based tasks if API fails (table may not exist yet)
      setEvents([]);
      setDeadlines(tasks.filter(t => t.due_date));
    } finally { setLoading(false); }
  }, [workspaceId, year, month]); // eslint-disable-line

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Build calendar grid
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    return arr;
  }, [year, month, firstDay, daysInMonth]);

  // Map events to dates
  const evsByDate = useMemo(() => {
    const map = {};
    const addToDate = (dateStr, item, key) => {
      if (!dateStr) return;
      if (!map[key]) map[key] = { events: [], deadlines: [] };
      map[key][item.type === "deadline_task" ? "deadlines" : "events"].push(item);
    };
    events.forEach(ev => {
      const d = new Date(ev.start_date + "T12:00:00");
      addToDate(ev.start_date, ev, `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    deadlines.forEach(t => {
      if (!t.due_date) return;
      const d = new Date(t.due_date + "T12:00:00");
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = { events: [], deadlines: [] };
      map[key].deadlines.push(t);
    });
    return map;
  }, [events, deadlines]);

  const getDay = (date) => {
    if (!date) return { events: [], deadlines: [] };
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return evsByDate[key] || { events: [], deadlines: [] };
  };

  // Upcoming events (next 14 days)
  const upcoming = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 14);
    return [...events]
      .filter(ev => {
        const d = new Date(ev.start_date + "T12:00:00");
        return d >= today && d <= cutoff;
      })
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .slice(0, 8);
  }, [events]); // eslint-disable-line

  const handleDayClick = (date) => {
    const { events: dayEvs, deadlines: dayDls } = getDay(date);
    if (dayEvs.length + dayDls.length > 0) {
      setPopoverDate(date);
    } else {
      setCreateDate(date);
    }
  };

  const handleEventSaved = (newEv) => {
    setEvents(prev => [...prev, newEv]);
    setCreateDate(null);
  };

  const handleDeleteEvent = async (evId) => {
    try {
      await api.delete(`/calendar/${evId}`);
      setEvents(prev => prev.filter(e => e.id !== evId));
      setPopoverDate(null);
    } catch {}
  };

  return (
    <div className="cal-root cal-root--v2">
      <div className="cal-main">
        {/* ── Header ── */}
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <div className="cal-title-group">
            <h2 className="cal-title">{MONTHS[month]} {year}</h2>
            {loading && <span className="cal-loading-dot" />}
          </div>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          <button className="cal-today-btn" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>
            Today
          </button>
          {workspaceId && (
            <button className="cal-add-btn" onClick={() => setCreateDate(today)}>+ Event</button>
          )}
        </div>

        {/* ── Type legend ── */}
        <div className="cal-legend">
          {EVENT_TYPES.map(t => (
            <span key={t.value} className="cal-legend-item">
              <span className="cal-legend-dot" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="cal-legend-item">
            <span className="cal-legend-dot cal-legend-dot--deadline" />
            Task deadline
          </span>
        </div>

        {/* ── Day names ── */}
        <div className="cal-day-names">
          {DAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
        </div>

        {/* ── Grid ── */}
        <div className="cal-grid">
          {cells.map((date, idx) => {
            const isToday    = date && isSameDay(date, today);
            const isPast     = date && date < today && !isToday;
            const { events: dayEvs, deadlines: dayDls } = getDay(date);
            const total = dayEvs.length + dayDls.length;

            return (
              <div
                key={idx}
                className={[
                  "cal-cell",
                  !date        ? "cal-cell--empty"   : "",
                  isToday      ? "cal-cell--today"   : "",
                  isPast       ? "cal-cell--past"    : "",
                  total > 0    ? "cal-cell--has-ev"  : "",
                ].join(" ")}
                onClick={() => date && handleDayClick(date)}
              >
                {date && (
                  <>
                    <div className="cal-date-num">{date.getDate()}</div>
                    <div className="cal-cell-items">
                      {dayEvs.slice(0, 2).map(ev => (
                        <div
                          key={ev.id}
                          className="cal-ev-chip"
                          style={{ background: (ev.color || TYPE_COLOR[ev.type] || "#6366f1") + "22",
                                   borderLeft: `2px solid ${ev.color || TYPE_COLOR[ev.type] || "#6366f1"}`,
                                   color: ev.color || TYPE_COLOR[ev.type] || "#6366f1" }}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayDls.slice(0, dayEvs.length >= 2 ? 0 : 2 - dayEvs.length).map(t => (
                        <div
                          key={`dl-${t.id}`}
                          className="cal-ev-chip cal-ev-chip--deadline"
                          style={{ borderLeft: `2px solid ${PRIORITY_COLOR[t.priority] || "#999"}` }}
                          title={t.title}
                        >
                          🚩 {t.title}
                        </div>
                      ))}
                      {total > 2 && <div className="cal-more">+{total - 2} more</div>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Upcoming sidebar ── */}
      <div className="cal-sidebar">
        <div className="cal-sidebar-title">Upcoming (14 days)</div>
        {upcoming.length === 0 && (
          <div className="cal-sidebar-empty">No events in the next 14 days</div>
        )}
        {upcoming.map(ev => (
          <div
            key={ev.id}
            className="cal-sidebar-item"
            style={{ borderLeft: `3px solid ${ev.color || TYPE_COLOR[ev.type] || "#6366f1"}` }}
          >
            <div className="cal-sidebar-date">
              {new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
            <div className="cal-sidebar-name">{ev.title}</div>
            <div className="cal-sidebar-type">{ev.type}</div>
            <button
              className="cal-sidebar-del"
              onClick={() => handleDeleteEvent(ev.id)}
              title="Delete event"
            >✕</button>
          </div>
        ))}
      </div>

      {/* ── Create event form ── */}
      {createDate && workspaceId && (
        <EventForm
          date={createDate}
          workspaceId={workspaceId}
          onSave={handleEventSaved}
          onClose={() => setCreateDate(null)}
        />
      )}

      {/* ── Day popover ── */}
      {popoverDate && (
        <DayPopover
          date={popoverDate}
          events={getDay(popoverDate).events}
          deadlines={getDay(popoverDate).deadlines}
          onEventClick={ev => { setSelectedEv(ev); setPopoverDate(null); }}
          onClose={() => setPopoverDate(null)}
        />
      )}
    </div>
  );
}
