import { PLAN_LABELS, PLAN_COLORS } from "../../config/features";

const BG = {
  free:       "rgba(148,163,184,0.1)",
  pro:        "rgba(99,102,241,0.15)",
  enterprise: "rgba(139,92,246,0.15)",
};

const BORDER = {
  free:       "rgba(148,163,184,0.2)",
  pro:        "rgba(99,102,241,0.3)",
  enterprise: "rgba(139,92,246,0.3)",
};

export default function PlanBadge({ plan = "free", size = "sm" }) {
  const padding = size === "lg" ? "4px 12px" : "2px 8px";
  const fontSize = size === "lg" ? 13 : 11;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      background: BG[plan] || BG.free,
      border: `1px solid ${BORDER[plan] || BORDER.free}`,
      borderRadius: 20,
      padding,
      fontSize,
      fontWeight: 600,
      color: plan === "free" ? "#94a3b8" : plan === "pro" ? "#a5b4fc" : "#c4b5fd",
    }}>
      {plan === "pro" && "⚡"}
      {plan === "enterprise" && "🏢"}
      {PLAN_LABELS[plan] || plan}
    </span>
  );
}
