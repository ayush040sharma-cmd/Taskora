import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Terms() {
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
          <h1 style={S.h1}>Terms of Service</h1>
          <p style={S.heroPara}>Last updated: April 2025</p>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.docInner}>
          {[
            {
              title: "1. Acceptance of Terms",
              body: `By accessing or using Taskora ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.

These terms apply to all users, including visitors, registered users, and paying customers.`,
            },
            {
              title: "2. Description of Service",
              body: `Taskora is an AI-powered project management and execution intelligence platform. It includes features such as Kanban boards, sprint planning, workload analysis, AI delay prediction, what-if simulation, calendar management, and team collaboration tools.

We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice.`,
            },
            {
              title: "3. Account registration",
              body: `To use Taskora, you must register with a valid email address and create a password. You are responsible for:

• Maintaining the confidentiality of your account credentials
• All activities that occur under your account
• Notifying us immediately of any unauthorized access

You must be at least 13 years old to use Taskora. Accounts registered on behalf of a company must be authorized by that company.`,
            },
            {
              title: "4. Acceptable use",
              body: `You agree not to use Taskora to:

• Upload or transmit malicious code, viruses, or harmful content
• Attempt to gain unauthorized access to our systems or other users' accounts
• Use the platform for any unlawful purpose or in violation of applicable laws
• Scrape, mine, or systematically extract data from the platform without written permission
• Reverse engineer, decompile, or attempt to extract source code
• Interfere with the platform's operation or other users' access

We reserve the right to suspend or terminate accounts that violate these terms.`,
            },
            {
              title: "5. Your content",
              body: `You retain ownership of all content you create in Taskora (tasks, comments, workspace data). By using the Service, you grant us a limited license to store and process your content solely to provide the Service to you.

We will not use your content for advertising, training AI models, or sharing with third parties without your explicit consent.`,
            },
            {
              title: "6. Free and paid plans",
              body: `The Free plan is provided at no cost and may have feature limitations. Paid plans (Pro, Enterprise) are described on our Pricing page and subject to separate billing agreements.

We reserve the right to modify plan features and pricing with 30 days' notice. Continued use after a price change constitutes acceptance.`,
            },
            {
              title: "7. Disclaimer of warranties",
              body: `Taskora is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the Service will be error-free, uninterrupted, or free of bugs.

The AI features (delay prediction, workload analysis, risk scores) are probabilistic and should be used as decision support — not as definitive guarantees. Final decisions remain your responsibility.`,
            },
            {
              title: "8. Limitation of liability",
              body: `To the maximum extent permitted by applicable law, Taskora and its team shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to lost profits, data loss, or business interruption.

Our total liability to you for any claims under these terms shall not exceed the amount you paid us in the 12 months prior to the claim, or $100, whichever is greater.`,
            },
            {
              title: "9. Privacy",
              body: `Your use of the Service is also governed by our Privacy Policy, which is incorporated into these Terms by reference. Please review it carefully at taskora.app/privacy.`,
            },
            {
              title: "10. Termination",
              body: `You may stop using the Service and delete your account at any time. We may suspend or terminate your account for violation of these Terms, with or without notice.

Upon termination, your right to use the Service ends. We will retain your data for 30 days in case you wish to reactivate, then permanently delete it unless required by law to retain it longer.`,
            },
            {
              title: "11. Changes to Terms",
              body: `We may update these Terms at any time. Material changes will be communicated via email or a notice in the app. Continued use after changes constitutes acceptance. If you disagree with changes, please stop using the Service.`,
            },
            {
              title: "12. Contact",
              body: `For questions about these Terms, contact us at:

Email: legal@taskora.app
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
            <a href="/privacy" style={S.footerLink}>Privacy</a>
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
