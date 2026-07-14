import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";
import Logo from "../components/Logo";

/**
 * Landing page for one-click email action links —
 * docs/briefing-engine-plan.md §7.1 ("never mutate on GET"). The email
 * button points here with ?t=<signed token>; this page only ever *reads*
 * on load (GET /api/briefing-actions/:token) and only mutates when the
 * user explicitly clicks Confirm (POST .../confirm) — a link-prefetcher
 * hitting this page does nothing but load a confirmation screen.
 *
 * No email currently generates one of these links (buildAttention() in
 * services/briefing/buildContext.js leaves suggested_action null) — this
 * page is real, working infrastructure ahead of its caller.
 */
const KIND_COPY = {
  REASSIGN:        { icon: "🔄", title: "Reassign task?" },
  APPROVE:         { icon: "✅", title: "Approve task?" },
  OPEN_TASK:       { icon: "📋", title: "Open task" },
  REVIEW_BLOCKER:  { icon: "🚧", title: "Review blocker" },
};

export default function BriefAction() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [status, setStatus]   = useState("loading"); // loading | valid | confirming | confirmed | error
  const [action, setAction]   = useState(null);       // { kind, params, summary }
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Missing action link."); return; }
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/brief/action?t=${token}`)}`);
      return;
    }
    api.get(`/briefing-actions/${token}`)
      .then(res => { setAction(res.data); setStatus("valid"); })
      .catch(err => {
        setStatus("error");
        setMessage(err.response?.data?.message || "This link is invalid or has expired.");
      });
  }, [token, user, navigate]);

  const handleConfirm = async () => {
    setStatus("confirming");
    try {
      await api.post(`/briefing-actions/${token}/confirm`);
      setStatus("confirmed");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.message || "Couldn't complete this action.");
    }
  };

  const copy = action ? (KIND_COPY[action.kind] || { icon: "❓", title: "Confirm action" }) : null;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#020617", fontFamily: "'DM Sans', sans-serif", padding: 20,
    }}>
      <div style={{
        background: "#0B1220", border: "1px solid #1E293B", borderRadius: 16,
        padding: "40px 48px", width: "100%", maxWidth: 440, textAlign: "center",
      }}>
        <Logo iconSize={28} wordmarkSize={20} justify="center" style={{ marginBottom: 32 }} />

        {status === "loading" && (
          <div style={{ color: "#94A3B8", fontSize: 14 }}>Loading…</div>
        )}

        {status === "valid" && action && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{copy.icon}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>
              {copy.title}
            </div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 24, lineHeight: 1.6 }}>
              {summaryText(action)}
            </div>
            <button
              onClick={handleConfirm}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                background: "linear-gradient(90deg,#3B82F6,#06B6D4)",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              {confirmLabel(action.kind)}
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                width: "100%", padding: "10px 0", marginTop: 10, borderRadius: 10,
                background: "transparent", color: "#94A3B8",
                border: "1px solid #1E293B", fontSize: 13, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </>
        )}

        {status === "confirming" && (
          <div style={{ color: "#94A3B8", fontSize: 14 }}>Working…</div>
        )}

        {status === "confirmed" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>
              Done
            </div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 24 }}>
              {confirmedText(action?.kind)}
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                background: "linear-gradient(90deg,#3B82F6,#06B6D4)",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Go to Dashboard &rarr;
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>
              Can't complete this
            </div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 24 }}>{message}</div>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                background: "#1E293B", color: "#94A3B8",
                border: "1px solid #334155", fontSize: 14, cursor: "pointer",
              }}
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function summaryText(action) {
  const s = action.summary || {};
  switch (action.kind) {
    case "REASSIGN":
      return <>Move <strong style={{ color: "#E2E8F0" }}>"{s.task_title || "this task"}"</strong> to <strong style={{ color: "#3B82F6" }}>{s.to_user_name || "the suggested teammate"}</strong>?</>;
    case "APPROVE":
      return <>Approve <strong style={{ color: "#E2E8F0" }}>"{s.task_title || "this task"}"</strong>?</>;
    case "OPEN_TASK":
    case "REVIEW_BLOCKER":
      return <><strong style={{ color: "#E2E8F0" }}>"{s.task_title || "This task"}"</strong> — open it in your dashboard.</>;
    default:
      return "Confirm this action?";
  }
}

function confirmLabel(kind) {
  return { REASSIGN: "Confirm Reassignment", APPROVE: "Approve", OPEN_TASK: "Open Task", REVIEW_BLOCKER: "Review" }[kind] || "Confirm";
}

function confirmedText(kind) {
  return {
    REASSIGN: "The task has been reassigned.",
    APPROVE: "The task has been approved.",
    OPEN_TASK: "Find the task on your board.",
    REVIEW_BLOCKER: "Find the task on your board.",
  }[kind] || "Done.";
}
