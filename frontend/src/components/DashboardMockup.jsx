import Logo from "./Logo";

/**
 * Static illustrative preview of the Taskora dashboard -- an AI risk banner,
 * a 3-column kanban board, and a workload strip. Shared by the landing page
 * hero and the sign-in page's product showcase; styled via the .lp-mock-*
 * classes in index.css.
 */
export default function DashboardMockup() {
  return (
    <div className="lp-mockup">
      {/* Mockup header */}
      <div className="lp-mock-bar">
        <div className="lp-mock-dots">
          <span style={{ background: "#ff5f56" }} />
          <span style={{ background: "#ffbd2e" }} />
          <span style={{ background: "#27c93f" }} />
        </div>
        <div className="lp-mock-url">taskora.io/dashboard</div>
      </div>

      <div className="lp-mock-body">
        {/* Sidebar */}
        <div className="lp-mock-sidebar">
          <Logo iconSize={20} showWordmark={false} className="lp-mock-logo" />
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
