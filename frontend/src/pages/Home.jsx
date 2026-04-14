import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      {/* Nav */}
      <nav className="home-nav">
        <div className="home-logo">
          <div className="home-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0052cc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          KanFlow
        </div>
        <div className="home-nav-actions">
          <button className="btn-ghost" onClick={() => navigate("/login")}>Sign In</button>
          <button className="btn-white" onClick={() => navigate("/register")}>Get Started Free</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="home-hero">
        <div className="home-badge">
          <span>✦</span> Project Management Reimagined
        </div>
        <h1>
          Your team's work,<br />
          <span>beautifully organized</span>
        </h1>
        <p>
          KanFlow combines the simplicity of Trello, the power of Jira, and the
          flexibility of Notion into one seamless platform.
        </p>
        <div className="home-hero-cta">
          <button className="btn-primary-lg" onClick={() => navigate("/register")}>
            Start for free →
          </button>
          <button className="btn-secondary-lg" onClick={() => navigate("/login")}>
            Sign in to workspace
          </button>
        </div>

        {/* Feature cards */}
        <div className="home-features">
          <div className="home-feature-card">
            <div className="home-feature-icon">📋</div>
            <h3>Kanban Boards</h3>
            <p>Visualize work with drag-and-drop Kanban boards across all your projects.</p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">🏢</div>
            <h3>Multiple Workspaces</h3>
            <p>Organize teams and projects into separate workspaces, just like Notion.</p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">🔐</div>
            <h3>Secure Auth</h3>
            <p>JWT-based authentication keeps your data safe and your sessions persistent.</p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">⚡</div>
            <h3>Real-time Updates</h3>
            <p>All changes sync instantly to the database — no data loss, ever.</p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        © {new Date().getFullYear()} KanFlow. Built with React + Node.js + PostgreSQL.
      </footer>
    </div>
  );
}
