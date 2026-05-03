import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { analytics } from "../../utils/analytics";

const ITEMS = [
  { id: "role",       label: "Choose your role",              check: (u) => !!u?.onboarding_role },
  { id: "workspace",  label: "Create your first workspace",   check: () => (JSON.parse(localStorage.getItem("checklist_workspace") || "false")) },
  { id: "task",       label: "Add your first task",           check: () => (JSON.parse(localStorage.getItem("checklist_task") || "false")) },
  { id: "invite",     label: "Invite a teammate",             check: () => (JSON.parse(localStorage.getItem("checklist_invite") || "false")) },
  { id: "explore",    label: "Explore the Board view",        check: () => (JSON.parse(localStorage.getItem("checklist_explore") || "false")) },
];

const STORAGE_KEY = "onboarding_checklist_dismissed";

export default function OnboardingChecklist({ onViewChange }) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [minimised, setMinimised] = useState(false);

  // Don't show for users who already have role+complete status and dismissed
  if (!user || dismissed) return null;
  if (user?.onboarding_complete === false && !user?.onboarding_role) return null;

  const items = ITEMS.map(item => ({
    ...item,
    done: item.check(user),
  }));

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;

  function dismiss() {
    analytics.checklistDismissed();
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  function markItem(id) {
    localStorage.setItem(`checklist_${id}`, "true");
    analytics.checklistItemDone(id);
    // Force re-render
    setMinimised(v => !v);
    setMinimised(v => !v);
  }

  const progress = (doneCount / items.length) * 100;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      width: minimised ? 220 : 280,
      background: "#0f172a",
      border: "1.5px solid rgba(99,102,241,0.3)",
      borderRadius: 14,
      fontFamily: "'Inter', sans-serif",
      zIndex: 1000,
      boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setMinimised(v => !v)}
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          background: "rgba(99,102,241,0.08)",
          borderBottom: minimised ? "none" : "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{
          width: 28, height: 28,
          borderRadius: "50%",
          background: allDone ? "#34d399" : "conic-gradient(#6366f1 0%, #6366f1 " + progress + "%, #1e293b " + progress + "%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "#fff", fontWeight: 700, flexShrink: 0,
        }}>
          {allDone ? "✓" : doneCount}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Getting started
          </div>
          <div style={{ color: "#64748b", fontSize: 11 }}>
            {doneCount}/{items.length} completed
          </div>
        </div>
        <span style={{ color: "#475569", fontSize: 16, flexShrink: 0 }}>
          {minimised ? "▲" : "▼"}
        </span>
      </div>

      {/* Items */}
      {!minimised && (
        <div style={{ padding: "8px 0" }}>
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => !item.done && markItem(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                cursor: item.done ? "default" : "pointer",
                opacity: item.done ? 0.6 : 1,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: item.done ? "none" : "1.5px solid #334155",
                background: item.done ? "#34d399" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {item.done && <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <polyline points="2,6 5,9 10,3" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
              </div>
              <span style={{
                fontSize: 12,
                color: item.done ? "#64748b" : "#cbd5e1",
                textDecoration: item.done ? "line-through" : "none",
              }}>
                {item.label}
              </span>
            </div>
          ))}

          <div style={{ padding: "8px 14px 4px", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 4 }}>
            <button
              onClick={dismiss}
              style={{
                background: "none", border: "none", color: "#475569",
                fontSize: 11, cursor: "pointer", padding: 0,
              }}
            >
              {allDone ? "✨ All done! Dismiss" : "Dismiss checklist"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
