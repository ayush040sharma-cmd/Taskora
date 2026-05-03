import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PLAN_LABELS } from "../../config/features";
import { analytics } from "../../utils/analytics";
import { useEffect } from "react";

export default function UpgradeModal({ feature, requiredPlan, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleUpgrade() {
    analytics.upgradeClicked(user?.plan || "free", requiredPlan, `modal:${feature}`);
    onClose?.();
    navigate(`/payment?plan=${requiredPlan}`);
  }

  const planLabel = PLAN_LABELS[requiredPlan] || requiredPlan;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9000,
        padding: 24,
      }}
    >
      <div style={{
        background: "#0f172a",
        border: "1.5px solid rgba(99,102,241,0.3)",
        borderRadius: 18,
        padding: "36px 32px 28px",
        maxWidth: 420,
        width: "100%",
        textAlign: "center",
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>
          {requiredPlan === "enterprise" ? "🏢" : "⚡"}
        </div>
        <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
          {planLabel} feature
        </h2>
        <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          <strong style={{ color: "#e2e8f0" }}>{feature}</strong> requires a{" "}
          <strong style={{ color: requiredPlan === "enterprise" ? "#c4b5fd" : "#a5b4fc" }}>{planLabel}</strong> plan.
          Upgrade to unlock it along with all other {planLabel} features.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleUpgrade}
            style={{
              padding: "12px",
              background: requiredPlan === "enterprise"
                ? "linear-gradient(135deg, #7c3aed, #8b5cf6)"
                : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Upgrade to {planLabel} →
          </button>
          <button
            onClick={() => { onClose?.(); navigate("/pricing"); }}
            style={{
              padding: "11px",
              background: "rgba(255,255,255,0.05)",
              color: "#94a3b8",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            View all plans
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              fontSize: 13,
              cursor: "pointer",
              padding: "8px",
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
