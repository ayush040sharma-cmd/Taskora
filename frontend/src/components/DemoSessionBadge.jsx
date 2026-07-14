import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const WARNING_THRESHOLD_SECONDS = 60;

/**
 * Persistent countdown for demo sessions -- previously a demo user was
 * logged out after 5 minutes with zero warning (the single longest-standing
 * unresolved issue across every product audit since 2026-04-30). Always
 * visible while a demo session is active, not just in the final seconds, so
 * the timeout is never a surprise; switches to a warning treatment plus a
 * sign-up CTA in the last minute.
 */
// `variant="floating"` (default) is a bottom-left pill for the desktop
// layout, which has no fixed bottom chrome. `variant="top-banner"` is a
// full-width bar anchored right below the header instead -- the mobile
// layout (DashboardMobile.jsx) has its own fixed bottom tab bar that a
// bottom-left pill would sit on top of.
export default function DemoSessionBadge({ variant = "floating" }) {
  const { demoSecondsLeft, logout } = useAuth();
  const navigate = useNavigate();
  if (demoSecondsLeft === null) return null;

  // /register is wrapped in PublicRoute, which redirects anyone already
  // logged in (including a demo user) straight back to /dashboard -- a
  // plain <a href="/register"> would silently no-op here. End the demo
  // session first so the redirect target actually renders the form.
  const handleSignUp = async (e) => {
    e.preventDefault();
    await logout();
    navigate("/register");
  };

  const isWarning = demoSecondsLeft <= WARNING_THRESHOLD_SECONDS;
  const mins = Math.floor(demoSecondsLeft / 60);
  const secs = demoSecondsLeft % 60;
  const timeText = `${mins}:${String(secs).padStart(2, "0")}`;

  const baseStyle = {
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: isWarning ? "#fff" : "#92400e",
    background: isWarning ? "linear-gradient(90deg,#dc2626,#ef4444)" : "#fef3c7",
    border: isWarning ? "none" : "1px solid #fde68a",
    transition: "background 0.3s, color 0.3s",
  };

  const style = variant === "top-banner"
    ? { ...baseStyle, position: "sticky", top: 0, justifyContent: "center", padding: "8px 12px", borderRadius: 0 }
    : { ...baseStyle, position: "fixed", bottom: 20, left: 20, padding: "9px 15px", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" };

  return (
    <div role="status" aria-live="polite" style={style}>
      <span aria-hidden="true">{isWarning ? "⚠️" : "🚀"}</span>
      <span>Demo session &middot; {timeText} left</span>
      {isWarning && (
        <a
          href="/register"
          onClick={handleSignUp}
          style={{ color: "#fff", textDecoration: "underline", fontWeight: 700, marginLeft: 2 }}
        >
          Sign up to keep your work
        </a>
      )}
    </div>
  );
}
