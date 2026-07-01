import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Taskora Error Boundary caught:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Per-view inline fallback (when `inline` prop is set)
    if (this.props.inline) {
      return (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>
            {this.props.viewName || "This view"} failed to load
          </div>
          <div style={{ fontSize: 13, marginBottom: 16, color: "#94a3b8" }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: "8px 18px", borderRadius: 8, background: "var(--tk-accent, #3B82F6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div style={S.root}>
        <div style={S.blob1} />
        <div style={S.blob2} />
        <div style={S.card}>
          <div style={S.iconWrap}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 style={S.heading}>Something went wrong</h1>
          <p style={S.sub}>
            An unexpected error occurred in Taskora. Please reload or contact support if the issue persists.
          </p>

          <div style={S.errorDetail}>
            <code style={S.errorCode}>
              {this.state.error?.message || "Unknown error"}
            </code>
          </div>

          <div style={S.actions}>
            <button
              style={S.primaryBtn}
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <button
              style={S.secondaryBtn}
              onClick={() => { window.location.href = "/dashboard"; }}
            >
              Go to Dashboard
            </button>
          </div>

          <div style={S.support}>
            <p style={S.supportText}>
              Still seeing this?{" "}
              <a href="mailto:support@taskora.app" style={S.supportLink}>
                Contact support@taskora.app
              </a>
            </p>
            <p style={{ ...S.supportText, marginTop: 4 }}>
              Or report it on{" "}
              <a
                href="https://github.com/ayushsharma/taskora/issues"
                target="_blank"
                rel="noreferrer"
                style={S.supportLink}
              >
                GitHub Issues
              </a>
            </p>
          </div>
        </div>

        <div style={S.logoRow}>
          <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="tkMark" x1="8" y1="20" x2="94" y2="90" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#3B82F6"/>
                <stop offset="1" stopColor="#06B6D4"/>
              </linearGradient>
            </defs>
            <path d="M8 20 L62 20 L94 28 L62 36 L43 36 L43 90 L27 90 L27 36 L8 36 Z" fill="url(#tkMark)"/>
          </svg>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "-0.2px" }}>
            <span style={{ color: "rgba(255,255,255,0.9)" }}>Task</span><span style={{ background: "linear-gradient(90deg,#3B82F6,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>ora</span>
          </span>
        </div>
      </div>
    );
  }
}

const S = {
  root: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    padding: 24,
    gap: 24,
    position: "relative",
    overflow: "hidden",
  },
  blob1: {
    position: "absolute", width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(239,68,68,0.2) 0%, transparent 70%)",
    top: "-100px", left: "-100px", pointerEvents: "none",
  },
  blob2: {
    position: "absolute", width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)",
    bottom: "-80px", right: "-80px", pointerEvents: "none",
  },
  card: {
    background: "var(--card-bg, #1e293b)",
    borderRadius: 20,
    padding: "40px 44px",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
    position: "relative",
    zIndex: 1,
    textAlign: "center",
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: "50%",
    background: "rgba(239,68,68,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 20px",
  },
  heading: {
    fontSize: 24, fontWeight: 800, color: "var(--text-primary, #f1f5f9)",
    margin: "0 0 8px", letterSpacing: "-0.5px",
  },
  sub: { fontSize: 14, color: "var(--text-secondary, #94a3b8)", margin: "0 0 20px", lineHeight: 1.6 },
  errorDetail: {
    background: "var(--column-bg, #0f172a)", border: "1px solid var(--border, #334155)",
    borderRadius: 8, padding: "10px 14px", marginBottom: 24,
    textAlign: "left",
  },
  errorCode: {
    fontSize: 12, color: "#ef4444", fontFamily: "monospace",
    wordBreak: "break-word",
  },
  actions: { display: "flex", gap: 12, marginBottom: 20 },
  primaryBtn: {
    flex: 1, padding: "12px",
    background: "var(--tk-accent, #3B82F6)",
    color: "#fff", border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
  secondaryBtn: {
    flex: 1, padding: "12px",
    background: "none", color: "var(--tk-accent, #3B82F6)",
    border: "1.5px solid var(--tk-accent, #3B82F6)", borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  support: { borderTop: "1px solid var(--border, #334155)", paddingTop: 16 },
  supportText: { fontSize: 13, color: "#94a3b8", margin: "0 0 4px" },
  supportLink: { color: "var(--tk-accent, #3B82F6)", fontWeight: 600, textDecoration: "none" },
  logoRow: {
    display: "flex", alignItems: "center", gap: 8,
    position: "relative", zIndex: 1,
  },
  logoMark: {
    width: 28, height: 28, borderRadius: 8,
    background: "var(--tk-accent, #3B82F6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 14,
  },
  logoText: { fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.9)" },
  logoBadge: {
    fontSize: 10, fontWeight: 700, color: "var(--tk-accent, #3B82F6)",
    background: "rgba(59,130,246,0.15)",
    borderRadius: 4, padding: "2px 5px",
  },
};
