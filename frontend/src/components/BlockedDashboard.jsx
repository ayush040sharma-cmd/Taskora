import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

const SEV_COLOR = {
  critical: "#7f1d1d",
  high:     "#dc2626",
  medium:   "#f59e0b",
  low:      "#22c55e",
};
const SEV_BG = {
  critical: "#7f1d1d22",
  high:     "#dc262622",
  medium:   "#f59e0b22",
  low:      "#22c55e22",
};

function SeverityBadge({ severity = "medium" }) {
  return (
    <span style={{
      background: SEV_BG[severity] || SEV_BG.medium,
      color: SEV_COLOR[severity] || SEV_COLOR.medium,
      border: `1px solid ${SEV_COLOR[severity] || SEV_COLOR.medium}44`,
      fontSize: 10, fontWeight: 800, padding: "2px 8px",
      borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {severity}
    </span>
  );
}

function StatCard({ icon, label, value, sub, color = "#ef4444" }) {
  return (
    <div style={{
      background: "var(--card-bg)", borderRadius: 12, padding: "18px 20px",
      border: "1px solid var(--border)", minHeight: 100,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontSize: 26, fontWeight: 800, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function formatDuration(hours) {
  if (!hours || hours <= 0) return "—";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d ${Math.round(hours % 24)}h`;
}

export default function BlockedDashboard({ workspaceId, onTaskClick }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`/tasks/workspace/${workspaceId}/blocked-analytics`);
      setData(d);
    } catch (err) {
      console.error("Blocked analytics error:", err);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--text-secondary)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚫</div>
          <div>Loading blocked tasks…</div>
        </div>
      </div>
    );
  }

  const tasks = data?.blocked_tasks || [];
  const filteredTasks = filter === "all" ? tasks : tasks.filter(t => (t.blocked_severity || "medium") === filter);

  const sevBreakdown = data?.severity_breakdown || [];
  const criticalCount = sevBreakdown.find(s => s.severity === "critical")?.count || 0;

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard icon="🚫" label="Total Blocked" value={data?.total_blocked || 0}
          sub="Currently blocked tasks" color="#ef4444" />
        <StatCard icon="⏱" label="Avg Block Time" value={formatDuration(data?.avg_block_time_hours)}
          sub="Average time tasks stay blocked" color="#f59e0b" />
        <StatCard icon="🔴" label="Critical" value={criticalCount}
          sub="Critical severity blocks" color="#7f1d1d" />
        <StatCard icon="📅" label="Oldest Block"
          value={data?.oldest_blocked_task
            ? `${Math.round((data.oldest_blocked_task.hours_blocked || 0) / 24)}d ago`
            : "—"}
          sub={data?.oldest_blocked_task?.title || "No blocked tasks"}
          color="#8b5cf6" />
      </div>

      {/* Insight cards */}
      {(data?.most_blocking_user || data?.most_common_reason) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {data?.most_blocking_user && (
            <div style={{
              background: "var(--card-bg)", borderRadius: 12, padding: "16px 20px",
              border: "1px solid var(--border)",
            }}>
              <div style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Most Blocking Person
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", background: "var(--tk-accent, #3B82F6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 16,
                }}>
                  {(data.most_blocking_user.name || "?")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>
                    {data.most_blocking_user.name}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                    Blocking {data.most_blocking_user.block_count} task{data.most_blocking_user.block_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </div>
          )}

          {data?.most_common_reason && (
            <div style={{
              background: "var(--card-bg)", borderRadius: 12, padding: "16px 20px",
              border: "1px solid var(--border)",
            }}>
              <div style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Most Common Block Reason
              </div>
              <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 600 }}>
                "{data.most_common_reason}"
              </div>
            </div>
          )}
        </div>
      )}

      {/* Severity breakdown */}
      {sevBreakdown.length > 0 && (
        <div style={{ background: "var(--card-bg)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--border)", marginBottom: 24 }}>
          <div style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
            Blocked by Severity
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {["critical", "high", "medium", "low"].map(sev => {
              const found = sevBreakdown.find(s => s.severity === sev);
              const count = found?.count || 0;
              return (
                <div key={sev} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{
                    height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 6,
                  }}>
                    <div style={{
                      width: 32,
                      height: tasks.length > 0 ? `${Math.max(8, Math.round(count / tasks.length * 60))}px` : "8px",
                      background: SEV_COLOR[sev],
                      borderRadius: 4,
                      transition: "height 0.5s",
                    }} />
                  </div>
                  <SeverityBadge severity={sev} />
                  <div style={{ color: "var(--text-secondary)", fontSize: 16, fontWeight: 700, marginTop: 6 }}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Blocked tasks table */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 700, margin: 0 }}>
          Blocked Tasks ({tasks.length})
        </h3>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "critical", "high", "medium", "low"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "var(--tk-accent, #3B82F6)" : "var(--border)",
                border: "none", borderRadius: 8, padding: "4px 12px",
                color: filter === f ? "#fff" : "var(--text-secondary)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div style={{
          background: "var(--card-bg)", borderRadius: 12, padding: "48px 20px",
          border: "1px solid var(--border)", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700 }}>
            {tasks.length === 0 ? "No blocked tasks!" : "No tasks match this filter"}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 8 }}>
            {tasks.length === 0 ? "All your tasks are moving forward." : "Try a different severity filter."}
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr",
            padding: "10px 16px",
            background: "var(--card-bg)",
            borderBottom: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            <div>Task</div>
            <div>Blocked By / Reason</div>
            <div>Severity</div>
            <div>Since</div>
            <div>Expected Fix</div>
          </div>
          {filteredTasks.map((task, i) => (
            <div
              key={task.id}
              onClick={() => onTaskClick && onTaskClick(task)}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr",
                padding: "14px 16px",
                borderBottom: i < filteredTasks.length - 1 ? "1px solid var(--card-bg)" : "none",
                cursor: onTaskClick ? "pointer" : "default",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(30,41,59,0.27)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 13, marginBottom: 3 }}>{task.title}</div>
                {task.assignee_name && (
                  <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>→ {task.assignee_name}</div>
                )}
              </div>
              <div>
                {task.blocked_by_task_title && (
                  <div style={{ color: "#f59e0b", fontSize: 12, marginBottom: 2 }}>
                    ↳ {task.blocked_by_task_title}
                  </div>
                )}
                {task.blocked_reason && (
                  <div style={{ color: "var(--text-secondary)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.blocked_reason}
                  </div>
                )}
                {!task.blocked_by_task_title && !task.blocked_reason && (
                  <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>No reason given</span>
                )}
              </div>
              <div>
                <SeverityBadge severity={task.blocked_severity || "medium"} />
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {task.date_blocked
                  ? new Date(task.date_blocked).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
                {task.hours_blocked > 0 && (
                  <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>
                    {formatDuration(task.hours_blocked)}
                  </div>
                )}
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {task.blocked_expected_resolution
                  ? new Date(task.blocked_expected_resolution).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
