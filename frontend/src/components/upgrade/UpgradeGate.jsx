import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { canAccess, requiredPlan } from "../../utils/canAccess";
import { PLAN_LABELS } from "../../config/features";
import { analytics } from "../../utils/analytics";
import UpgradeModal from "./UpgradeModal";

/**
 * Wraps children and blurs/overlays them if the user's plan doesn't meet
 * the feature requirement. Click on the overlay to open UpgradeModal.
 */
export default function UpgradeGate({ feature, children, style = {} }) {
  const { user } = useAuth();
  const plan = user?.plan || "free";
  const [showModal, setShowModal] = useState(false);

  const allowed = canAccess(feature, plan);
  const needed = requiredPlan(feature);

  if (allowed) return <>{children}</>;

  analytics.featureBlocked(feature, plan);

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
            border: "1.5px solid rgba(99,102,241,0.3)",
            borderRadius: 12,
            padding: "14px 20px",
            textAlign: "center",
            fontFamily: "'Inter', sans-serif",
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>
              {needed === "enterprise" ? "🏢" : "⚡"}
            </div>
            <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {PLAN_LABELS[needed]} feature
            </div>
            <div style={{ color: "#6366f1", fontSize: 12, fontWeight: 600 }}>
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
