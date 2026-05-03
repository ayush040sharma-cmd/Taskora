import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { analytics } from "../../utils/analytics";
import api from "../../api/api";

const ROLES = [
  {
    id: "solo",
    icon: "🧑‍💻",
    title: "Solo",
    subtitle: "Just me",
    description: "Personal productivity. Track your tasks, deadlines, and projects without a team.",
    highlights: ["Board, Calendar, Gantt views", "AI risk insights", "No team overhead"],
  },
  {
    id: "member",
    icon: "👥",
    title: "Team Member",
    subtitle: "Part of a team",
    description: "Collaborate with teammates. View manager dashboards and join sprints.",
    highlights: ["Full board access", "Sprint participation", "Manager overview visibility"],
  },
  {
    id: "manager",
    icon: "🏢",
    title: "Manager",
    subtitle: "Leading a team",
    description: "Oversee workloads, plan capacity, approve tasks, and view team analytics.",
    highlights: ["Workload & capacity planning", "Task approvals", "Analytics & simulations"],
  },
];

const SIZES = [
  { id: "just-me", label: "Just me" },
  { id: "2-5", label: "2–5 people" },
  { id: "6-15", label: "6–15 people" },
  { id: "16-50", label: "16–50 people" },
  { id: "50+", label: "50+ people" },
];

export default function RoleSelection() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (step === 1) {
      if (!selectedRole) return;
      setStep(2);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { data } = await api.patch("/auth/me", {
        onboarding_role: selectedRole,
        team_size: selectedSize || "just-me",
      });
      updateUser(data);
      analytics.roleSelected(selectedRole);
      analytics.onboardingCompleted(selectedRole);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', sans-serif",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="10" width="4" height="12" rx="1.5" fill="#fff"/>
                <rect x="10" y="6" width="4" height="16" rx="1.5" fill="#fff"/>
                <rect x="18" y="2" width="4" height="20" rx="1.5" fill="#fff"/>
              </svg>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Taskora</span>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>
            Step {step} of 2 — Let's personalise your experience
          </div>
          {/* Progress bar */}
          <div style={{
            width: 200, height: 4, background: "#1e293b",
            borderRadius: 4, margin: "12px auto 0",
          }}>
            <div style={{
              width: step === 1 ? "50%" : "100%",
              height: "100%",
              background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
              borderRadius: 4,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <>
            <h1 style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              What describes you best?
            </h1>
            <p style={{ color: "#94a3b8", textAlign: "center", marginBottom: 32, fontSize: 15 }}>
              We'll customise your workspace views and features based on how you work.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ROLES.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  style={{
                    background: selectedRole === role.id
                      ? "rgba(99,102,241,0.15)"
                      : "rgba(255,255,255,0.04)",
                    border: selectedRole === role.id
                      ? "1.5px solid #6366f1"
                      : "1.5px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    padding: "20px 24px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    gap: 18,
                    alignItems: "flex-start",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 32, flexShrink: 0 }}>{role.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600 }}>{role.title}</span>
                      <span style={{ color: "#64748b", fontSize: 13 }}>{role.subtitle}</span>
                    </div>
                    <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 10px" }}>{role.description}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {role.highlights.map(h => (
                        <span key={h} style={{
                          background: "rgba(99,102,241,0.12)",
                          color: "#a5b4fc",
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 20,
                          border: "1px solid rgba(99,102,241,0.2)",
                        }}>{h}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 4,
                    border: selectedRole === role.id ? "none" : "2px solid #334155",
                    background: selectedRole === role.id
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {selectedRole === role.id && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: Team size */}
        {step === 2 && (
          <>
            <h1 style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              How big is your team?
            </h1>
            <p style={{ color: "#94a3b8", textAlign: "center", marginBottom: 32, fontSize: 15 }}>
              This helps us recommend the right plan for you.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {SIZES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSize(s.id)}
                  style={{
                    background: selectedSize === s.id
                      ? "rgba(99,102,241,0.15)"
                      : "rgba(255,255,255,0.04)",
                    border: selectedSize === s.id
                      ? "1.5px solid #6366f1"
                      : "1.5px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "16px 20px",
                    cursor: "pointer",
                    color: selectedSize === s.id ? "#a5b4fc" : "#94a3b8",
                    fontSize: 15,
                    fontWeight: selectedSize === s.id ? 600 : 400,
                    transition: "all 0.15s ease",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              style={{
                background: "none", border: "none", color: "#64748b",
                cursor: "pointer", marginTop: 20, fontSize: 13,
                display: "block", textAlign: "center", width: "100%",
              }}
            >
              ← Back
            </button>
          </>
        )}

        {error && (
          <p style={{ color: "#f87171", textAlign: "center", marginTop: 12, fontSize: 14 }}>{error}</p>
        )}

        <button
          onClick={handleContinue}
          disabled={saving || (step === 1 && !selectedRole)}
          style={{
            width: "100%",
            marginTop: 28,
            padding: "14px",
            background: saving || (step === 1 && !selectedRole)
              ? "rgba(99,102,241,0.3)"
              : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: saving || (step === 1 && !selectedRole) ? "not-allowed" : "pointer",
            transition: "opacity 0.15s",
          }}
        >
          {saving ? "Saving…" : step === 1 ? "Continue →" : "Get started →"}
        </button>

        {step === 1 && (
          <p style={{ color: "#475569", textAlign: "center", marginTop: 16, fontSize: 13 }}>
            You can change this later in your profile settings.
          </p>
        )}
      </div>
    </div>
  );
}
