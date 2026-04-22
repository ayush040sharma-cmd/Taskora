import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";

const STEPS = [
  { id: "workspace_setup", label: "Workspace", icon: "🏢" },
  { id: "team_invite",     label: "Team",      icon: "👥" },
  { id: "first_task",      label: "First task", icon: "✅" },
];

const TEMPLATES = [
  { id: "software", label: "Software Development", icon: "💻", desc: "Sprints, tickets, releases" },
  { id: "marketing", label: "Marketing Campaign", icon: "📣", desc: "Launches, content, campaigns" },
  { id: "agency", label: "Agency / Client Work", icon: "🤝", desc: "Client projects, deliverables" },
  { id: "ops", label: "Operations / HR", icon: "⚙️", desc: "Processes, hiring, onboarding" },
  { id: "freelance", label: "Personal / Freelancer", icon: "🧑‍💻", desc: "Solo tasks, clients" },
  { id: "blank", label: "Blank", icon: "📄", desc: "Start from scratch" },
];

export default function WorkspaceSetup() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const [currentStep, setCurrentStep] = useState("workspace_setup");
  const [loading, setLoading] = useState(true);

  // Step 1 state
  const [workspaceName, setWorkspaceName] = useState(user?.name ? `${user.name}'s Workspace` : "My Workspace");

  // Step 2 state
  const [inviteEmails, setInviteEmails] = useState("");

  // Step 3 state
  const [template, setTemplate] = useState("blank");
  const [firstTaskTitle, setFirstTaskTitle] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check server-side onboarding state
    api.get("/auth/onboarding").then(({ data }) => {
      if (data.onboarding_completed) {
        navigate("/dashboard", { replace: true });
      } else {
        setCurrentStep(data.onboarding_step || "workspace_setup");
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [navigate]);

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const progress = Math.round(((stepIndex) / STEPS.length) * 100);

  const advanceTo = async (nextStep) => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/auth/onboarding", { step: nextStep });
      updateUser({ ...user, onboarding_step: data.onboarding_step, onboarding_completed: data.onboarding_completed });
      if (data.onboarding_completed) {
        navigate("/dashboard", { replace: true });
      } else {
        setCurrentStep(nextStep);
      }
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Step 1: Workspace setup
  const handleWorkspaceStep = async () => {
    if (!workspaceName.trim()) return setError("Workspace name is required.");
    try {
      setSaving(true);
      // Update the existing default workspace name
      const { data: workspaces } = await api.get("/workspaces");
      if (workspaces.length > 0) {
        await api.put(`/workspaces/${workspaces[0].id}`, { name: workspaceName.trim() });
      }
      await advanceTo("team_invite");
    } catch {
      setSaving(false);
      setError("Failed to update workspace. Please try again.");
    }
  };

  // Step 2: Team invite (optional)
  const handleTeamStep = async (skip = false) => {
    if (!skip && inviteEmails.trim()) {
      // Store invite intent — real email send would be a future integration
    }
    await advanceTo("first_task");
  };

  // Step 3: First task
  const handleFirstTaskStep = async (skip = false) => {
    if (!skip && firstTaskTitle.trim()) {
      const { data: workspaces } = await api.get("/workspaces");
      if (workspaces.length > 0) {
        await api.post("/tasks", {
          title: firstTaskTitle.trim(),
          workspace_id: workspaces[0].id,
          status: "todo",
          priority: "medium",
          type: "task",
        });
      }
    }
    await advanceTo("complete");
  };

  if (loading) {
    return (
      <div style={S.root}>
        <div style={S.spinner} />
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.blob1} />
      <div style={S.blob2} />

      <div style={S.card}>
        {/* Logo */}
        <div style={S.logoRow}>
          <div style={S.logoMark}>T</div>
          <span style={S.logoText}>Taskora</span>
          <span style={S.badge}>Setup</span>
        </div>

        {/* Progress bar */}
        <div style={S.progressWrap}>
          <div style={{ ...S.progressBar, width: `${progress}%` }} />
        </div>

        {/* Step indicators */}
        <div style={S.stepsRow}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={S.stepItem}>
              <div style={{
                ...S.stepDot,
                background: i < stepIndex ? "#10b981" : i === stepIndex ? "#6366f1" : "#e2e8f0",
                color: i <= stepIndex ? "#fff" : "#94a3b8",
              }}>
                {i < stepIndex ? "✓" : s.icon}
              </div>
              <span style={{ ...S.stepLabel, color: i === stepIndex ? "#0f172a" : "#94a3b8" }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {error && <div style={S.errorBox}>{error}</div>}

        {/* ── Step 1: Workspace setup ── */}
        {currentStep === "workspace_setup" && (
          <div style={S.stepContent}>
            <h2 style={S.stepHeading}>Name your workspace</h2>
            <p style={S.stepSub}>This is where your team's tasks, sprints, and workload live.</p>
            <div style={S.field}>
              <label style={S.label}>Workspace name</label>
              <input
                style={S.input}
                type="text"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Corp, Design Team, My Projects"
                autoFocus
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"}
              />
            </div>
            <button style={S.btn} disabled={saving} onClick={handleWorkspaceStep}>
              {saving ? "Saving…" : "Continue →"}
            </button>
          </div>
        )}

        {/* ── Step 2: Team invite ── */}
        {currentStep === "team_invite" && (
          <div style={S.stepContent}>
            <h2 style={S.stepHeading}>Invite your team</h2>
            <p style={S.stepSub}>Add colleagues so they can see tasks and workload. You can skip this and do it later.</p>
            <div style={S.field}>
              <label style={S.label}>Email addresses (one per line)</label>
              <textarea
                style={{ ...S.input, height: 100, resize: "vertical" }}
                value={inviteEmails}
                onChange={e => setInviteEmails(e.target.value)}
                placeholder={"alice@company.com\nbob@company.com"}
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"}
              />
            </div>
            <div style={S.btnRow}>
              <button style={S.btnOutline} onClick={() => handleTeamStep(true)}>Skip for now</button>
              <button style={S.btn} disabled={saving} onClick={() => handleTeamStep(false)}>
                {saving ? "Saving…" : "Continue →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: First task ── */}
        {currentStep === "first_task" && (
          <div style={S.stepContent}>
            <h2 style={S.stepHeading}>Create your first task</h2>
            <p style={S.stepSub}>Get started by adding one task. You can always add more later.</p>

            {/* Template picker */}
            <div style={S.field}>
              <label style={S.label}>Pick a template (optional)</label>
              <div style={S.templateGrid}>
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    style={{ ...S.templateBtn, ...(template === t.id ? S.templateBtnActive : {}) }}
                    onClick={() => setTemplate(t.id)}
                  >
                    <span style={S.templateIcon}>{t.icon}</span>
                    <span style={S.templateLabel}>{t.label}</span>
                    <span style={S.templateDesc}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={S.field}>
              <label style={S.label}>First task title</label>
              <input
                style={S.input}
                type="text"
                value={firstTaskTitle}
                onChange={e => setFirstTaskTitle(e.target.value)}
                placeholder="e.g. Set up development environment"
                autoFocus
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"}
              />
            </div>

            <div style={S.btnRow}>
              <button style={S.btnOutline} onClick={() => handleFirstTaskStep(true)}>Skip</button>
              <button style={S.btn} disabled={saving} onClick={() => handleFirstTaskStep(false)}>
                {saving ? "Creating…" : "Go to workspace →"}
              </button>
            </div>
          </div>
        )}

        <p style={S.skipAll}>
          Already set up?{" "}
          <span
            style={{ color: "#6366f1", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => advanceTo("complete")}
          >
            Skip setup
          </span>
        </p>
      </div>
    </div>
  );
}

const S = {
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  blob1: { position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)", top: "-100px", left: "-100px", pointerEvents: "none" },
  blob2: { position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)", bottom: "-80px", right: "-80px", pointerEvents: "none" },
  card: {
    background: "#ffffff",
    borderRadius: 20,
    padding: "40px 44px",
    width: "100%",
    maxWidth: 520,
    boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
    position: "relative",
    zIndex: 1,
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  logoMark: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 },
  logoText: { fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" },
  badge: { background: "#ede9fe", color: "#6d28d9", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 99, letterSpacing: "0.3px", textTransform: "uppercase" },
  progressWrap: { height: 4, background: "#e2e8f0", borderRadius: 99, marginBottom: 20, overflow: "hidden" },
  progressBar: { height: "100%", background: "linear-gradient(90deg, #6366f1, #8b5cf6)", borderRadius: 99, transition: "width 0.4s ease" },
  stepsRow: { display: "flex", gap: 0, marginBottom: 28, alignItems: "center", justifyContent: "center" },
  stepItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 },
  stepDot: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, transition: "all 0.3s" },
  stepLabel: { fontSize: 11, fontWeight: 600, textAlign: "center", transition: "color 0.3s" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  stepContent: { display: "flex", flexDirection: "column", gap: 16 },
  stepHeading: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.3px" },
  stepSub: { fontSize: 13, color: "#64748b", margin: 0 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  input: { width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", transition: "border-color 0.15s", boxSizing: "border-box", fontFamily: "inherit" },
  btn: { padding: "13px 24px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.2px", transition: "opacity 0.15s" },
  btnOutline: { padding: "13px 24px", background: "transparent", color: "#6366f1", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnRow: { display: "flex", gap: 12, justifyContent: "flex-end" },
  templateGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  templateBtn: { display: "flex", flexDirection: "column", gap: 2, padding: "10px 8px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", cursor: "pointer", textAlign: "left", transition: "all 0.15s" },
  templateBtnActive: { border: "1.5px solid #6366f1", background: "#ede9fe" },
  templateIcon: { fontSize: 20 },
  templateLabel: { fontSize: 11, fontWeight: 700, color: "#0f172a" },
  templateDesc: { fontSize: 10, color: "#94a3b8" },
  skipAll: { textAlign: "center", marginTop: 20, fontSize: 13, color: "#94a3b8" },
  spinner: { width: 36, height: 36, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
};
