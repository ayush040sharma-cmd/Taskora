import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const userStr = searchParams.get("user");
    const err = searchParams.get("error");

    if (err) {
      setError(decodeURIComponent(err));
      return;
    }

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr));
        loginWithToken(token, user);
        navigate("/dashboard", { replace: true });
      } catch {
        setError("Sign-in failed. Please try again.");
      }
    } else {
      setError("Invalid sign-in response. Please try again.");
    }
  }, []);

  if (error) {
    return (
      <div style={S.root}>
        <div style={S.card}>
          <div style={S.errorIcon}>❌</div>
          <h2 style={S.heading}>Sign-in failed</h2>
          <p style={S.sub}>{error}</p>
          <button style={S.btn} onClick={() => navigate("/login")}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.spinner} />
        <p style={S.sub}>Signing you in…</p>
      </div>
    </div>
  );
}

const S = {
  root: {
    minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  },
  card: {
    background: "#fff", borderRadius: 20, padding: "48px 44px",
    textAlign: "center", maxWidth: 380, width: "100%",
    boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
  },
  spinner: {
    width: 40, height: 40, borderRadius: "50%",
    border: "3px solid #e2e8f0",
    borderTopColor: "#6366f1",
    animation: "spin 0.7s linear infinite",
    margin: "0 auto 16px",
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  heading: { fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" },
  sub: { fontSize: 14, color: "#64748b", margin: "0 0 24px" },
  btn: {
    padding: "12px 28px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
};
