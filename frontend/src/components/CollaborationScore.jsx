import { useState, useEffect } from "react";
import api from "../api/api";

const SCORE_COLOR = (s) =>
  s >= 70 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444";

const STATUS_BADGE = {
  active:   { bg: "#d1fae5", color: "#065f46", label: "Active" },
  on_leave: { bg: "#fef9c3", color: "#854d0e", label: "On Leave" },
  travel:   { bg: "#dbeafe", color: "#1d4ed8", label: "Travel" },
};

function ScoreRing({ score, size = 56 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = SCORE_COLOR(score);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.7s ease" }}
      />
      <text
        x={size / 2} y={size / 2 + 5}
        textAnchor="middle"
        fill={color}
        fontSize={13}
        fontWeight={700}
      >
        {score}
      </text>
    </svg>
  );
}

function MemberCard({ member }) {
  const badge = STATUS_BADGE[member.status] || STATUS_BADGE.active;

  return (
    <div className="collab-card">
      <div className="collab-card-top">
        <ScoreRing score={member.collaboration_score} />
        <div className="collab-card-info">
          <div className="collab-name">{member.name}</div>
          <span
            className="collab-status-badge"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
        </div>
      </div>

      <div className="collab-stats">
        <div className="collab-stat">
          <div className="collab-stat-val">{member.tasks_assigned}</div>
          <div className="collab-stat-lbl">Assigned</div>
        </div>
        <div className="collab-stat">
          <div className="collab-stat-val" style={{ color: "#10b981" }}>{member.tasks_completed}</div>
          <div className="collab-stat-lbl">Done</div>
        </div>
        <div className="collab-stat">
          <div className="collab-stat-val">{member.comments_made}</div>
          <div className="collab-stat-lbl">Comments</div>
        </div>
        <div className="collab-stat">
          <div className="collab-stat-val" style={{ color: member.at_risk_tasks > 0 ? "#ef4444" : "#10b981" }}>
            {member.at_risk_tasks}
          </div>
          <div className="collab-stat-lbl">At Risk</div>
        </div>
      </div>

      {/* Completion bar */}
      {member.tasks_assigned > 0 && (
        <div className="collab-progress">
          <div className="collab-progress-label">
            <span>Completion</span>
            <span>{Math.round((member.tasks_completed / member.tasks_assigned) * 100)}%</span>
          </div>
          <div className="collab-progress-track">
            <div
              className="collab-progress-fill"
              style={{
                width: `${Math.round((member.tasks_completed / member.tasks_assigned) * 100)}%`,
                background: SCORE_COLOR(member.collaboration_score),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CollaborationScore({ workspaceId }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    api.get(`/tasks/workspace/${workspaceId}/collaboration`)
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (!workspaceId) return null;

  return (
    <div className="collab-panel">
      <div className="collab-header">
        <h3>Team Collaboration Intelligence</h3>
        <p>Engagement scores based on task completion, activity, and at-risk work.</p>
      </div>

      {loading ? (
        <div className="collab-loading">
          <div className="spinner" style={{ width: 20, height: 20 }} />
          <span>Loading…</span>
        </div>
      ) : !data || data.members.length === 0 ? (
        <div className="collab-empty">
          No team members with assigned tasks yet. Assign tasks to team members to see collaboration scores.
        </div>
      ) : (
        <>
          {/* Top performer callout */}
          {data.members.length > 0 && (
            <div className="collab-top-performer">
              <span className="collab-top-icon">🏆</span>
              <span>
                <strong>{data.members[0].name}</strong> leads the team with a collaboration score of{" "}
                <strong style={{ color: SCORE_COLOR(data.members[0].collaboration_score) }}>
                  {data.members[0].collaboration_score}
                </strong>
              </span>
            </div>
          )}

          <div className="collab-grid">
            {data.members.map(m => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
