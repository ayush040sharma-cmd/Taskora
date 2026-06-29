import { useState } from "react";

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const TEMPLATES = [
  { id: null,          icon: "✨", label: "Blank",       desc: "Start from scratch" },
  { id: "software",    icon: "💻", label: "Software",    desc: "Dev tasks, bugs, sprints" },
  { id: "marketing",   icon: "📣", label: "Marketing",   desc: "Campaigns, content, social" },
  { id: "presales",    icon: "🤝", label: "Presales",    desc: "RFPs, demos, proposals" },
  { id: "recruitment", icon: "👔", label: "Recruitment", desc: "Hiring pipeline" },
  { id: "compliance",  icon: "🛡", label: "Compliance",  desc: "Audits, policies, controls" },
  { id: "research",    icon: "🔬", label: "Research",    desc: "Studies, data, reports" },
];

export default function WorkspaceModal({ onClose, onSubmit }) {
  const [name, setName]         = useState("");
  const [template, setTemplate] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [step, setStep]         = useState(0); // 0 = name, 1 = template

  const goNext = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Workspace name is required."); return; }
    setError("");
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(name.trim(), template);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create workspace.");
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: step === 1 ? 500 : 380 }}>
        <div className="modal-header">
          <span className="modal-title">
            {step === 0 ? "New workspace" : "Choose a template"}
          </span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>

        {error && (
          <div className="auth-error-banner" style={{ margin: "0 24px 14px" }}>{error}</div>
        )}

        {step === 0 ? (
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
        ) : (
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
              <button type="button" className="btn-modal-cancel" onClick={() => setStep(0)}>← Back</button>
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
