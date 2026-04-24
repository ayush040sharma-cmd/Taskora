import { useState } from "react";
import { useNavigate } from "react-router-dom";

function NavBar() {
  const navigate = useNavigate();
  return (
    <nav style={S.nav}>
      <div style={S.navInner}>
        <div style={S.logoRow} onClick={() => navigate("/")}>
          <div style={S.logoMark}>T</div>
          <span style={S.logoText}>Taskora</span>
          <span style={S.logoBadge}>AI</span>
        </div>
        <div style={S.navLinks}>
          <a href="/#features" style={S.navLink}>Features</a>
          <a href="/#pricing" style={S.navLink}>Pricing</a>
          <a href="/about" style={S.navLink}>About</a>
        </div>
        <div style={S.navActions}>
          <button style={S.ghostBtn} onClick={() => navigate("/login")}>Sign in</button>
          <button style={S.primaryBtnSmall} onClick={() => navigate("/register")}>Start free →</button>
        </div>
      </div>
    </nav>
  );
}

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: "General inquiry", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // Simulate sending (no backend email service yet — show success UI)
    await new Promise(r => setTimeout(r, 1200));
    setSent(true);
    setLoading(false);
  };

  return (
    <div style={S.root}>
      <NavBar />

      {/* Hero */}
      <section style={S.hero}>
        <div style={S.blob1} /><div style={S.blob2} />
        <div style={S.heroContent}>
          <div style={S.eyebrow}>Get in touch</div>
          <h1 style={S.h1}>We'd love to hear from you</h1>
          <p style={S.heroPara}>
            Questions, feedback, enterprise inquiries, or just want to say hi —
            our team reads every message.
          </p>
        </div>
      </section>

      {/* Content */}
      <section style={S.section}>
        <div style={S.sectionInner}>
          <div style={S.grid}>
            {/* Contact info */}
            <div style={S.infoCol}>
              <h2 style={S.h2}>Contact us</h2>
              <p style={S.para}>
                We're a small team and we care deeply about every conversation.
                Whether you've found a bug, have a feature idea, or want to explore
                an enterprise plan — reach out.
              </p>

              {[
                {
                  icon: "📧",
                  title: "General support",
                  lines: ["support@taskora.app", "We reply within 24 hours"],
                },
                {
                  icon: "💼",
                  title: "Enterprise & sales",
                  lines: ["enterprise@taskora.app", "Custom plans for teams of 20+"],
                },
                {
                  icon: "🐛",
                  title: "Bug reports",
                  lines: ["bugs@taskora.app", "Or open a GitHub issue"],
                },
                {
                  icon: "🗞️",
                  title: "Press & media",
                  lines: ["press@taskora.app", "Media kit available on request"],
                },
              ].map(c => (
                <div key={c.title} style={S.contactItem}>
                  <div style={S.contactIcon}>{c.icon}</div>
                  <div>
                    <div style={S.contactTitle}>{c.title}</div>
                    {c.lines.map(l => (
                      <div key={l} style={S.contactLine}>{l}</div>
                    ))}
                  </div>
                </div>
              ))}

              <div style={S.socialRow}>
                <a href="https://twitter.com/taskoraapp" target="_blank" rel="noreferrer" style={S.socialBtn}>
                  𝕏 Twitter
                </a>
                <a href="https://github.com/ayushsharma/taskora" target="_blank" rel="noreferrer" style={S.socialBtn}>
                  GitHub
                </a>
                <a href="https://linkedin.com/company/taskora" target="_blank" rel="noreferrer" style={S.socialBtn}>
                  LinkedIn
                </a>
              </div>
            </div>

            {/* Form */}
            <div style={S.formCol}>
              {sent ? (
                <div style={S.successCard}>
                  <div style={S.successIcon}>✅</div>
                  <h3 style={S.successTitle}>Message sent!</h3>
                  <p style={S.successSub}>
                    Thanks for reaching out. We'll get back to you at{" "}
                    <strong>{form.email}</strong> within 24 hours.
                  </p>
                  <button style={S.sendAnotherBtn} onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "General inquiry", message: "" }); }}>
                    Send another message
                  </button>
                </div>
              ) : (
                <div style={S.formCard}>
                  <h3 style={S.formTitle}>Send a message</h3>
                  <form onSubmit={handleSubmit} style={S.form}>
                    <div style={S.row}>
                      <div style={S.field}>
                        <label style={S.label}>Your name</label>
                        <input
                          style={S.input}
                          placeholder="Alex Johnson"
                          value={form.name}
                          onChange={e => setForm({ ...form, name: e.target.value })}
                          required
                        />
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Email address</label>
                        <input
                          type="email"
                          style={S.input}
                          placeholder="you@company.com"
                          value={form.email}
                          onChange={e => setForm({ ...form, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div style={S.field}>
                      <label style={S.label}>Subject</label>
                      <select
                        style={S.select}
                        value={form.subject}
                        onChange={e => setForm({ ...form, subject: e.target.value })}
                      >
                        {["General inquiry", "Bug report", "Feature request", "Enterprise / Sales", "Press & Media", "Other"].map(o => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </div>

                    <div style={S.field}>
                      <label style={S.label}>Message</label>
                      <textarea
                        style={S.textarea}
                        placeholder="Tell us what's on your mind..."
                        rows={6}
                        value={form.message}
                        onChange={e => setForm({ ...form, message: e.target.value })}
                        required
                      />
                    </div>

                    <button type="submit" style={S.submitBtn} disabled={loading}>
                      {loading ? "Sending…" : "Send message →"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ ...S.section, background: "#f8fafc" }}>
        <div style={S.sectionInner}>
          <h2 style={{ ...S.h2, textAlign: "center", marginBottom: 40 }}>Common questions</h2>
          <div style={S.faqGrid}>
            {[
              { q: "Is Taskora really free?", a: "Yes. The Free plan is free forever — no trial, no expiry. It supports 1 workspace and up to 3 members. Pro features are available on the paid plan." },
              { q: "Does Taskora work for non-developers?", a: "Absolutely. Taskora is used by project managers, operations teams, agency leads, and business owners — not just developers." },
              { q: "How does the AI work?", a: "Our AI engine analyzes workload data, task complexity, team capacity, historical patterns, and dependency signals to predict delays and recommend actions." },
              { q: "Can I import from Jira or Trello?", a: "Jira CSV import is available in the Enterprise plan. Trello import is on our roadmap. In the meantime, tasks can be bulk-created via the API." },
              { q: "Is my data private?", a: "Yes. We don't sell your data, don't train on it, and you can export or delete it at any time. Full details in our Privacy Policy." },
              { q: "How do I report a bug?", a: "Email bugs@taskora.app or open an issue on GitHub. We treat security reports with highest priority and respond within 4 hours during business hours." },
            ].map(f => (
              <div key={f.q} style={S.faqCard}>
                <div style={S.faqQ}>{f.q}</div>
                <div style={S.faqA}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={S.footer}>
        <div style={S.footerInner}>
          <span style={S.footerCopy}>© {new Date().getFullYear()} Taskora. Made with ♥ for teams that execute.</span>
          <div style={S.footerLinks}>
            <a href="/privacy" style={S.footerLink}>Privacy</a>
            <a href="/terms" style={S.footerLink}>Terms</a>
            <a href="/about" style={S.footerLink}>About</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const S = {
  root: { fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a", lineHeight: 1.6 },
  nav: {
    position: "sticky", top: 0, zIndex: 100,
    background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)",
    borderBottom: "1px solid #f1f5f9",
  },
  navInner: {
    maxWidth: 1100, margin: "0 auto", padding: "0 24px",
    display: "flex", alignItems: "center", gap: 32, height: 64,
  },
  logoRow: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 },
  logoMark: {
    width: 32, height: 32, borderRadius: 8,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 16,
  },
  logoText: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  logoBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "rgba(99,102,241,0.1)", borderRadius: 4, padding: "2px 5px" },
  navLinks: { display: "flex", gap: 28, flex: 1 },
  navLink: { fontSize: 14, color: "#64748b", textDecoration: "none", fontWeight: 500 },
  navActions: { display: "flex", gap: 10 },
  ghostBtn: { padding: "8px 18px", background: "none", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer" },
  primaryBtnSmall: { padding: "8px 18px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer" },
  hero: {
    padding: "80px 24px 64px", textAlign: "center",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 60%, #24243e 100%)",
    position: "relative", overflow: "hidden",
  },
  blob1: { position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)", top: "-150px", left: "-100px", pointerEvents: "none" },
  blob2: { position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)", bottom: "-150px", right: "-100px", pointerEvents: "none" },
  heroContent: { position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" },
  eyebrow: { display: "inline-block", background: "rgba(99,102,241,0.2)", color: "#a5b4fc", borderRadius: 99, padding: "5px 16px", fontSize: 13, fontWeight: 600, marginBottom: 16 },
  h1: { fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, color: "#fff", margin: "0 0 16px", letterSpacing: "-1px" },
  heroPara: { fontSize: 16, color: "rgba(255,255,255,0.7)", maxWidth: 480, margin: "0 auto" },
  section: { padding: "72px 24px" },
  sectionInner: { maxWidth: 1100, margin: "0 auto" },
  h2: { fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.5px" },
  para: { fontSize: 15, color: "#64748b", lineHeight: 1.8, marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 64, alignItems: "start" },
  infoCol: {},
  contactItem: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 },
  contactIcon: { fontSize: 22, flexShrink: 0, marginTop: 2 },
  contactTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 },
  contactLine: { fontSize: 13, color: "#64748b" },
  socialRow: { display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" },
  socialBtn: {
    padding: "8px 16px", background: "#f8fafc", border: "1.5px solid #e2e8f0",
    borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#374151", textDecoration: "none",
  },
  formCol: {},
  formCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" },
  formTitle: { fontSize: 18, fontWeight: 700, margin: "0 0 20px", color: "#0f172a" },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  input: { padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  select: { padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", fontFamily: "inherit" },
  textarea: { padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", fontFamily: "inherit", resize: "vertical" },
  submitBtn: { padding: "13px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  successCard: { background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 16, padding: 40, textAlign: "center" },
  successIcon: { fontSize: 48, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" },
  successSub: { fontSize: 14, color: "#64748b", marginBottom: 24 },
  sendAnotherBtn: { padding: "10px 24px", background: "#fff", border: "1.5px solid #bbf7d0", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#059669", cursor: "pointer" },
  faqGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 },
  faqCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 },
  faqQ: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 8 },
  faqA: { fontSize: 14, color: "#64748b", lineHeight: 1.7 },
  footer: { background: "#0f172a", padding: "20px 24px" },
  footerInner: { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  footerCopy: { fontSize: 13, color: "#475569" },
  footerLinks: { display: "flex", gap: 20 },
  footerLink: { fontSize: 13, color: "#475569", textDecoration: "none" },
};
