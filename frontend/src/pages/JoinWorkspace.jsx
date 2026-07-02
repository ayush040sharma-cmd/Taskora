import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";
import Logo from "../components/Logo";

export default function JoinWorkspace() {
  const { token } = useParams();
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [info,    setInfo]    = useState(null);
  const [status,  setStatus]  = useState("loading"); // loading | valid | used | expired | error | joining | joined
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get(`/members/invite/${token}`)
      .then(res => { setInfo(res.data); setStatus("valid"); })
      .catch(err => {
        const msg = err.response?.data?.message || "Invalid invite link";
        if (msg.toLowerCase().includes("expired")) setStatus("expired");
        else if (msg.toLowerCase().includes("used"))    setStatus("used");
        else setStatus("error");
        setMessage(msg);
      });
  }, [token]);

  const handleJoin = async () => {
    if (!user) {
      // Save destination and send to login
      sessionStorage.setItem("invite_redirect", `/join/${token}`);
      navigate(`/login?redirect=/join/${token}`);
      return;
    }
    setStatus("joining");
    try {
      await api.post(`/members/invite/${token}/accept`);
      setStatus("joined");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.message || "Failed to join workspace");
    }
  };

  const goToDashboard = () => navigate("/dashboard");

  const ROLE_LABEL = { manager: "Manager", member: "Member", viewer: "Viewer" };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#020617", fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: "#0B1220", border: "1px solid #1E293B", borderRadius: 16,
        padding: "40px 48px", width: "100%", maxWidth: 440,
        textAlign: "center",
      }}>
        {/* Logo */}
        <Logo iconSize={28} wordmarkSize={20} justify="center" style={{ marginBottom: 32 }} />

        {status === "loading" && (
          <div style={{ color: "#94A3B8", fontSize: 14 }}>Validating invite link…</div>
        )}

        {status === "valid" && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>
              You're invited!
            </div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 24, lineHeight: 1.6 }}>
              <strong style={{ color: "#E2E8F0" }}>{info?.invited_by_name || "Someone"}</strong> has invited you to join
              <br />
              <strong style={{ color: "#3B82F6", fontSize: 16 }}>{info?.workspace_name}</strong>
              <br />
              as a <span style={{
                background: "rgba(59,130,246,0.15)", color: "#3B82F6",
                borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 600,
              }}>
                {ROLE_LABEL[info?.role] || info?.role}
              </span>
            </div>

            {!user && (
              <div style={{
                background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F59E0B",
                marginBottom: 16, lineHeight: 1.5,
              }}>
                Log in or create a free account to accept this invite.
              </div>
            )}

            {user && (
              <div style={{
                background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#22C55E",
                marginBottom: 20,
              }}>
                You're logged in as <strong>{user.name}</strong>
              </div>
            )}

            {user ? (
              <button
                onClick={handleJoin}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 10,
                  background: "linear-gradient(90deg,#3B82F6,#06B6D4)",
                  color: "#fff", border: "none", fontSize: 14, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Join {info?.workspace_name}
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  onClick={handleJoin}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 10,
                    background: "linear-gradient(90deg,#3B82F6,#06B6D4)",
                    color: "#fff", border: "none", fontSize: 14, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Log in to Accept
                </button>
                <button
                  onClick={() => navigate(`/register?redirect=/join/${token}`)}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 10,
                    background: "transparent", color: "#94A3B8",
                    border: "1px solid #1E293B", fontSize: 14, cursor: "pointer",
                  }}
                >
                  Create a free account →
                </button>
              </div>
            )}

            <div style={{ fontSize: 11, color: "#475569", marginTop: 12 }}>
              Link expires {new Date(info?.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </>
        )}

        {status === "joining" && (
          <div style={{ color: "#94A3B8", fontSize: 14 }}>Joining workspace…</div>
        )}

        {status === "joined" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>
              You're in!
            </div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 24 }}>
              You've successfully joined the workspace. Head to your dashboard to get started.
            </div>
            <button
              onClick={goToDashboard}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                background: "linear-gradient(90deg,#3B82F6,#06B6D4)",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Go to Dashboard →
            </button>
          </>
        )}

        {(status === "expired" || status === "used" || status === "error") && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>
              {status === "used" ? "✅" : "⚠️"}
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>
              {status === "used"    ? "Link already used"   :
               status === "expired" ? "Link expired"        : "Invalid link"}
            </div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 24 }}>
              {message || "This invite link is no longer valid. Ask the workspace owner to send a new one."}
            </div>
            <button
              onClick={() => navigate(user ? "/dashboard" : "/login")}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                background: "#1E293B", color: "#94A3B8",
                border: "1px solid #334155", fontSize: 14, cursor: "pointer",
              }}
            >
              {user ? "Go to Dashboard" : "Log in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
