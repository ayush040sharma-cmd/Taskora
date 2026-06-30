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

module.exports = { setAuthCookie, clearAuthCookie };
