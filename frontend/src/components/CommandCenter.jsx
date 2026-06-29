import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = "var(--tk-accent, #3B82F6)", onClick, badge }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--card-bg)", borderRadius: 12, padding: "18px 20px",
        border: "1px solid var(--border)", cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.2s, transform 0.15s",
        display: "flex", flexDirection: "column", gap: 8, minHeight: 110,
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = "translateY(-2px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {badge != null && (
          <span style={{
            background: color + "22", color, fontSize: 11, fontWeight: 700,
            padding: "2px 8px", borderRadius: 20, border: `1px solid ${color}44`,
          }}>{badge}</span>
        )}
      </div>
      <div>
        <div style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div style={{ color: "var(--text-primary)", fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 28 }}>
      <h3 style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>{title}</h3>
      {action && (
        <button onClick={onAction} style={{
          background: "none", border: "none", color: "var(--tk-accent, #3B82F6)", fontSize: 12,
          cursor: "pointer", fontWeight: 600, padding: "2px 8px",
        }}>{action} →</button>
      )}
    </div>
  );
}

// ── Priority badge ────────────────────────────────────────────────────────────
const PRIORITY_COLOR = { high: "#ef4444", critical: "#7f1d1d", medium: "#f59e0b", low: "#22c55e" };

function PriorityBadge({ priority }) {
  return (
    <span style={{
      background: (PRIORITY_COLOR[priority] || "var(--tk-accent, #3B82F6)") + "22",
      color: PRIORITY_COLOR[priority] || "var(--tk-accent, #3B82F6)",
      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
      textTransform: "uppercase",
    }}>{priority}</span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLOR = { todo: "#64748b", in_progress: "#3b82f6", inprogress: "#3b82f6", review: "#f59e0b", done: "#22c55e", blocked: "#ef4444" };
const STATUS_LABEL = { todo: "Todo", in_progress: "In Progress", inprogress: "In Progress", review: "Review", done: "Done", blocked: "Blocked" };

function StatusBadge({ status }) {
  return (
    <span style={{
      background: (STATUS_COLOR[status] || "#64748b") + "22",
      color: STATUS_COLOR[status] || "#64748b",
      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
    }}>{STATUS_LABEL[status] || status}</span>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onOpenDetail }) {
  return (
    <div
      onClick={() => onOpenDetail(task)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: "1px solid var(--card-bg)", cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(30,41,59,0.27)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </div>
        {task.assignee_name && (
          <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>{task.assignee_name}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
      </div>
      {task.due_date && (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, flexShrink: 0 }}>
          {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      )}
    </div>
  );
}

// ── Workload bar ──────────────────────────────────────────────────────────────
function WorkloadBar({ name, pct, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{name}</span>
        <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

export default function CommandCenter({ workspaceId, onNavigate, onOpenDetail, tasks = [] }) {
  const [analytics, setAnalytics]       = useState(null);
  const [blockedData, setBlockedData]   = useState(null);
  const [workload, setWorkload]         = useState(null);
  const [sprints, setSprints]           = useState([]);
  const [approvals, setApprovals]       = useState([]);
  const [auditLogs, setAuditLogs]       = useState([]);
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [blockedRes, workloadRes, sprintsRes, approvalsRes, auditRes] = await Promise.allSettled([
        api.get(`/tasks/workspace/${workspaceId}/blocked-analytics`),
        api.get(`/workload/${workspaceId}/team`),
        api.get(`/sprints?workspace_id=${workspaceId}`),
        api.get(`/approvals?workspace_id=${workspaceId}&status=pending`),
        api.get(`/audit?workspace_id=${workspaceId}&limit=8`),
      ]);

      if (blockedRes.status === "fulfilled") setBlockedData(blockedRes.value.data);
      if (workloadRes.status === "fulfilled") setWorkload(workloadRes.value.data);
      if (sprintsRes.status === "fulfilled")  setSprints(sprintsRes.value.data || []);
      if (approvalsRes.status === "fulfilled") setApprovals(approvalsRes.value.data || []);
      if (auditRes.status === "fulfilled")    setAuditLogs(auditRes.value.data?.logs || auditRes.value.data || []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived metrics from tasks prop ──────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const totalTasks     = tasks.length;
  const doneTasks      = tasks.filter(t => t.status === "done").length;
  const todayCompleted = tasks.filter(t => t.completed_at?.startsWith(today)).length;
  const highPriority   = tasks.filter(t => t.priority === "high" && t.status !== "done");
  const upcoming       = tasks.filter(t => t.due_date && t.due_date >= today && t.due_date <= sevenDays && t.status !== "done");
  const blocked        = tasks.filter(t => t.status === "blocked");
  const todayPct       = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;

  const activeSprint = sprints.find(s => s.status === "active");
  const sprintTasks  = activeSprint ? tasks.filter(t => t.sprint_id === activeSprint.id) : [];
  const sprintDone   = sprintTasks.filter(t => t.status === "done").length;
  const sprintPct    = sprintTasks.length > 0 ? Math.round(sprintDone / sprintTasks.length * 100) : 0;

  const statusBreakdown = ["todo", "in_progress", "review", "done", "blocked"].map(s => ({
    status: s,
    count: tasks.filter(t => t.status === s || (s === "in_progress" && t.status === "inprogress")).length,
  }));

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--text-secondary)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
          <div>Loading command center…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* ── Key Metrics ── */}
      <SectionHeader title="Today's Overview" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard icon="✅" label="Total Progress" value={`${todayPct}%`}
          sub={`${doneTasks} of ${totalTasks} tasks done`}
          color="#22c55e" onClick={() => onNavigate("board")} />
        <StatCard icon="🚫" label="Blocked Tasks" value={blocked.length}
          sub={blockedData?.avg_block_time_hours ? `Avg ${blockedData.avg_block_time_hours}h blocked` : "Unblock now"}
          color="#ef4444" onClick={() => onNavigate("blocked")} badge={blocked.length > 0 ? "Action needed" : null} />
        <StatCard icon="⚡" label="High Priority" value={highPriority.length}
          sub="Tasks needing attention"
          color="#f59e0b" onClick={() => onNavigate("board")} />
        <StatCard icon="📅" label="Due This Week" value={upcoming.length}
          sub="Upcoming deadlines"
          color="var(--tk-accent, #3B82F6)" onClick={() => onNavigate("calendar")} />
        <StatCard icon="✔" label="Pending Approvals" value={approvals.length}
          sub="Awaiting your review"
          color="#8b5cf6" onClick={() => onNavigate("approvals")} badge={approvals.length > 0 ? "Pending" : null} />
        <StatCard icon="🏃" label="Sprint Health"
          value={activeSprint ? `${sprintPct}%` : "No sprint"}
          sub={activeSprint ? `${sprintDone}/${sprintTasks.length} tasks done` : "Create a sprint to track"}
          color="#06b6d4" onClick={() => onNavigate("sprints")} />
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 4 }}>
        {/* LEFT column */}
        <div>
          {/* High priority tasks */}
          <SectionHeader title="High Priority Tasks" action="View Board" onAction={() => onNavigate("board")} />
          <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
            {highPriority.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                No high priority tasks — great job! 🎉
              </div>
            ) : (
              highPriority.slice(0, 5).map(t => <TaskRow key={t.id} task={t} onOpenDetail={onOpenDetail} />)
            )}
            {highPriority.length > 5 && (
              <div style={{ padding: "10px 14px", textAlign: "center" }}>
                <button onClick={() => onNavigate("board")} style={{
                  background: "none", border: "none", color: "var(--tk-accent, #3B82F6)",
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}>
                  +{highPriority.length - 5} more →
                </button>
              </div>
            )}
          </div>

          {/* Blocked tasks */}
          {blocked.length > 0 && (
            <>
              <SectionHeader title="Blocked Tasks" action="View Blocked" onAction={() => onNavigate("blocked")} />
              <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid #7f1d1d", overflow: "hidden" }}>
                {blocked.slice(0, 3).map(t => <TaskRow key={t.id} task={t} onOpenDetail={onOpenDetail} />)}
                {blocked.length > 3 && (
                  <div style={{ padding: "10px 14px", textAlign: "center" }}>
                    <button onClick={() => onNavigate("blocked")} style={{
                      background: "none", border: "none", color: "#ef4444",
                      cursor: "pointer", fontSize: 12, fontWeight: 600,
                    }}>
                      +{blocked.length - 3} more blocked →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT column */}
        <div>
          {/* Task status breakdown */}
          <SectionHeader title="Task Status Breakdown" action="Analytics" onAction={() => onNavigate("analytics")} />
          <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", padding: "16px 20px" }}>
            {statusBreakdown.map(({ status, count }) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <StatusBadge status={status} />
                <div style={{ flex: 1, height: 6, background: "var(--card-bg)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: totalTasks > 0 ? `${Math.round(count / totalTasks * 100)}%` : "0%",
                    background: STATUS_COLOR[status] || "#64748b",
                    borderRadius: 3,
                    transition: "width 0.5s",
                  }} />
                </div>
                <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, minWidth: 24, textAlign: "right" }}>{count}</span>
              </div>
            ))}
            {totalTasks === 0 && (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: "12px 0" }}>No tasks yet</div>
            )}
          </div>

          {/* Workload distribution */}
          {workload?.members && workload.members.length > 0 && (
            <>
              <SectionHeader title="Workload Distribution" action="View Workload" onAction={() => onNavigate("workload")} />
              <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", padding: "16px 20px" }}>
                {workload.members.slice(0, 5).map(m => {
                  const pct = Math.round((m.active_tasks || 0) / Math.max(1, m.capacity || 8) * 100);
                  const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
                  return (
                    <WorkloadBar
                      key={m.user_id || m.id}
                      name={m.name}
                      pct={Math.min(100, pct)}
                      color={color}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Upcoming deadlines */}
          {upcoming.length > 0 && (
            <>
              <SectionHeader title="Upcoming Deadlines" action="Calendar" onAction={() => onNavigate("calendar")} />
              <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
                {upcoming.slice(0, 4).map(t => <TaskRow key={t.id} task={t} onOpenDetail={onOpenDetail} />)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      {auditLogs.length > 0 && (
        <>
          <SectionHeader title="Recent Activity" action="View All" onAction={() => onNavigate("activity")} />
          <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
            {auditLogs.slice(0, 6).map((log, i) => (
              <div key={log.id || i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                borderBottom: i < Math.min(5, auditLogs.length - 1) ? "1px solid var(--card-bg)" : "none",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "var(--card-bg)", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 14, flexShrink: 0,
                }}>
                  {log.action?.includes("delete") ? "🗑" :
                   log.action?.includes("complet") ? "✅" :
                   log.action?.includes("assign") ? "👤" :
                   log.action?.includes("creat") ? "✨" : "📝"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{log.actor_name || "Someone"}</strong>
                    {" "}{(log.action || "").replace(/_/g, " ")}
                    {log.meta?.task_title ? `: "${log.meta.task_title}"` : ""}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>
                    {log.created_at ? new Date(log.created_at).toLocaleString() : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Sprint Health detail ── */}
      {activeSprint && (
        <>
          <SectionHeader title="Active Sprint" action="View Sprints" onAction={() => onNavigate("sprints")} />
          <div style={{
            background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)",
            padding: "20px", display: "flex", alignItems: "center", gap: 20,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 16 }}>{activeSprint.name}</div>
              {activeSprint.goal && <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{activeSprint.goal}</div>}
              <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 8 }}>
                {sprintDone} / {sprintTasks.length} tasks complete
                {activeSprint.end_date && ` · ends ${new Date(activeSprint.end_date).toLocaleDateString()}`}
              </div>
            </div>
            <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--tk-accent, #3B82F6)" strokeWidth="3"
                  strokeDasharray={`${sprintPct} ${100 - sprintPct}`}
                  strokeDashoffset="0" strokeLinecap="round" />
              </svg>
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "var(--text-primary)", fontSize: 14, fontWeight: 700,
              }}>{sprintPct}%</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
