"""
Unit tests for the Jarvis firewall layer.
Tests: rules.py, rate_limiter.py, and middleware response codes.

Run with:
  cd ai-agent
  pytest firewall/tests/test_firewall.py -v
"""

import pytest
import time
from unittest.mock import AsyncMock, MagicMock

from firewall.rules import check_payload, scan_dict
from firewall.rate_limiter import RateLimiter, RateLimitResult


# ─────────────────────────────────────────────────────────────────────────────
# rules.py tests
# ─────────────────────────────────────────────────────────────────────────────

class TestSQLInjection:
    def test_union_select(self):
        blocked, attack, sev = check_payload("' UNION SELECT * FROM users --")
        assert blocked
        assert attack == "sql_injection"
        assert sev == "critical"

    def test_or_1_eq_1(self):
        blocked, _, _ = check_payload("admin' OR '1'='1")
        assert blocked

    def test_drop_table(self):
        blocked, attack, _ = check_payload("'; DROP TABLE users; --")
        assert blocked
        assert attack == "sql_injection"

    def test_safe_string(self):
        blocked, _, _ = check_payload("select a product from the store")
        assert not blocked

    def test_case_insensitive(self):
        blocked, attack, _ = check_payload("' uNiOn SeLeCt 1,2,3 --")
        assert blocked
        assert attack == "sql_injection"


class TestXSS:
    def test_script_tag(self):
        blocked, attack, sev = check_payload("<script>alert('xss')</script>")
        assert blocked
        assert attack == "xss"
        assert sev == "high"

    def test_img_onerror(self):
        blocked, attack, _ = check_payload("<img src=x onerror=alert(1)>")
        assert blocked
        assert attack == "xss"

    def test_javascript_href(self):
        blocked, attack, _ = check_payload("javascript:alert(document.cookie)")
        assert blocked
        assert attack == "xss"

    def test_safe_html_description(self):
        blocked, _, _ = check_payload("Fix the login form button alignment")
        assert not blocked


class TestCommandInjection:
    def test_semicolon_rm(self):
        blocked, attack, sev = check_payload("; rm -rf /")
        assert blocked
        assert attack == "command_injection"
        assert sev == "critical"

    def test_pipe_cat(self):
        blocked, attack, _ = check_payload("| cat /etc/passwd")
        assert blocked
        assert attack == "command_injection"

    def test_backtick_exec(self):
        blocked, attack, _ = check_payload("`whoami`")
        assert blocked
        assert attack == "command_injection"

    def test_normal_task_title(self):
        blocked, _, _ = check_payload("Deploy new feature to production")
        assert not blocked


class TestPathTraversal:
    def test_dotdot_slash(self):
        blocked, attack, _ = check_payload("../../etc/passwd")
        assert blocked
        assert attack == "path_traversal"

    def test_encoded_traversal(self):
        blocked, attack, _ = check_payload("%2e%2e%2fetc%2fpasswd")
        assert blocked
        assert attack == "path_traversal"

    def test_normal_relative_path(self):
        blocked, _, _ = check_payload("src/components/App.jsx")
        assert not blocked


class TestScanDict:
    def test_nested_sql_injection(self):
        findings = scan_dict({"user": {"name": "admin' OR 1=1 --"}})
        assert len(findings) == 1
        assert findings[0]["type"] == "sql_injection"

    def test_multiple_findings(self):
        findings = scan_dict({
            "title": "<script>alert(1)</script>",
            "body":  "' UNION SELECT 1 --",
        })
        assert len(findings) == 2

    def test_list_values(self):
        findings = scan_dict({"tags": ["normal", "<script>evil</script>"]})
        assert len(findings) == 1

    def test_clean_payload(self):
        findings = scan_dict({"title": "Fix bug", "priority": "high", "assignee": "alice"})
        assert findings == []


# ─────────────────────────────────────────────────────────────────────────────
# rate_limiter.py tests
# ─────────────────────────────────────────────────────────────────────────────

