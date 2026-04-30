"""
Jarvis Security Firewall — FastAPI Middleware
=============================================
Protections:
  • SQL Injection, XSS, Command Injection, SSRF, Path Traversal
  • Per-IP and per-user rate limiting
  • Request size limiting
  • JWT validation on protected routes
  • Security response headers
  • Full structured logging of blocked/suspicious requests
"""

import json
import time
import logging
import hashlib
from typing import Optional, Callable
from datetime import datetime, timezone

import jwt as pyjwt
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .rules import check_payload, scan_dict
from .rate_limiter import limiter

logger = logging.getLogger("jarvis.firewall")

# ── Config ────────────────────────────────────────────────────────────────────
MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024   # 2 MB
MAX_URL_LENGTH         = 2048
MAX_HEADER_VALUE_LEN   = 8192

SECURITY_HEADERS = {
    "X-Content-Type-Options":           "nosniff",
    "X-Frame-Options":                  "DENY",
    "X-XSS-Protection":                 "1; mode=block",
    "Referrer-Policy":                  "strict-origin-when-cross-origin",
    "Permissions-Policy":               "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security":        "max-age=63072000; includeSubDomains; preload",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https: wss:; "
        "font-src 'self' https: data:; "
        "object-src 'none'"
    ),
}

# Routes that require valid JWT
PROTECTED_PREFIXES = ["/api/jarvis", "/api/chat", "/api/audit", "/api/tasks"]

# Routes that skip attack scanning (e.g. file uploads with binary data)
SCAN_SKIP_PREFIXES = ["/api/health", "/docs", "/openapi.json", "/redoc"]


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _payload_signature(raw: bytes) -> str:
    """Short fingerprint for log deduplication."""
    return hashlib.sha1(raw).hexdigest()[:12]  # noqa: S324


def _log_blocked(
    request: Request,
    ip: str,
    reason: str,
    severity: str,
    extra: dict | None = None,
) -> None:
    record = {
        "event":       "firewall_blocked",
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "ip":          ip,
        "method":      request.method,
        "path":        request.url.path,
        "query":       str(request.url.query)[:200],
        "user_agent":  request.headers.get("user-agent", "")[:200],
        "reason":      reason,
        "severity":    severity,
        **(extra or {}),
    }
    logger.warning(json.dumps(record))


