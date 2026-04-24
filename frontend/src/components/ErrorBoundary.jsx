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
            An unexpected error occurred in Taskora. Our team has been notified.
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
            <p style={S.supportText} style={{ marginTop: 4 }}>
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
          <div style={S.logoMark}>T</div>
          <span style={S.logoText}>Taskora</span>
          <span style={S.logoBadge}>AI</span>
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
    background: "#fff",
    borderRadius: 20,
    padding: "40px 44px",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
    position: "relative",
    zIndex: 1,
    textAlign: "center",
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: "50%",
    background: "#fef2f2",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 20px",
  },
  heading: {
    fontSize: 24, fontWeight: 800, color: "#0f172a",
    margin: "0 0 8px", letterSpacing: "-0.5px",
  },
  sub: { fontSize: 14, color: "#64748b", margin: "0 0 20px", lineHeight: 1.6 },
  errorDetail: {
    background: "#f8fafc", border: "1px solid #e2e8f0",
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
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
  secondaryBtn: {
    flex: 1, padding: "12px",
    background: "none", color: "#6366f1",
    border: "1.5px solid #6366f1", borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  support: { borderTop: "1px solid #f1f5f9", paddingTop: 16 },
  supportText: { fontSize: 13, color: "#94a3b8", margin: "0 0 4px" },
  supportLink: { color: "#6366f1", fontWeight: 600, textDecoration: "none" },
  logoRow: {
    display: "flex", alignItems: "center", gap: 8,
    position: "relative", zIndex: 1,
  },
  logoMark: {
    width: 28, height: 28, borderRadius: 8,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 14,
  },
  logoText: { fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.9)" },
  logoBadge: {
    fontSize: 10, fontWeight: 700, color: "#6366f1",
    background: "rgba(99,102,241,0.15)",
    borderRadius: 4, padding: "2px 5px",
  },
};
