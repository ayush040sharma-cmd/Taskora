import { useNavigate } from "react-router-dom";
import TaskoraLogo from "../components/TaskoraLogo";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      {/* Nav */}
      <nav className="home-nav">
        <TaskoraLogo size={30} color="#ffffff" showName nameColor="#ffffff" />
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
          Taskora combines the simplicity of Trello, the power of Jira, and the
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

        <div className="home-features">
          <div className="home-feature-card">
            <div className="home-feature-icon">📋</div>
            <h3>Kanban Boards</h3>
            <p>Visualize work with drag-and-drop boards across all your projects.</p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">🏢</div>
            <h3>Multiple Workspaces</h3>
            <p>Organize teams and projects into separate workspaces, Notion-style.</p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">🔐</div>
            <h3>Secure Auth</h3>
            <p>JWT-based authentication keeps your data safe and sessions persistent.</p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">⚡</div>
            <h3>Real-time Sync</h3>
            <p>All changes sync instantly to the database — no data loss, ever.</p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        © {new Date().getFullYear()} Taskora. Built with React + Node.js + PostgreSQL.
      </footer>
    </div>
  );
}