class TestRateLimiter:
    def setup_method(self):
        # Fresh limiter instance per test
        self.rl = RateLimiter()

    def test_ip_allowed_under_limit(self):
        result = self.rl.check_ip("1.2.3.4", "/api/tasks")
        assert result == RateLimitResult.ALLOWED

    def test_ip_blocked_after_auth_limit(self):
        # Auth bucket: 10 requests/min
        ip = "10.0.0.1"
        for _ in range(10):
            self.rl.check_ip(ip, "/api/auth/login")
        result = self.rl.check_ip(ip, "/api/auth/login")
        assert result == RateLimitResult.BLOCKED

    def test_different_ips_independent(self):
        for _ in range(10):
            self.rl.check_ip("192.168.1.1", "/api/auth/login")
        # Different IP should still be allowed
        result = self.rl.check_ip("192.168.1.2", "/api/auth/login")
        assert result == RateLimitResult.ALLOWED

    def test_user_allowed_under_limit(self):
        result = self.rl.check_user("user-123", "/api/tasks")
        assert result == RateLimitResult.ALLOWED

    def test_jarvis_bucket(self):
        ip = "5.5.5.5"
        # Jarvis: 30 requests/min
        for _ in range(30):
            self.rl.check_ip(ip, "/api/jarvis/command")
        result = self.rl.check_ip(ip, "/api/jarvis/command")
        assert result == RateLimitResult.BLOCKED

    def test_heavy_bucket(self):
        ip = "6.6.6.6"
        # Heavy: 5 requests/min
        for _ in range(5):
            self.rl.check_ip(ip, "/api/security/scan")
        result = self.rl.check_ip(ip, "/api/security/scan")
        assert result == RateLimitResult.BLOCKED

    def test_window_resets(self):
        """After window passes, requests are allowed again."""
        rl = RateLimiter()
        # Use a very short window by monkey-patching
        rl._buckets["auth"]["window_s"] = 1  # type: ignore[index]
        ip = "7.7.7.7"
        for _ in range(10):
            rl.check_ip(ip, "/api/auth/login")
        # Blocked now
        assert rl.check_ip(ip, "/api/auth/login") == RateLimitResult.BLOCKED
        # Wait for window to expire
        time.sleep(1.1)
        assert rl.check_ip(ip, "/api/auth/login") == RateLimitResult.ALLOWED


# ─────────────────────────────────────────────────────────────────────────────
# Middleware integration tests (using HTTPX TestClient)
# ─────────────────────────────────────────────────────────────────────────────

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from firewall.middleware import JarvisFirewallMiddleware

    _test_app = FastAPI()

    @_test_app.get("/api/tasks")
    async def _tasks():
        return {"tasks": []}

    @_test_app.post("/api/auth/login")
    async def _login():
        return {"token": "test"}

    _test_app.add_middleware(JarvisFirewallMiddleware, jwt_secret="")

    class TestMiddleware:
        def setup_method(self):
            self.client = TestClient(_test_app, raise_server_exceptions=False)

        def test_clean_request_passes(self):
            r = self.client.get("/api/tasks")
            assert r.status_code == 200

        def test_sql_injection_in_query_blocked(self):
            r = self.client.get("/api/tasks?search=' UNION SELECT 1 --")
            assert r.status_code == 400
            assert r.json()["attack_type"] == "sql_injection"

        def test_xss_in_body_blocked(self):
            r = self.client.post(
                "/api/auth/login",
                json={"email": "<script>alert(1)</script>", "password": "test"},
            )
            assert r.status_code == 400

        def test_url_too_long_rejected(self):
            r = self.client.get("/api/tasks?" + "a=" * 300)
            assert r.status_code == 414

        def test_security_headers_present(self):
            r = self.client.get("/api/tasks")
            assert "x-content-type-options" in r.headers
            assert "x-frame-options" in r.headers

except ImportError:
    pass  # TestClient/FastAPI not available in this environment
