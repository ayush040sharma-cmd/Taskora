import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ end, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const step = Math.ceil(end / (duration / 16));
        let current = 0;
        const timer = setInterval(() => {
          current = Math.min(current + step, end);
          setCount(current);
          if (current >= end) clearInterval(timer);
        }, 16);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Typewriter effect ─────────────────────────────────────────────────────────
function Typewriter({ words, speed = 80, pause = 1800 }) {
  const [display, setDisplay] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx];
    const delay = deleting ? speed / 2 : speed;

    const timer = setTimeout(() => {
      if (!deleting) {
        setDisplay(word.slice(0, charIdx + 1));
        if (charIdx + 1 === word.length) {
          setTimeout(() => setDeleting(true), pause);
        } else {
          setCharIdx(c => c + 1);
        }
      } else {
        setDisplay(word.slice(0, charIdx - 1));
        if (charIdx - 1 === 0) {
          setDeleting(false);
          setWordIdx(i => (i + 1) % words.length);
          setCharIdx(0);
        } else {
          setCharIdx(c => c - 1);
        }
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [charIdx, deleting, wordIdx, words, speed, pause]);

  return (
    <span className="lp-typewriter">
      {display}<span className="lp-cursor">|</span>
    </span>
  );
}

// ── Mini dashboard mockup ─────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="lp-mockup">
      {/* Mockup header */}
      <div className="lp-mock-bar">
        <div className="lp-mock-dots">
          <span style={{ background: "#ff5f56" }} />
          <span style={{ background: "#ffbd2e" }} />
          <span style={{ background: "#27c93f" }} />
        </div>
        <div className="lp-mock-url">taskora.app/dashboard</div>
      </div>

      <div className="lp-mock-body">
        {/* Sidebar */}
        <div className="lp-mock-sidebar">
          <div className="lp-mock-logo">T</div>
          {["📊", "📋", "👥", "📅", "⚡"].map((icon, i) => (
            <div key={i} className={`lp-mock-nav-item ${i === 1 ? "active" : ""}`}>{icon}</div>
          ))}
        </div>

        {/* Main */}
        <div className="lp-mock-main">
          {/* AI Banner */}
          <div className="lp-mock-ai-banner">
            <span className="lp-mock-ai-dot" />
            <span>AI detected: <strong>3 tasks at risk</strong> of delay — reassignment suggested</span>
            <button>View →</button>
          </div>

          {/* Kanban columns */}
          <div className="lp-mock-board">
            {[
              {
                label: "To Do", color: "#97a0af",
                tasks: [
                  { title: "RFP: Enterprise Client", type: "rfp", pct: 0, risk: true },
                  { title: "API integration", type: "task", pct: 0, risk: false },
                ]
              },
              {
                label: "In Progress", color: "#0052cc",
                tasks: [
                  { title: "Q2 Proposal", type: "proposal", pct: 60, risk: false },
                  { title: "System upgrade", type: "upgrade", pct: 35, risk: true },
                  { title: "Team presentation", type: "presentation", pct: 80, risk: false },
                ]
              },
              {
                label: "Done", color: "#00875a",
                tasks: [
                  { title: "Sprint planning", type: "story", pct: 100, risk: false },
                  { title: "Bug fix #4421", type: "bug", pct: 100, risk: false },
                ]
              },
            ].map((col) => (
              <div key={col.label} className="lp-mock-col">
                <div className="lp-mock-col-head">
                  <span className="lp-mock-col-dot" style={{ background: col.color }} />
                  <span>{col.label}</span>
                  <span className="lp-mock-col-count">{col.tasks.length}</span>
                </div>
                {col.tasks.map((t, i) => (
                  <div key={i} className="lp-mock-card">
                    <div className="lp-mock-card-top">
                      <span className={`lp-mock-type lp-mock-type--${t.type}`}>{t.type}</span>
                      {t.risk && <span className="lp-mock-risk">⚠ Risk</span>}
                    </div>
                    <div className="lp-mock-card-title">{t.title}</div>
                    <div className="lp-mock-prog-bar">
                      <div style={{ width: `${t.pct}%`, background: t.pct === 100 ? "#00875a" : "#0052cc" }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Workload strip */}
          <div className="lp-mock-wl">
            {[
              { name: "AS", pct: 92, status: "overloaded" },
              { name: "RK", pct: 65, status: "moderate" },
              { name: "PT", pct: 40, status: "available" },
            ].map((u) => (
              <div key={u.name} className="lp-mock-wl-user">
                <div className="lp-mock-wl-avatar">{u.name}</div>
                <div className="lp-mock-wl-bar-wrap">
                  <div className="lp-mock-wl-bar">
                    <div className={`lp-mock-wl-fill lp-wl--${u.status}`} style={{ width: `${u.pct}%` }} />
                  </div>
                  <span>{u.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Intersection observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add("lp-visible");
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".lp-animate").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lp-root">

      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav className={`lp-nav ${scrolled ? "lp-nav--scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <div className="lp-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="lp-logo-mark">T</div>
            <span className="lp-logo-name">Taskora</span>
            <span className="lp-logo-badge">AI</span>
          </div>

          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </div>

          <div className="lp-nav-actions">
            <button className="lp-btn-ghost" onClick={() => navigate("/login")}>Sign in</button>
            <button className="lp-btn-primary" onClick={() => navigate("/register")}>
              Start free →
            </button>
          </div>

          <button className="lp-hamburger" onClick={() => setMobileMenuOpen(v => !v)}>
            <span /><span /><span />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lp-mobile-menu">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</a>
            <button className="lp-btn-ghost" onClick={() => navigate("/login")}>Sign in</button>
            <button className="lp-btn-primary" onClick={() => navigate("/register")}>Start free</button>
          </div>
        )}
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-hero-glow lp-glow-1" />
          <div className="lp-hero-glow lp-glow-2" />
          <div className="lp-hero-grid" />
        </div>

        <div className="lp-hero-content">
          <div className="lp-hero-eyebrow">
            <span className="lp-pulse-dot" />
            AI-Powered Execution Intelligence
          </div>

          <h1 className="lp-hero-h1">
            Stop managing tasks.<br />
            Start{" "}
            <Typewriter
              words={["executing smarter.", "predicting delays.", "optimizing teams.", "shipping faster."]}
            />
          </h1>

          <p className="lp-hero-sub">
            Taskora is not a task manager. It's an AI execution brain that predicts delays
            before they happen, simulates decisions, and optimizes your team's workload
            automatically — so you focus on outcomes, not updates.
          </p>

          <div className="lp-hero-cta">
            <button className="lp-cta-primary" onClick={() => navigate("/register")}>
              <span>Start for free</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button className="lp-cta-secondary" onClick={() => navigate("/login")}>
              Sign in to workspace
            </button>
          </div>

          <div className="lp-hero-trust">
            <span className="lp-trust-item">✓ No credit card</span>
            <span className="lp-trust-item">✓ Free forever plan</span>
            <span className="lp-trust-item">✓ Setup in 2 minutes</span>
          </div>
        </div>

        <div className="lp-hero-mockup lp-animate">
          <DashboardMockup />
        </div>
      </section>

      {/* ── Social proof numbers ─────────────────────────────────── */}
      <section className="lp-stats" id="social-proof">
        <div className="lp-stats-inner">
          {[
            { value: 2400, suffix: "+", label: "Tasks predicted" },
            { value: 98,   suffix: "%", label: "Delay accuracy"  },
            { value: 340,  suffix: "+", label: "Teams using AI"  },
            { value: 4,    suffix: "x", label: "Faster execution" },
          ].map(s => (
            <div key={s.label} className="lp-stat-item lp-animate">
              <div className="lp-stat-num">
                <Counter end={s.value} suffix={s.suffix} />
              </div>
              <div className="lp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem ─────────────────────────────────────────────── */}
      <section className="lp-problem" id="problem">
        <div className="lp-section-inner">
          <div className="lp-section-tag lp-animate">The Problem</div>
          <h2 className="lp-section-h2 lp-animate">
            Your tools show <span className="lp-text-red">status</span>.<br />
            Not <span className="lp-text-gradient">outcomes</span>.
          </h2>
          <p className="lp-section-sub lp-animate">
            Jira tells you what's open. Trello shows what's in progress. Notion stores
            your notes. But <strong>none of them tell you what's about to fail</strong>.
          </p>

          <div className="lp-problem-grid">
            {[
              {
                icon: "😤",
                title: "You find out too late",
                desc: "Delays surface in Friday stand-ups — after the deadline is already missed.",
              },
              {
                icon: "🔀",
                title: "Tools don't talk",
                desc: "Context lives in 5 different apps. Your team spends 30% of time just tracking status.",
              },
              {
                icon: "📊",
                title: "Data without decisions",
                desc: "Dashboards show graphs. But who should reassign the task? Nobody knows.",
              },
              {
                icon: "🔥",
                title: "Silent burnout",
                desc: "One person is drowning in work while another is idle. Nobody can see it.",
              },
            ].map(p => (
              <div key={p.title} className="lp-problem-card lp-animate">
                <div className="lp-problem-icon">{p.icon}</div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution ─────────────────────────────────────────────── */}
      <section className="lp-solution" id="solution">
        <div className="lp-section-inner">
          <div className="lp-section-tag lp-animate" style={{ background: "rgba(0,82,204,0.1)", color: "#0052cc" }}>
            The Solution
          </div>
          <h2 className="lp-section-h2 lp-animate">
            Meet the <span className="lp-text-gradient">AI Execution Brain</span>
          </h2>
          <p className="lp-section-sub lp-animate">
            Taskora doesn't just track work. It understands it — predicting what will fail,
            suggesting what to do, and optimizing your team in real time.
          </p>

          <div className="lp-solution-grid">
            <div className="lp-solution-features">
              {[
                {
                  icon: "🔮",
                  color: "#7c3aed",
                  title: "Delay Prediction Engine",
                  desc: "Knows 3–5 days in advance when a task will slip. Not after the deadline.",
                },
                {
                  icon: "⚡",
                  color: "#0052cc",
                  title: "Workload Intelligence",
                  desc: "Tracks every person's real capacity: hours, travel, leave, type limits.",
                },
                {
                  icon: "🧠",
                  color: "#059669",
                  title: "Smart Recommendations",
                  desc: "\"Reassign this task\" \"Split this into subtasks\" \"Start this today\" — automatically.",
                },
                {
                  icon: "🔬",
                  color: "#dc2626",
                  title: "What-If Simulation",
                  desc: "Simulate before you decide. See the exact impact of any assignment change.",
                },
              ].map(f => (
                <div key={f.title} className="lp-sol-feature lp-animate">
                  <div className="lp-sol-icon" style={{ background: f.color + "22", color: f.color }}>
                    {f.icon}
                  </div>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="lp-solution-visual lp-animate">
              <div className="lp-ai-card">
                <div className="lp-ai-card-header">
                  <span className="lp-ai-icon">🧠</span>
                  <span className="lp-ai-title">AI Execution Brain</span>
                  <span className="lp-ai-live">● Live</span>
                </div>
                {[
                  { color: "#dc2626", bg: "#fef2f2", text: "⚠ RFP deadline at risk — 73% delay probability", action: "Reassign" },
                  { color: "#f59e0b", bg: "#fffbeb", text: "🔥 Alex overloaded next 3 days — 92% load", action: "Rebalance" },
                  { color: "#0052cc", bg: "#eff6ff", text: "💡 Q2 proposal can start today — 4h free slot", action: "Assign" },
                  { color: "#059669", bg: "#f0fdf4", text: "✓ Sprint on track — delivery confidence 87%", action: "View" },
                ].map((a, i) => (
                  <div key={i} className="lp-ai-insight" style={{ background: a.bg, borderColor: a.color + "33" }}>
                    <span style={{ fontSize: 12, color: a.color, flex: 1 }}>{a.text}</span>
                    <button className="lp-ai-action" style={{ color: a.color }}>{a.action} →</button>
                  </div>
                ))}
                <div className="lp-ai-footer">Updated 12s ago · Analyzing 47 signals</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="lp-features" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-tag lp-animate">Everything you need</div>
          <h2 className="lp-section-h2 lp-animate">
            Built for teams that<br /><span className="lp-text-gradient">ship, not just plan</span>
          </h2>

          <div className="lp-features-grid">
            {[
              { icon: "📋", title: "Kanban Board", desc: "Drag-and-drop task management with real-time sync across your team.", tag: "Core" },
              { icon: "🔮", title: "Delay Prediction", desc: "AI scans your team's workload and flags tasks likely to slip — days before deadline.", tag: "AI" },
              { icon: "👥", title: "Workload Dashboard", desc: "See every person's daily committed hours, free capacity, and next available slot.", tag: "Workload" },
              { icon: "🔬", title: "What-If Simulation", desc: "Before assigning a task, simulate the full workload impact with before/after charts.", tag: "AI" },
              { icon: "📅", title: "Calendar + Leave", desc: "Capacity-aware scheduling with travel mode, leave blocking, and daily load view.", tag: "Scheduling" },
              { icon: "🏃", title: "Sprint Planning", desc: "Create sprints, track burndown, and auto-flag at-risk stories in real time.", tag: "Agile" },
              { icon: "💬", title: "Task Comments", desc: "Collaborate directly inside tasks with threaded comments and activity logs.", tag: "Collab" },
              { icon: "🔔", title: "Smart Alerts", desc: "Overload warnings, deadline risks, and approval notifications — without noise.", tag: "Alerts" },
              { icon: "🏢", title: "Team RBAC", desc: "Manager, Member, Viewer roles — control who sees what, workspace by workspace.", tag: "Security" },
            ].map(f => (
              <div key={f.title} className="lp-feature-card lp-animate">
                <div className="lp-feature-icon">{f.icon}</div>
                <div className="lp-feature-tag">{f.tag}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="lp-how" id="how-it-works">
        <div className="lp-section-inner">
          <div className="lp-section-tag lp-animate">Simple by design</div>
          <h2 className="lp-section-h2 lp-animate">
            From signup to<br /><span className="lp-text-gradient">AI-powered in 2 minutes</span>
          </h2>

          <div className="lp-steps">
            {[
              { num: "01", title: "Create workspace", desc: "Set up your team workspace. Invite members and assign roles in seconds." },
              { num: "02", title: "Add tasks + assign", desc: "Create tasks, set types, estimated days, and assign to team members." },
              { num: "03", title: "AI takes over", desc: "The execution brain monitors workload, predicts delays, and surfaces insights automatically." },
              { num: "04", title: "Execute smarter", desc: "Follow AI recommendations, simulate decisions, and ship with confidence." },
            ].map((s, i) => (
              <div key={s.num} className="lp-step lp-animate">
                <div className="lp-step-num">{s.num}</div>
                <div className="lp-step-line" style={{ display: i === 3 ? "none" : undefined }} />
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────── */}
      <section className="lp-testimonials">
        <div className="lp-section-inner">
          <div className="lp-section-tag lp-animate">What teams say</div>
          <h2 className="lp-section-h2 lp-animate">Trusted by execution-focused teams</h2>

          <div className="lp-testi-grid">
            {[
              {
                quote: "We went from 'I think we're on track' to 'AI says 87% confidence by Friday.' That shift changed everything.",
                name: "Sarah K.",
                role: "VP Engineering",
                avatar: "SK",
              },
              {
                quote: "The workload simulation stopped us from overloading our best engineer on 3 RFPs at once. Saved a major client.",
                name: "Marcus T.",
                role: "Project Director",
                avatar: "MT",
              },
              {
                quote: "It predicted a delay 4 days before our team noticed. We reassigned based on the AI suggestion and shipped on time.",
                name: "Priya R.",
                role: "Head of Delivery",
                avatar: "PR",
              },
            ].map(t => (
              <div key={t.name} className="lp-testi-card lp-animate">
                <div className="lp-testi-stars">★★★★★</div>
                <p className="lp-testi-quote">"{t.quote}"</p>
                <div className="lp-testi-author">
                  <div className="lp-testi-avatar">{t.avatar}</div>
                  <div>
                    <div className="lp-testi-name">{t.name}</div>
                    <div className="lp-testi-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <section className="lp-pricing" id="pricing">
        <div className="lp-section-inner">
          <div className="lp-section-tag lp-animate">Pricing</div>
          <h2 className="lp-section-h2 lp-animate">Start free. Scale when ready.</h2>

          <div className="lp-pricing-grid">
            {[
              {
                name: "Free",
                price: "$0",
                per: "forever",
                features: ["1 workspace", "Up to 3 members", "Kanban + Calendar", "Basic workload view", "Community support"],
                cta: "Get started",
                highlight: false,
              },
              {
                name: "Pro",
                price: "$25",
                per: "per workspace / month",
                features: ["Unlimited projects", "Unlimited members", "AI delay prediction", "What-if simulation", "Workload intelligence", "Priority support"],
                cta: "Start Pro free",
                highlight: true,
                badge: "Most popular",
              },
              {
                name: "Enterprise",
                price: "Custom",
                per: "contact us",
                features: ["Everything in Pro", "Multi-agent AI system", "Slack + Jira integration", "SSO + SAML", "SLA + dedicated CSM", "Custom AI training"],
                cta: "Talk to sales",
                highlight: false,
              },
            ].map(p => (
              <div key={p.name} className={`lp-price-card lp-animate ${p.highlight ? "lp-price-card--highlight" : ""}`}>
                {p.badge && <div className="lp-price-badge">{p.badge}</div>}
                <div className="lp-price-name">{p.name}</div>
                <div className="lp-price-amount">
                  <span className="lp-price-num">{p.price}</span>
                  <span className="lp-price-per">{p.per}</span>
                </div>
                <ul className="lp-price-features">
                  {p.features.map(f => (
                    <li key={f}><span className="lp-check">✓</span> {f}</li>
                  ))}
                </ul>
                <button
                  className={p.highlight ? "lp-cta-primary" : "lp-cta-outline"}
                  onClick={() => navigate("/register")}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="lp-final-cta">
        <div className="lp-final-cta-bg">
          <div className="lp-hero-glow lp-glow-1" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
        </div>
        <div className="lp-final-cta-content lp-animate">
          <h2>Your team deserves an execution brain,<br />not another task list.</h2>
          <p>Join teams that predict, simulate, and execute smarter with Taskora AI.</p>
          <button className="lp-cta-primary lp-cta-large" onClick={() => navigate("/register")}>
            Start free — no credit card needed
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-nav-logo">
              <div className="lp-logo-mark">T</div>
              <span className="lp-logo-name">Taskora</span>
              <span className="lp-logo-badge">AI</span>
            </div>
            <p>AI-powered execution intelligence.<br />Predict. Simulate. Execute.</p>
          </div>

          <div className="lp-footer-links">
            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Product</div>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Company</div>
              <a href="/about">About us</a>
              <a href="/contact">Contact</a>
              <a href="/about#timeline">Our story</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Legal</div>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms of service</a>
              <a href="/contact">Security</a>
            </div>
            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Support</div>
              <a href="/contact">Help center</a>
              <a href="mailto:support@taskora.app">Email support</a>
              <a href="/contact">Report a bug</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} Taskora. Built by Ayush Sharma with React + Node.js + PostgreSQL.</span>
          <span>
            Questions? <a href="mailto:support@taskora.app" style={{color:"#94a3b8"}}>support@taskora.app</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
