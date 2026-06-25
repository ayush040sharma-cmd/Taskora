import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

const PRIORITY_COLOR = { critical: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" };
const STATUS_LABEL   = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const STATUS_COLOR   = { pending: "#F59E0B", approved: "#22C55E", rejected: "#EF4444" };

function PriorityPill({ priority }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: PRIORITY_COLOR[priority] + "22",
      color: PRIORITY_COLOR[priority],
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: STATUS_COLOR[status] + "22",
      color: STATUS_COLOR[status],
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function ApprovalCard({ approval, onApprove, onReject, isApprover }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    await onReject(approval.id, reason);
    setLoading(false);
    setRejecting(false);
  };

  const handleApprove = async () => {
    setLoading(true);
    await onApprove(approval.id);
    setLoading(false);
  };

  return (
    <div className="tk-card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tk-text-primary)" }}>
              {approval.task_title}
            </span>
            <PriorityPill priority={approval.priority} />
            <StatusBadge status={approval.status} />
          </div>
          <div style={{ fontSize: 12, color: "var(--tk-text-muted)", lineHeight: 1.8 }}>
            <span>Requested by <strong style={{ color: "var(--tk-text-secondary)" }}>{approval.requested_by_name}</strong></span>
            <span style={{ margin: "0 6px" }}>·</span>
            <span>Assign to <strong style={{ color: "var(--tk-text-secondary)" }}>{approval.assigned_to_name}</strong></span>
            <span style={{ margin: "0 6px" }}>·</span>
            <span>Approver <strong style={{ color: "var(--tk-text-secondary)" }}>{approval.approver_name}</strong></span>
          </div>
          {approval.justification && (
            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 6,
              background: "var(--tk-bg-elevated)", border: "1px solid var(--tk-border)",
              fontSize: 12, color: "var(--tk-text-secondary)", fontStyle: "italic",
            }}>
              "{approval.justification}"
            </div>
          )}
          {approval.rejection_reason && (
            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 6,
              background: "var(--tk-status-danger-bg)", borderLeft: "3px solid var(--tk-status-danger)",
              fontSize: 12, color: "var(--tk-status-danger)",
            }}>
              Rejected: {approval.rejection_reason}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--tk-text-faint)" }}>
            {new Date(approval.requested_at).toLocaleString()}
          </div>
        </div>

        {isApprover && approval.status === "pending" && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
            {!rejecting ? (
              <>
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  style={{
                    padding: "6px 16px", borderRadius: "var(--tk-radius-btn)",
                    background: "var(--tk-gradient)", color: "#fff",
                    border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => setRejecting(true)}
                  disabled={loading}
                  style={{
                    padding: "6px 16px", borderRadius: "var(--tk-radius-btn)",
                    background: "transparent", color: "var(--tk-status-danger)",
                    border: "1px solid var(--tk-status-danger)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Reject
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                <input
                  autoFocus
                  placeholder="Reason for rejection (optional)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  style={{
                    padding: "6px 10px", borderRadius: "var(--tk-radius-sm)",
                    border: "1px solid var(--tk-border)", background: "var(--tk-bg-elevated)",
                    color: "var(--tk-text-primary)", fontSize: 12, outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={handleReject}
                    disabled={loading}
                    style={{
                      flex: 1, padding: "5px 10px", borderRadius: "var(--tk-radius-btn)",
                      background: "var(--tk-status-danger)", color: "#fff",
                      border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => { setRejecting(false); setReason(""); }}
                    style={{
                      padding: "5px 10px", borderRadius: "var(--tk-radius-btn)",
                      background: "transparent", color: "var(--tk-text-muted)",
                      border: "1px solid var(--tk-border)", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsView({ workspaceId }) {
  const { user } = useAuth();
  const [pending, setPending]   = useState([]);
  const [all,     setAll]       = useState([]);
  const [tab,     setTab]       = useState("pending"); // "pending" | "all"
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState("");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true); setError("");
    try {
      const [pendR, allR] = await Promise.all([
        api.get("/approvals/pending"),
        api.get(`/approvals?workspace_id=${workspaceId}`),
      ]);
      setPending(pendR.data);
      setAll(allR.data);
    } catch {
      setError("Could not load approvals.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    try {
      await api.put(`/approvals/${id}/approve`);
      load();
    } catch (e) {
      alert(e.response?.data?.message || "Failed to approve.");
    }
  };

  const handleReject = async (id, reason) => {
    try {
      await api.put(`/approvals/${id}/reject`, { rejection_reason: reason });
      load();
    } catch (e) {
      alert(e.response?.data?.message || "Failed to reject.");
    }
  };

  const displayed = tab === "pending" ? pending : all;
  const pendingCount = pending.length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 4px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: "var(--tk-font-display)", fontSize: 22, fontWeight: 700,
          color: "var(--tk-text-primary)", marginBottom: 4,
        }}>
          Approvals
        </div>
        <div style={{ fontSize: 13, color: "var(--tk-text-muted)" }}>
          Task assignment requests that need your review, and requests you've submitted.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--tk-border)", paddingBottom: 0 }}>
        {[
          { id: "pending", label: "Needs My Action", count: pendingCount },
          { id: "all",     label: "All Requests",    count: all.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? "var(--tk-accent)" : "var(--tk-text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--tk-accent)" : "2px solid transparent",
              marginBottom: -1, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                background: t.id === "pending" ? "var(--tk-accent)" : "var(--tk-bg-elevated)",
                color: t.id === "pending" ? "#fff" : "var(--tk-text-muted)",
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div style={{ color: "var(--tk-text-muted)", fontSize: 14, padding: 24, textAlign: "center" }}>
          Loading…
        </div>
      )}
      {error && (
        <div style={{
          padding: "12px 16px", borderRadius: "var(--tk-radius-sm)",
          background: "var(--tk-status-danger-bg)", color: "var(--tk-status-danger)", fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {!loading && !error && displayed.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "var(--tk-card)", borderRadius: "var(--tk-radius-card)",
          border: "1px solid var(--tk-border)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tk-text-primary)", marginBottom: 4 }}>
            {tab === "pending" ? "All clear — nothing to approve" : "No approval requests yet"}
          </div>
          <div style={{ fontSize: 13, color: "var(--tk-text-muted)" }}>
            {tab === "pending"
              ? "When a Super Boss assigns a task to your team, it will appear here for your review."
              : "Task assignment requests from Super Boss users will show up here."}
          </div>
        </div>
      )}
      {!loading && !error && displayed.map(a => (
        <ApprovalCard
          key={a.id}
          approval={a}
          onApprove={handleApprove}
          onReject={handleReject}
          isApprover={a.approver_id === user?.id}
        />
      ))}
    </div>
  );
}
