import { useState } from "react";
import { LuX } from "react-icons/lu";

const IconX = () => <LuX size={16} />;

const TEMPLATES = [
  { id: null,          icon: "✨", label: "Blank",       desc: "Start from scratch" },
  { id: "software",    icon: "💻", label: "Software",    desc: "Dev tasks, bugs, sprints" },
  { id: "marketing",   icon: "📣", label: "Marketing",   desc: "Campaigns, content, social" },
  { id: "presales",    icon: "🤝", label: "Presales",    desc: "RFPs, demos, proposals" },
  { id: "recruitment", icon: "👔", label: "Recruitment", desc: "Hiring pipeline" },
  { id: "compliance",  icon: "🛡", label: "Compliance",  desc: "Audits, policies, controls" },
  { id: "research",    icon: "🔬", label: "Research",    desc: "Studies, data, reports" },
];

const ACCESS_LEVELS = [
  { value: "viewer", label: "Viewer", desc: "Can view, not edit" },
  { value: "editor", label: "Editor", desc: "Can create & edit tasks" },
  { value: "full",   label: "Full",   desc: "Can also manage members" },
];

export default function WorkspaceModal({ onClose, onSubmit }) {
  const [name, setName]         = useState("");
  const [template, setTemplate] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [step, setStep]         = useState(0); // 0 = name, 1 = type/invites, 2 = template

  const [workspaceType, setWorkspaceType] = useState("individual");
  const [invites, setInvites] = useState([]); // { email, access_level }

  const goNext = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Workspace name is required."); return; }
    setError("");
    setStep(1);
  };

  const addInviteRow = () => setInvites(p => [...p, { email: "", access_level: "editor" }]);
  const updateInvite  = (i, field, value) => setInvites(p => p.map((inv, idx) => idx === i ? { ...inv, [field]: value } : inv));
  const removeInvite  = (i) => setInvites(p => p.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validInvites = workspaceType === "team"
        ? invites.filter(inv => inv.email.trim())
        : [];
      await onSubmit(name.trim(), template, { workspace_type: workspaceType, invites: validInvites });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create workspace.");
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const stepTitle = step === 0 ? "New workspace" : step === 1 ? "Who's this workspace for?" : "Choose a template";

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: step === 0 ? 380 : 500 }}>
        <div className="modal-header">
          <span className="modal-title">{stepTitle}</span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>

        {error && (
          <div className="auth-error-banner" style={{ margin: "0 24px 14px" }}>{error}</div>
        )}

        {step === 0 && (
          <form onSubmit={goNext}>
            <div className="modal-body">
              <div className="modal-form-group">
                <label className="modal-label">Workspace name</label>
                <input
                  className="modal-input"
                  placeholder="e.g. Marketing Team"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-modal-submit">Next →</button>
            </div>
          </form>
        )}

        {step === 1 && (
          <div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div
                  onClick={() => setWorkspaceType("individual")}
                  style={{
                    border: `1px solid ${workspaceType === "individual" ? "var(--tk-accent, #3B82F6)" : "var(--border)"}`,
                    borderRadius: 10, padding: "14px", cursor: "pointer",
                    background: workspaceType === "individual" ? "rgba(59,130,246,0.07)" : "var(--card-bg)",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>🧍</div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>Just me</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>
                    Personal workspace, no team views cluttering the sidebar
                  </div>
                </div>
                <div
                  onClick={() => setWorkspaceType("team")}
                  style={{
                    border: `1px solid ${workspaceType === "team" ? "var(--tk-accent, #3B82F6)" : "var(--border)"}`,
                    borderRadius: 10, padding: "14px", cursor: "pointer",
                    background: workspaceType === "team" ? "rgba(59,130,246,0.07)" : "var(--card-bg)",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>👥</div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>Me and a team</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>
                    Invite people with view, edit, or full access
                  </div>
                </div>
              </div>

              <p style={{ color: "var(--text-secondary)", fontSize: 11, margin: "0 0 14px" }}>
                You can change this later in Workspace Settings.
              </p>

              {workspaceType === "team" && (
                <div>
                  <label className="modal-label">Invite people (optional)</label>
                  {invites.map((inv, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <input
                        className="modal-input"
                        style={{ flex: 1 }}
                        placeholder="teammate@company.com"
                        type="email"
                        value={inv.email}
                        onChange={e => updateInvite(i, "email", e.target.value)}
                      />
                      <select
                        className="modal-select"
                        style={{ width: 110 }}
                        value={inv.access_level}
                        onChange={e => updateInvite(i, "access_level", e.target.value)}
                        title={ACCESS_LEVELS.find(a => a.value === inv.access_level)?.desc}
                      >
                        {ACCESS_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeInvite(i)}
                        style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
                        aria-label="Remove"
                      >
                        <IconX />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                    onClick={addInviteRow}
                  >
                    + Add person
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={() => setStep(0)}>← Back</button>
              <button type="button" className="btn-modal-submit" onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 16px" }}>
                Pre-fill <strong style={{ color: "var(--text-primary)" }}>{name}</strong> with starter tasks and teams,
                or start blank.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {TEMPLATES.map(t => (
                  <div
                    key={String(t.id)}
                    onClick={() => setTemplate(t.id)}
                    style={{
                      border: `1px solid ${template === t.id ? "var(--tk-accent, #3B82F6)" : "var(--border)"}`,
                      borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                      background: template === t.id ? "rgba(59,130,246,0.07)" : "var(--card-bg)",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                    <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>{t.label}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={() => setStep(1)}>← Back</button>
              <button type="submit" className="btn-modal-submit" disabled={loading}>
                {loading ? "Creating…" : `Create${template ? ` with ${TEMPLATES.find(t => t.id === template)?.label} template` : " blank"}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
