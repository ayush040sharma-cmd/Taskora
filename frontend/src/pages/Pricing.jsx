import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PricingCard from "../components/pricing/PricingCard";
import FeatureTable from "../components/pricing/FeatureTable";
import { analytics } from "../utils/analytics";
import { useState } from "react";

const PLANS = [
  {
    id: "free",
    title: "Free",
    price: "₹0",
    period: "forever",
    description: "For individuals getting started with personal task tracking.",
    features: [
      { text: "3 projects, 10 tasks each" },
      { text: "Board & Calendar views" },
      { text: "3 team members" },
      { text: "Activity feed" },
      { text: "Gantt chart", locked: true },
      { text: "AI features", locked: true },
    ],
    ctaLabel: "Start free",
  },
  {
    id: "pro",
    title: "Pro",
    price: "₹699",
    period: "/month",
    description: "For growing teams that need unlimited projects and sprint planning.",
    badge: "Most popular",
    highlighted: true,
    features: [
      { text: "Unlimited projects & tasks" },
      { text: "25 team members" },
      { text: "Gantt chart + Sprints" },
      { text: "Task approvals workflow" },
      { text: "500 AI requests / month" },
      { text: "Priority support" },
      { text: "AI Risk & Simulation", locked: true },
    ],
    ctaLabel: "Upgrade to Pro",
  },
  {
    id: "enterprise",
    title: "Enterprise",
    price: "₹2,499",
    period: "/month",
    description: "For organisations that need AI, integrations, and unlimited scale.",
    features: [
      { text: "Everything in Pro" },
      { text: "Unlimited members" },
      { text: "AI Risk Heatmap" },
      { text: "Simulation engine" },
      { text: "External integrations" },
      { text: "Workload & capacity planning" },
      { text: "SLA + dedicated CSM" },
    ],
    ctaLabel: "Upgrade to Enterprise",
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showTable, setShowTable] = useState(false);

  function handleCta(plan) {
    if (!user) {
      navigate("/login");
      return;
    }
    if (plan === "free") {
      navigate("/dashboard");
      return;
    }
    analytics.upgradeClicked(user?.plan || "free", plan, "pricing-page");
    navigate(`/payment?plan=${plan}`);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      fontFamily: "'Inter', sans-serif",
      color: "#f1f5f9",
      padding: "60px 24px 80px",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <button
            onClick={() => navigate(user ? "/dashboard" : "/")}
            style={{
              background: "none", border: "none", color: "#64748b",
              cursor: "pointer", fontSize: 13, marginBottom: 24, display: "inline-block",
            }}
          >
            ← {user ? "Back to dashboard" : "Back to home"}
          </button>
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: "0 0 12px" }}>
            Simple,{" "}
            <span style={{ background: "linear-gradient(90deg,#6366f1,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              transparent
            </span>{" "}
            pricing
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 17, maxWidth: 520, margin: "0 auto" }}>
            Start free, upgrade when your team grows. No hidden fees, cancel anytime.
          </p>

          {user?.plan && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 18,
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 20,
              padding: "6px 16px",
              fontSize: 13,
              color: "#a5b4fc",
            }}>
              Current plan: <strong style={{ textTransform: "capitalize" }}>{user.plan}</strong>
            </div>
          )}
        </div>

        {/* Plan cards */}
        <div style={{ display: "flex", gap: 18, alignItems: "stretch", flexWrap: "wrap", marginBottom: 48 }}>
          {PLANS.map(p => (
            <PricingCard
              key={p.id}
              {...p}
              current={user?.plan === p.id}
              onCta={() => handleCta(p.id)}
            />
          ))}
        </div>

        {/* Feature comparison toggle */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <button
            onClick={() => setShowTable(v => !v)}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#94a3b8",
              padding: "9px 20px",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {showTable ? "▲ Hide" : "▼ Compare all features"}
          </button>
        </div>

        {showTable && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14,
            overflow: "hidden",
          }}>
            <FeatureTable highlight={user?.plan === "enterprise" ? "ent" : "pro"} />
          </div>
        )}

        {/* FAQ footer */}
        <div style={{ textAlign: "center", marginTop: 48, color: "#475569", fontSize: 13 }}>
          All prices in INR (₹) · GST applicable · Secure payment via Razorpay
        </div>
      </div>
    </div>
  );
}
