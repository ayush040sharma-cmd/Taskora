const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Set the httpOnly auth cookie on a response.
 * Secure + SameSite=Strict in production; lax in dev so localhost works.
 */
function setAuthCookie(res, token) {
  res.cookie("taskora_token", token, {
    httpOnly: true,
    secure:   IS_PROD,
    // "none" required for cross-origin (Vercel frontend → Render backend).
    // "none" requires secure:true (HTTPS), which is always true in prod.
    sameSite: IS_PROD ? "none" : "lax",
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie("taskora_token", {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    path:     "/",
  });
}

/**
 * CSRF state cookie for the OAuth flow (currently Google; reusable for any
 * future provider). Short-lived -- only needs to survive the redirect
 * roundtrip to the provider and back, not a real session.
 */
function setOAuthStateCookie(res, state) {
  res.cookie("taskora_oauth_state", state, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    maxAge:   10 * 60 * 1000, // 10 minutes
    path:     "/",
  });
}

function clearOAuthStateCookie(res) {
  res.clearCookie("taskora_oauth_state", {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    path:     "/",
  });
}

module.exports = { setAuthCookie, clearAuthCookie, setOAuthStateCookie, clearOAuthStateCookie };
