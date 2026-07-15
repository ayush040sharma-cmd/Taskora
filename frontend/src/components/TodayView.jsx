import { useState, useEffect } from "react";
import api from "../api/api";
import "../styles/board.css";
import "../styles/today.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function fmtMinutes(mins) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtDue(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// In-app counterpart to the daily briefing email — same buildBriefingContext()
// facts, rendered here instead of in an email template. See
// backend/services/briefing/buildContext.js for how these numbers are derived
// (never fabricated: everything traces back to a stored metric or a live count).
export default function TodayView({ onOpenTask }) {
  const [facts, setFacts]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/personal/today");
        if (!cancelled) setFacts(res.data);
      } catch {
        if (!cancelled) setError("Couldn't load today's briefing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openPriority = async (taskId) => {
    setOpening(taskId);
    try {
      const res = await api.get(`/tasks/${taskId}`);
      onOpenTask?.(res.data);
    } catch {
      // task may have moved/been deleted since the briefing was computed
    } finally {
      setOpening(null);
    }
  };

  if (loading) return <div className="tv-empty">Loading today's briefing…</div>;
  if (error)   return <div className="tv-empty tv-empty--error">{error}</div>;
  if (!facts)  return null;

  if (facts.suppress) {
    return (
      <div className="tv-view">
        <div className="tv-title">Good {greeting()}, {facts.user.first_name}</div>
        <div className="tv-empty">
          {facts.suppress_reason === "no_workspace"
            ? "Join or create a workspace to see your daily briefing."
            : "Not enough active tasks yet to build a meaningful briefing — assign yourself a few tasks and check back."}
        </div>
      </div>
    );
  }

  const { headline } = facts;
  const maxTrend = Math.max(1, ...(facts.weekly_trend || []).map(d => d.value));

  return (
    <div className="tv-view">
      <div className="tv-header">
        <div className="tv-title">Good {greeting()}, {facts.user.first_name}</div>
        <div className="tv-date">{new Date(facts.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
      </div>

      <div className="tv-stats">
        <div className="tv-stat">
          <div className="tv-stat-value">
            {headline.execution_score ?? "—"}
            {headline.execution_score_delta != null && (
              <span className={`tv-stat-delta ${headline.execution_score_delta >= 0 ? "tv-stat-delta--up" : "tv-stat-delta--down"}`}>
                {headline.execution_score_delta >= 0 ? "▲" : "▼"} {Math.abs(headline.execution_score_delta)}
              </span>
            )}
          </div>
          <div className="tv-stat-label">Execution score</div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-value">{fmtMinutes(headline.focus_time_minutes)}</div>
          <div className="tv-stat-label">Focus time</div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-value">{headline.meetings}</div>
          <div className="tv-stat-label">Meetings</div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-value" style={{ color: headline.high_risk_tasks > 0 ? "var(--tk-status-danger)" : undefined }}>
            {headline.high_risk_tasks}
          </div>
          <div className="tv-stat-label">High risk</div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-value" style={{ color: headline.blocked_tasks > 0 ? "var(--tk-status-warn)" : undefined }}>
            {headline.blocked_tasks}
          </div>
          <div className="tv-stat-label">Blocked</div>
        </div>
      </div>

      {facts.calculation_explainer && (
        <div className="tv-note">{facts.calculation_explainer}</div>
      )}
      {facts.risk_prediction && (
        <div className="tv-note tv-note--warn">⚠ {facts.risk_prediction}</div>
      )}
      {facts.workload_summary && (
        <div className="tv-note">{facts.workload_summary}</div>
      )}

      {facts.weekly_trend && facts.weekly_trend.length > 1 && (
        <div className="tv-trend">
          {facts.weekly_trend.map((d, i) => (
            <div key={i} className={`tv-trend-bar${d.isToday ? " tv-trend-bar--today" : ""}`}
                 style={{ height: `${Math.max(8, (d.value / maxTrend) * 100)}%` }}
                 title={`${d.value}`} />
          ))}
        </div>
      )}

      <div className="tv-section-label">Today's priorities</div>
      {facts.priorities.length === 0 && (
        <div className="tv-empty">Nothing ranked yet — open your board to see the full task list.</div>
      )}
      <div className="tv-priorities">
        {facts.priorities.map(p => (
          <button type="button" key={p.task_id} className="tv-priority-row" onClick={() => openPriority(p.task_id)}>
            <span className="tv-priority-stars" aria-hidden="true">{"★".repeat(p.stars)}{"☆".repeat(5 - p.stars)}</span>
            <span className="tk-sr-only">{p.stars} out of 5 priority.</span>
            <span className="tv-priority-title">{p.title}</span>
            {p.due_date && <span className="tv-priority-due">{fmtDue(p.due_date)}</span>}
            {p.effort_minutes != null && <span className="tv-priority-effort">{fmtMinutes(p.effort_minutes)}</span>}
            {opening === p.task_id && <span className="tv-priority-loading">…</span>}
            {p.recommended_action && <span className="tv-priority-reason">{p.recommended_action}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
