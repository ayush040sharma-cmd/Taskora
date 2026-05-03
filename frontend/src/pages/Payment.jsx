import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { analytics } from "../utils/analytics";
import api from "../api/api";

const PLAN_DETAILS = {
  pro: {
    title: "Pro",
    price: "₹699",
    amount: 699,
    description: "Unlimited projects, Gantt, Sprints, 500 AI requests/month",
    color: "#6366f1",
    features: ["Unlimited projects & tasks", "25 team members", "Gantt + Sprints", "Task approvals", "500 AI requests/month"],
  },
  enterprise: {
    title: "Enterprise",
    price: "₹2,499",
    amount: 2499,
    description: "Everything in Pro plus AI Risk, Simulation, Integrations, unlimited members",
    color: "#8b5cf6",
    features: ["Everything in Pro", "Unlimited members", "AI Risk Heatmap", "Simulation engine", "Integrations + SLA"],
  },
};

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Payment() {
  const [params] = useSearchParams();
  const plan = params.get("plan") || "pro";
  const details = PLAN_DETAILS[plan] || PLAN_DETAILS.pro;
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  async function handlePay() {
    setLoading(true);
    setError("");
    try {
      const rzLoaded = await loadRazorpay();
      if (!rzLoaded) throw new Error("Payment gateway failed to load. Please check your connection.");

      const { data: order } = await api.post("/payments/create-order", { plan });

      if (order.mock) {
        // Dev mode: instant upgrade
        const { data: verified } = await api.post("/payments/verify", {
          plan,
          mock: true,
          razorpay_order_id: order.id,
          razorpay_payment_id: "mock_pay_" + Date.now(),
          razorpay_signature: "mock_sig",
        });
        updateUser(verified.user);
        analytics.planUpgraded(plan);
        setSuccess(true);
        setTimeout(() => navigate("/dashboard"), 2000);
        return;
      }

      const options = {
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: "Taskora",
        description: `${details.title} Plan`,
        order_id: order.id,
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: { color: details.color },
        handler: async (response) => {
          try {
            const { data: verified } = await api.post("/payments/verify", {
              plan,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            updateUser(verified.user);
            analytics.planUpgraded(plan);
            setSuccess(true);
            setTimeout(() => navigate("/dashboard"), 2000);
          } catch {
            setError("Payment verification failed. Contact support if amount was deducted.");
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      const rz = new window.Razorpay(options);
      rz.open();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', sans-serif",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        {success ? (
          <div style={{
            background: "rgba(52,211,153,0.08)",
            border: "1.5px solid rgba(52,211,153,0.3)",
            borderRadius: 18,
            padding: "48px 32px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <h2 style={{ color: "#34d399", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              You're on {details.title}!
            </h2>
            <p style={{ color: "#94a3b8", fontSize: 15 }}>
              Your plan has been upgraded. Redirecting to dashboard…
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={() => navigate("/pricing")}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13, marginBottom: 24 }}
            >
              ← Back to pricing
            </button>

            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1.5px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              overflow: "hidden",
            }}>
              {/* Plan summary */}
              <div style={{
                background: `linear-gradient(135deg, ${details.color}22, ${details.color}11)`,
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                padding: "28px 28px 24px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                      Upgrading to
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9" }}>{details.title}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{details.description}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>{details.price}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>/month</div>
                  </div>
                </div>
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 7 }}>
                  {details.features.map(f => (
                    <div key={f} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "#34d399", fontSize: 13 }}>✓</span>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment form */}
              <div style={{ padding: "24px 28px" }}>
                <div style={{ marginBottom: 20, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Paying as</div>
                  <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{user?.name}</div>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>{user?.email}</div>
                </div>

                <div style={{ marginBottom: 20, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#94a3b8" }}>Taskora {details.title}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>Monthly subscription</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{details.price}</div>
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>Total today</span>
                    <span style={{ fontSize: 16, color: "#f1f5f9", fontWeight: 700 }}>{details.price}</span>
                  </div>
                </div>

                {error && (
                  <div style={{
                    background: "rgba(248,113,113,0.1)",
                    border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontSize: 13,
                    color: "#fca5a5",
                  }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handlePay}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "13px",
                    background: loading ? "rgba(99,102,241,0.3)" : `linear-gradient(135deg, ${details.color}, #8b5cf6)`,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    marginBottom: 12,
                  }}
                >
                  {loading ? "Processing…" : `Pay ${details.price} via Razorpay`}
                </button>

                <p style={{ textAlign: "center", fontSize: 12, color: "#475569" }}>
                  🔒 Secure payment · Cancel anytime · GST applicable
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
