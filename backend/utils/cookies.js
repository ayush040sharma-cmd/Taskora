const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Set the httpOnly auth cookie on a response.
 * Secure + SameSite=Strict in production; lax in dev so localhost works.
 */
function setAuthCookie(res, token) {
  res.cookie("taskora_token", token, {
    httpOnly: true,
    secure:   IS_PROD,              // HTTPS only in production
    sameSite: IS_PROD ? "strict" : "lax",
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days (matches JWT expiry)
    path:     "/",
  });
}

/**
 * Clear the auth cookie (logout).
 */
function clearAuthCookie(res) {
  res.clearCookie("taskora_token", {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    path:     "/",
  });
}

module.exports = { setAuthCookie, clearAuthCookie };
