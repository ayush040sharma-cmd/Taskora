import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Privacy() {
  const navigate = useNavigate();
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={S.root}>
      <nav style={S.nav}>
        <div style={S.navInner}>
          <div style={S.logoRow} onClick={() => navigate("/")}>
            <div style={S.logoMark}>T</div>
            <span style={S.logoText}>Taskora</span>
            <span style={S.logoBadge}>AI</span>
          </div>
          <div style={S.navActions}>
            <button style={S.ghostBtn} onClick={() => navigate("/login")}>Sign in</button>
            <button style={S.primaryBtn} onClick={() => navigate("/register")}>Start free →</button>
          </div>
        </div>
      </nav>

      <section style={S.hero}>
        <div style={S.heroContent}>
          <div style={S.eyebrow}>Legal</div>
          <h1 style={S.h1}>Privacy Policy</h1>
          <p style={S.heroPara}>Last updated: April 2025</p>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.docInner}>
          {[
            {
              title: "1. Introduction",
              body: `Welcome to Taskora ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform at taskora.app.

Please read this policy carefully. If you disagree with its terms, please discontinue use of the platform.`,
            },
            {
              title: "2. Information we collect",
              body: `We collect information you provide directly, including:

• Account data: Name, email address, and password (stored as a bcrypt hash — we never store plain-text passwords)
• Workspace data: Tasks, projects, team members, comments, and any content you create in the app
• Usage data: Feature interactions, login timestamps, and error logs for debugging

We do NOT collect:
• Payment information (no payment processing yet; plans are free)
• Biometric data
• Location data beyond your IP address for rate limiting`,
            },
            {
              title: "3. How we use your data",
              body: `Your data is used exclusively to:

• Provide and operate the Taskora service
• Run the AI prediction and workload analysis features
• Send transactional emails (account creation, password reset)
• Diagnose and fix bugs and performance issues
• Improve the product based on aggregated, anonymized usage patterns

We never sell your data to third parties. We never use your data to train external AI models. Your workspace content is yours.`,
            },
            {
              title: "4. Data storage & security",
              body: `All data is stored in a PostgreSQL database. Passwords are hashed using bcrypt with a salt factor of 10. Authentication tokens are JWT with 7-day expiration. All API communication uses HTTPS in production.

We use Render.com (or your configured hosting provider) for infrastructure. Their security practices apply at the infrastructure level. We recommend reviewing their privacy terms separately.`,
            },
            {
              title: "5. Cookies & local storage",
              body: `Taskora stores your authentication token and user profile in your browser's localStorage for session persistence. We do not use third-party tracking cookies, advertising pixels, or analytics SDKs (such as Google Analytics).`,
            },
            {
              title: "6. Third-party integrations",
              body: `If you choose to connect third-party services (Slack, GitHub, Jira), those integrations are governed by those companies' privacy policies. We only access the minimum data required to power the integration features you enable.`,
            },
            {
              title: "7. Your rights",
              body: `You have the right to:

• Access all data associated with your account via the dashboard
• Request a full export of your data (email support@taskora.app)
• Request deletion of your account and all associated data
• Correct inaccurate data in your profile at any time

To exercise any of these rights, email support@taskora.app. We will respond within 30 days.`,
            },
            {
              title: "8. Children",
              body: `Taskora is not intended for users under 13 years of age. We do not knowingly collect data from children. If we learn we have collected data from a child under 13, we will delete it promptly.`,
            },
            {
              title: "9. Changes to this policy",
              body: `We may update this Privacy Policy from time to time. We will notify users of material changes via email or a prominent notice in the app. Continued use after changes constitutes acceptance of the revised policy.`,
            },
            {
              title: "10. Contact",
              body: `For privacy questions or requests, contact us at:

Email: privacy@taskora.app
Support: support@taskora.app

Taskora is built and maintained by Ayush Sharma and the Taskora team.`,
            },
          ].map(s => (
            <div key={s.title} style={S.docSection}>
              <h2 style={S.docH2}>{s.title}</h2>
              <div style={S.docBody}>
                {s.body.split("\n\n").map((para, i) => (
                  <p key={i} style={S.docPara}>{para}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer style={S.footer}>
        <div style={S.footerInner}>
          <span style={S.footerCopy}>© {new Date().getFullYear()} Taskora.</span>
          <div style={S.footerLinks}>
            <a href="/terms" style={S.footerLink}>Terms</a>
            <a href="/contact" style={S.footerLink}>Contact</a>
            <a href="/about" style={S.footerLink}>About</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const S = {
  root: { fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a", lineHeight: 1.6, minHeight: "100vh" },
  nav: { position: "sticky", top: 0, zIndex: 100, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)", borderBottom: "1px solid #f1f5f9" },
  navInner: { maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 },
  logoRow: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" },
  logoMark: { width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16 },
  logoText: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  logoBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "rgba(99,102,241,0.1)", borderRadius: 4, padding: "2px 5px" },
  navActions: { display: "flex", gap: 10 },
  ghostBtn: { padding: "8px 18px", background: "none", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer" },
  primaryBtn: { padding: "8px 18px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer" },
  hero: { padding: "60px 24px 48px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "center" },
  heroContent: { maxWidth: 600, margin: "0 auto" },
  eyebrow: { display: "inline-block", background: "rgba(99,102,241,0.1)", color: "#6366f1", borderRadius: 99, padding: "4px 14px", fontSize: 12, fontWeight: 600, marginBottom: 12 },
  h1: { fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, margin: "0 0 8px", letterSpacing: "-1px" },
  heroPara: { fontSize: 14, color: "#64748b" },
  section: { padding: "64px 24px" },
  docInner: { maxWidth: 740, margin: "0 auto" },
  docSection: { marginBottom: 40 },
  docH2: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" },
  docBody: {},
  docPara: { fontSize: 15, color: "#475569", lineHeight: 1.8, marginBottom: 12, whiteSpace: "pre-line" },
  footer: { background: "#0f172a", padding: "20px 24px" },
  footerInner: { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  footerCopy: { fontSize: 13, color: "#475569" },
  footerLinks: { display: "flex", gap: 20 },
  footerLink: { fontSize: 13, color: "#475569", textDecoration: "none" },
};
