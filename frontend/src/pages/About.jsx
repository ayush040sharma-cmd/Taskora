import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

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
          <a href="/contact" style={S.navLink}>Contact</a>
        </div>
        <div style={S.navActions}>
          <button style={S.ghostBtn} onClick={() => navigate("/login")}>Sign in</button>
          <button style={S.primaryBtn} onClick={() => navigate("/register")}>Start free →</button>
        </div>
      </div>
    </nav>
  );
}

export default function About() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const navigate = useNavigate();

  return (
    <div style={S.root}>
      <NavBar />

      {/* Hero */}
      <section style={S.hero}>
        <div style={S.blob1} /><div style={S.blob2} />
        <div style={S.heroContent}>
          <div style={S.eyebrow}>Our Story</div>
          <h1 style={S.h1}>
            Built by a developer who was<br />
            <span style={S.gradient}>tired of missing deadlines.</span>
          </h1>
          <p style={S.heroPara}>
            Taskora started as a personal frustration and grew into a platform
            used by execution-focused teams worldwide.
          </p>
        </div>
      </section>

      {/* The Origin Story */}
      <section style={S.section}>
        <div style={S.sectionInner}>
          <div style={S.storyBlock}>
            <div style={S.storyText}>
              <h2 style={S.h2}>The moment it clicked</h2>
              <p style={S.para}>
                It was a Thursday afternoon in 2026. Ayush Sharma — coming from a non-technical background but now trying to build his first real product — was staring at a Kanban board filled with neatly organized green tasks. On the surface, everything looked on track. But in reality, three clients were about to be told their deliveries would slip. Again.
              </p>
              <p style={S.para}>
                He hadn't started as a developer. There was no formal training, no engineering degree — just a growing frustration with how work was being managed. Tasks looked simple on boards, timelines looked achievable on paper, and yet execution kept falling apart. Deadlines slipped, workloads were misjudged, and no tool seemed to reflect what was actually happening behind the scenes.
              </p>
              <p style={S.para}>
                Instead of waiting for a better solution, he decided to build one himself.
              </p>
              <p style={S.para}>
                What started as curiosity slowly turned into late nights of learning, experimenting, and breaking things. Every mistake taught him something — not just about technology, but about how teams actually work. He wasn't trying to build just another task manager. He wanted something that could think ahead, balance workload realistically, and prevent the chaos he had experienced firsthand.
              </p>
              <p style={S.para}>
                That Thursday wasn't just another stressful day — it was the moment things became clear. The problem wasn't the team. It wasn't even the effort.
              </p>
              <p style={S.para}>
                The problem was the system.
              </p>
              <p style={S.para}>
                And that's where the idea truly began.
              </p>
            </div>
            <div style={S.storyVisual}>
              <div style={S.quoteCard}>
                <div style={S.quoteIcon}>"</div>
                <p style={S.quoteText}>
                  The board showed green. Reality was red. We needed a system
                  that could see what humans miss.
                </p>
                <div style={S.quoteAuthor}>
                  <div style={S.avatar}>AS</div>
                  <div>
                    <div style={S.authorName}>Ayush Sharma</div>
                    <div style={S.authorRole}>Founder, Taskora</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why different */}
      <section style={{ ...S.section, background: "#f8fafc" }}>
        <div style={S.sectionInner}>
          <h2 style={{ ...S.h2, textAlign: "center" }}>Why Taskora is different</h2>
          <p style={{ ...S.para, textAlign: "center", maxWidth: 600, margin: "0 auto 48px" }}>
            We didn't build another task manager. We built an AI execution brain that
            sits on top of your workflow and thinks ahead.
          </p>

          <div style={S.diffGrid}>
            {[
              {
                icon: "🔮",
                title: "Prediction, not status",
                desc: "Jira, Trello, Asana — they all tell you what IS. Taskora tells you what WILL BE. Our AI predicts delays 3–5 days before they happen using workload patterns, capacity data, and task complexity signals.",
              },
              {
                icon: "🧠",
                title: "Built for decision-makers",
                desc: "Most tools are built for task-doers. Taskora is built for the people who have to answer for the outcome. Managers, directors, and team leads who need to know 'are we going to make it?' — not just 'what's in progress?'",
              },
              {
                icon: "⚡",
                title: "Actions, not dashboards",
                desc: "We hated dashboards that show you everything but help you do nothing. Every AI insight in Taskora comes with a recommended action. Not 'here's a chart' — but 'reassign this task to Priya before Friday'.",
              },
              {
                icon: "🔬",
                title: "Simulate before you commit",
                desc: "The what-if simulation feature was our biggest bet. Before you assign, Taskora shows you the exact before/after impact on workload, delivery confidence, and risk score. No more gut-feel decisions.",
              },
            ].map(d => (
              <div key={d.title} style={S.diffCard}>
                <div style={S.diffIcon}>{d.icon}</div>
                <h3 style={S.diffTitle}>{d.title}</h3>
                <p style={S.diffDesc}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The build journey */}
      <section style={S.section}>
        <div style={S.sectionInner}>
          <h2 style={{ ...S.h2, textAlign: "center" }}>How it was built</h2>
          <p style={{ ...S.para, textAlign: "center", maxWidth: 600, margin: "0 auto 48px" }}>
            Taskora was built entirely in public, with real users testing every feature
            from day one.
          </p>

          <div style={S.timeline}>
            {[
              {
                year: "Late 2025",
                title: "The frustration phase",
                desc: "Ayush starts building a personal Kanban tool after a rough sprint at work. It's just a simple board — no AI, no analytics. But it syncs in real time and that already feels different.",
              },
              {
                year: "Early 2026",
                title: "The AI hypothesis",
                desc: "After adding workload tracking for a second team member, a pattern emerges: certain combinations of task count + person load reliably predict delay. The AI engine concept is born.",
              },
              {
                year: "Mid 2026",
                title: "What-if simulation",
                desc: "The simulation feature gets built after a manager friend says 'I wish I could see what happens before I assign.' 8 days of building later, the impact simulator is live.",
              },
              {
                year: "Mid 2026",
                title: "First real teams",
                desc: "Three teams start using Taskora seriously. One catches a delivery risk 4 days early and saves a client contract. That's the moment everything clicks.",
              },
              {
                year: "2026",
                title: "Taskora goes public",
                desc: "After months of private beta, Taskora opens to the world. The full platform — Kanban, AI predictions, workload intelligence, sprint planning, and collaboration — ships publicly.",
              },
            ].map((t, i) => (
              <div key={t.year} style={S.timelineItem}>
                <div style={S.timelineDot} />
                {i < 4 && <div style={S.timelineLine} />}
                <div style={S.timelineContent}>
                  <div style={S.timelineYear}>{t.year}</div>
                  <h3 style={S.timelineTitle}>{t.title}</h3>
                  <p style={S.timelineDesc}>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ ...S.section, background: "linear-gradient(135deg, #0f0c29 0%, #302b63 100%)" }}>
        <div style={S.sectionInner}>
          <h2 style={{ ...S.h2, textAlign: "center", color: "#fff" }}>What we believe</h2>
          <div style={S.valuesGrid}>
            {[
              { icon: "🎯", title: "Outcomes over updates", desc: "Nobody cares that the task is 'in progress' for the third week. What matters is: will it ship?" },
              { icon: "🤝", title: "Honest data, always", desc: "We show you the real picture — even when it's uncomfortable. No vanity metrics. No dashboard theater." },
              { icon: "🚀", title: "Built for execution", desc: "Planning is not enough. Taskora pushes you toward action with every insight, every prediction, every recommendation." },
              { icon: "🔒", title: "Your data is yours", desc: "We don't sell it. We don't train on it. Your team's work stays yours — full stop." },
            ].map(v => (
              <div key={v.title} style={S.valueCard}>
                <div style={S.valueIcon}>{v.icon}</div>
                <h3 style={S.valueTitle}>{v.title}</h3>
                <p style={S.valueDesc}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={S.ctaSection}>
        <div style={S.sectionInner}>
          <h2 style={{ ...S.h2, textAlign: "center" }}>Ready to execute smarter?</h2>
          <p style={{ ...S.para, textAlign: "center", maxWidth: 500, margin: "0 auto 32px" }}>
            Join teams that predict, simulate, and ship with Taskora AI.
            Free to start, no credit card needed.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={S.ctaPrimary} onClick={() => navigate("/register")}>
              Start free — no credit card
            </button>
            <button style={S.ctaSecondary} onClick={() => navigate("/contact")}>
              Talk to us
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={S.footer}>
        <div style={S.footerInner}>
          <span style={S.footerCopy}>© {new Date().getFullYear()} Taskora. Made with ♥ for teams that execute.</span>
          <div style={S.footerLinks}>
            <a href="/privacy" style={S.footerLink}>Privacy</a>
            <a href="/terms" style={S.footerLink}>Terms</a>
            <a href="/contact" style={S.footerLink}>Contact</a>
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
  logoRow: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textDecoration: "none", flexShrink: 0 },
  logoMark: {
    width: 32, height: 32, borderRadius: 8,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 16,
  },
  logoText: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  logoBadge: {
    fontSize: 10, fontWeight: 700, color: "#6366f1",
    background: "rgba(99,102,241,0.1)", borderRadius: 4, padding: "2px 5px",
  },
  navLinks: { display: "flex", gap: 28, flex: 1 },
  navLink: { fontSize: 14, color: "#64748b", textDecoration: "none", fontWeight: 500 },
  navActions: { display: "flex", gap: 10 },
  ghostBtn: {
    padding: "8px 18px", background: "none", border: "1.5px solid #e2e8f0",
    borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer",
  },
  primaryBtn: {
    padding: "8px 18px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600,
    color: "#fff", cursor: "pointer",
  },
  hero: {
    padding: "96px 24px 80px",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 60%, #24243e 100%)",
    textAlign: "center", position: "relative", overflow: "hidden",
  },
  blob1: {
    position: "absolute", width: 600, height: 600, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)",
    top: "-200px", left: "-100px", pointerEvents: "none",
  },
  blob2: {
    position: "absolute", width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
    bottom: "-200px", right: "-100px", pointerEvents: "none",
  },
  heroContent: { position: "relative", zIndex: 1, maxWidth: 700, margin: "0 auto" },
  eyebrow: {
    display: "inline-block", background: "rgba(99,102,241,0.2)",
    color: "#a5b4fc", borderRadius: 99, padding: "5px 16px",
    fontSize: 13, fontWeight: 600, marginBottom: 20,
  },
  h1: {
    fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 900,
    color: "#fff", margin: "0 0 20px", lineHeight: 1.2,
    letterSpacing: "-1px",
  },
  gradient: { background: "linear-gradient(135deg, #a5b4fc, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  heroPara: { fontSize: 18, color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto" },
  section: { padding: "80px 24px" },
  sectionInner: { maxWidth: 1100, margin: "0 auto" },
  h2: { fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, margin: "0 0 16px", letterSpacing: "-0.5px" },
  para: { fontSize: 16, color: "#64748b", lineHeight: 1.8, marginBottom: 16 },
  em: { fontStyle: "italic", color: "#6366f1", fontWeight: 600 },
  storyBlock: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" },
  storyText: {},
  storyVisual: {},
  quoteCard: {
    background: "linear-gradient(135deg, #eef2ff, #f5f3ff)",
    border: "1px solid #e0e7ff", borderRadius: 16, padding: 32,
  },
  quoteIcon: { fontSize: 48, color: "#6366f1", lineHeight: 1, marginBottom: 12, fontFamily: "Georgia, serif" },
  quoteText: { fontSize: 18, color: "#1e293b", lineHeight: 1.7, fontStyle: "italic", marginBottom: 24 },
  quoteAuthor: { display: "flex", alignItems: "center", gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0,
  },
  authorName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  authorRole: { fontSize: 12, color: "#64748b" },
  diffGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 },
  diffCard: {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
    padding: 28, transition: "box-shadow 0.2s",
  },
  diffIcon: { fontSize: 32, marginBottom: 12 },
  diffTitle: { fontSize: 17, fontWeight: 700, margin: "0 0 8px", color: "#0f172a" },
  diffDesc: { fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: 0 },
  timeline: { display: "flex", flexDirection: "column", gap: 0, maxWidth: 700, margin: "0 auto", position: "relative" },
  timelineItem: { display: "flex", gap: 24, position: "relative", paddingBottom: 40 },
  timelineDot: {
    width: 14, height: 14, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    flexShrink: 0, marginTop: 6, position: "relative", zIndex: 1,
  },
  timelineLine: {
    position: "absolute", left: 6, top: 20, bottom: 0, width: 2,
    background: "linear-gradient(to bottom, #6366f1, #e2e8f0)",
  },
  timelineContent: { flex: 1 },
  timelineYear: { fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 },
  timelineTitle: { fontSize: 18, fontWeight: 700, margin: "0 0 6px", color: "#0f172a" },
  timelineDesc: { fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: 0 },
  valuesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, marginTop: 8 },
  valueCard: {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16, padding: 28, backdropFilter: "blur(8px)",
  },
  valueIcon: { fontSize: 28, marginBottom: 12 },
  valueTitle: { fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 8px" },
  valueDesc: { fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: 0 },
  ctaSection: { padding: "80px 24px", background: "#f8fafc" },
  ctaPrimary: {
    padding: "14px 28px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: 10,
    fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  ctaSecondary: {
    padding: "14px 28px", background: "none",
    border: "2px solid #6366f1", color: "#6366f1",
    borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  footer: { background: "#0f172a", padding: "20px 24px" },
  footerInner: {
    maxWidth: 1100, margin: "0 auto",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", gap: 12,
  },
  footerCopy: { fontSize: 13, color: "#475569" },
  footerLinks: { display: "flex", gap: 20 },
  footerLink: { fontSize: 13, color: "#475569", textDecoration: "none" },
};
