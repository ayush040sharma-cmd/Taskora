import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Unauthorized() {
  const navigate  = useNavigate();
  const { user }  = useAuth();

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg, #0f172a)",
      color: "var(--text, #e2e8f0)",
      fontFamily: "inherit",
      gap: 16,
      padding: 24,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 56 }}>🔒</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Access Denied</h1>
      <p style={{ color: "#94a3b8", maxWidth: 400, margin: 0 }}>
        You don't have permission to view this page.
        {user && (
          <> Your current role is <strong style={{ color: "#e2e8f0" }}>{user.role}</strong>.</>
        )}
      </p>
      <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
        Contact your administrator if you believe this is a mistake.
      </p>
      <button
        onClick={() => navigate("/dashboard")}
        style={{
          marginTop: 8,
          padding: "10px 24px",
          background: "#6366f1",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}