# ── Main Middleware ───────────────────────────────────────────────────────────
class JarvisFirewallMiddleware(BaseHTTPMiddleware):

    def __init__(self, app: ASGIApp, jwt_secret: str = "", jwt_algorithm: str = "HS256"):
        super().__init__(app)
        self._jwt_secret    = jwt_secret
        self._jwt_algorithm = jwt_algorithm

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        ip   = _get_client_ip(request)
        path = request.url.path

        # ── 1. Skip scanning for static/health routes ─────────────────────────
        skip_scan = any(path.startswith(p) for p in SCAN_SKIP_PREFIXES)

        # ── 2. URL length check ───────────────────────────────────────────────
        if len(str(request.url)) > MAX_URL_LENGTH:
            _log_blocked(request, ip, "url_too_long", "Medium")
            return self._block(413, "Request URI too long")

        # ── 3. IP rate limiting ───────────────────────────────────────────────
        allowed, retry_after = await limiter.check_ip(ip, path)
        if not allowed:
            _log_blocked(request, ip, "rate_limit_ip", "Medium",
                         {"retry_after": retry_after})
            return self._block(429, "Too many requests", {"Retry-After": str(retry_after)})

        # ── 4. Read body (with size limit) ────────────────────────────────────
        body_bytes = b""
        if request.method in ("POST", "PUT", "PATCH"):
            body_bytes = await request.body()
            if len(body_bytes) > MAX_REQUEST_BODY_BYTES:
                _log_blocked(request, ip, "body_too_large", "Medium",
                             {"size": len(body_bytes)})
                return self._block(413, "Request body too large")

        # ── 5. Attack pattern scanning (URL params + body) ────────────────────
        if not skip_scan:
            # Scan query string
            for key, val in request.query_params.items():
                blocked, attack, severity = check_payload(f"{key}={val}")
                if blocked:
                    _log_blocked(request, ip, f"attack:{attack}", severity,
                                 {"param": key, "sig": _payload_signature(body_bytes)})
                    return self._block(400, f"Blocked: {attack} detected in query params")

            # Scan URL path segments
            blocked, attack, severity = check_payload(path)
            if blocked:
                _log_blocked(request, ip, f"attack:{attack}", severity)
                return self._block(400, f"Blocked: {attack} detected in URL path")

            # Scan JSON body
            if body_bytes:
                ct = request.headers.get("content-type", "")
                if "application/json" in ct:
                    try:
                        body_json = json.loads(body_bytes)
                        findings  = scan_dict(body_json) if isinstance(body_json, dict) else []
                        if findings:
                            worst = max(findings, key=lambda f: {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}.get(f["severity"], 0))
                            _log_blocked(request, ip, f"attack:{worst['attack_type']}", worst["severity"],
                                         {"field": worst["field"], "sig": _payload_signature(body_bytes)})
                            return self._block(400, f"Blocked: {worst['attack_type']} detected in request body")
                    except json.JSONDecodeError:
                        pass

            # Scan headers for injection
            for hname in ("referer", "x-forwarded-for", "user-agent", "origin"):
                hval = request.headers.get(hname, "")
                if hval and len(hval) < MAX_HEADER_VALUE_LEN:
                    blocked, attack, severity = check_payload(hval)
                    if blocked:
                        _log_blocked(request, ip, f"attack:{attack}_header", severity,
                                     {"header": hname})
                        return self._block(400, f"Blocked: {attack} in request header")

        # ── 6. JWT validation for protected routes ────────────────────────────
        if self._jwt_secret and any(path.startswith(p) for p in PROTECTED_PREFIXES):
            auth_header = request.headers.get("authorization", "")
            token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""

            if not token:
                return self._block(401, "Authentication required")

            try:
                payload = pyjwt.decode(token, self._jwt_secret, algorithms=[self._jwt_algorithm])
                request.state.jwt_payload = payload
                user_id = str(payload.get("id") or payload.get("sub") or "")
            except pyjwt.ExpiredSignatureError:
                return self._block(401, "Token expired")
            except pyjwt.InvalidTokenError:
                return self._block(401, "Invalid token")

            # Per-user rate limiting
            if user_id:
                allowed, retry_after = await limiter.check_user(user_id, path)
                if not allowed:
                    _log_blocked(request, ip, "rate_limit_user", "Medium",
                                 {"user_id": user_id, "retry_after": retry_after})
                    return self._block(429, "User rate limit exceeded",
                                       {"Retry-After": str(retry_after)})

        # ── 7. Rebuild request with body so downstream can read it ────────────
        if body_bytes:
            async def receive():
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            request = Request(request.scope, receive)

        # ── 8. Process request ────────────────────────────────────────────────
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error(f"Unhandled exception on {path}: {exc}")
            return self._block(500, "Internal server error")

        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        # ── 9. Inject security headers ────────────────────────────────────────
        for name, value in SECURITY_HEADERS.items():
            response.headers[name] = value
        response.headers["X-Response-Time"] = f"{elapsed_ms}ms"
        response.headers["X-Powered-By"]    = "Jarvis/1.0"

        return response

    @staticmethod
    def _block(status: int, message: str, extra_headers: dict | None = None) -> JSONResponse:
        headers = dict(SECURITY_HEADERS)
        if extra_headers:
            headers.update(extra_headers)
        return JSONResponse(
            status_code=status,
            content={"error": message, "blocked_by": "Jarvis Firewall"},
            headers=headers,
        )
