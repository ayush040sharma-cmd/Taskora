import { useState, useEffect } from "react";
import { PLAN_LABELS } from "../../config/features";
import { analytics } from "../../utils/analytics";
import UpgradeModal from "./UpgradeModal";

/**
 * Wraps children and blurs/overlays them ONLY when the backend has actually
 * rejected a request with a licensing 403 — PLAN_UPGRADE_REQUIRED or
 * LIMIT_EXCEEDED (see backend/middleware/planEnforce.js). Nothing is
 * pre-judged on the client from a local plan/feature map.
 *
 * Pass the caught axios error as `upgradeError` (or leave it null/undefined
 * once the underlying request succeeds). Internal users and admins never
 * receive this 403 from the backend in the first place, so this gate simply
 * never triggers for them — no separate internal/admin check needed here.
 */
export default function UpgradeGate({ upgradeError, children, style = {} }) {
  const [showModal, setShowModal] = useState(false);

  const code    = upgradeError?.response?.data?.code;
  const blocked = code === "PLAN_UPGRADE_REQUIRED" || code === "LIMIT_EXCEEDED";

  const feature = upgradeError?.response?.data?.feature;
  const needed  = (upgradeError?.response?.data?.requiredPlan || "pro").toLowerCase();

  useEffect(() => {
    if (blocked) analytics.featureBlocked(feature, needed);
  }, [blocked, feature, needed]);

  if (!blocked) return <>{children}</>;

  return (
    <>
      <div style={{ position: "relative", ...style }}>
        <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none", opacity: 0.4 }}>
          {children}
        </div>
        <div
          onClick={() => setShowModal(true)}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            gap: 8,
          }}
        >
          <div style={{
            background: "rgba(15,23,42,0.9)",
            border: "1.5px solid rgba(59,130,246,0.3)",
            borderRadius: 12,
            padding: "14px 20px",
            textAlign: "center",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>
              {needed === "enterprise" ? "🏢" : "⚡"}
            </div>
            <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {PLAN_LABELS[needed]} feature
            </div>
            <div style={{ color: "var(--tk-accent, #3B82F6)", fontSize: 12, fontWeight: 600 }}>
              Unlock with {PLAN_LABELS[needed]} →
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <UpgradeModal
          feature={feature}
          requiredPlan={needed}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
