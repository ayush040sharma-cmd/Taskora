"""
In-process sliding-window rate limiter.
Per-IP and per-user (JWT sub) enforcement.
Thread-safe via asyncio.Lock.
"""

import time
import asyncio
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RateLimit:
    requests: int   # max requests
    window:   int   # seconds


# Default limits (configurable)
LIMITS = {
    "global":     RateLimit(requests=300, window=60),    # 300/min per IP
    "auth":       RateLimit(requests=10,  window=60),    # 10/min for auth endpoints
    "api":        RateLimit(requests=120, window=60),    # 120/min per user
    "jarvis":     RateLimit(requests=30,  window=60),    # 30/min for AI endpoints
    "heavy":      RateLimit(requests=5,   window=60),    # 5/min for heavy ops
}

# Path → bucket mapping
PATH_BUCKETS = {
    "/api/auth":    "auth",
    "/api/jarvis":  "jarvis",
    "/api/chat":    "jarvis",
    "/api/audit":   "heavy",
    "/api/ai":      "heavy",
}


@dataclass
class _Window:
    timestamps: deque = field(default_factory=deque)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class RateLimiter:
    def __init__(self):
        self._ip_windows:   dict[str, dict[str, _Window]] = defaultdict(lambda: defaultdict(_Window))
        self._user_windows: dict[str, dict[str, _Window]] = defaultdict(lambda: defaultdict(_Window))

    def _bucket_for(self, path: str) -> str:
        for prefix, bucket in PATH_BUCKETS.items():
            if path.startswith(prefix):
                return bucket
        return "global"

    async def check_ip(self, ip: str, path: str) -> tuple[bool, int]:
        """Returns (allowed, retry_after_seconds)."""
        bucket = self._bucket_for(path)
        limit  = LIMITS.get(bucket, LIMITS["global"])
        window = self._ip_windows[ip][bucket]

        async with window.lock:
            now = time.time()
            # Drop timestamps outside the window
            while window.timestamps and window.timestamps[0] < now - limit.window:
                window.timestamps.popleft()

            if len(window.timestamps) >= limit.requests:
                retry = int(limit.window - (now - window.timestamps[0])) + 1
                return False, retry

            window.timestamps.append(now)
            return True, 0

    async def check_user(self, user_id: str, path: str) -> tuple[bool, int]:
        """Per-user rate check (uses 'api' bucket by default)."""
        bucket = self._bucket_for(path)
        limit  = LIMITS.get(bucket, LIMITS["api"])
        window = self._user_windows[user_id][bucket]

        async with window.lock:
            now = time.time()
            while window.timestamps and window.timestamps[0] < now - limit.window:
                window.timestamps.popleft()

            if len(window.timestamps) >= limit.requests:
                retry = int(limit.window - (now - window.timestamps[0])) + 1
                return False, retry

            window.timestamps.append(now)
            return True, 0

    def reset_ip(self, ip: str) -> None:
        """Clear all windows for an IP (e.g. after captcha pass)."""
        if ip in self._ip_windows:
            del self._ip_windows[ip]

    def stats(self) -> dict:
        return {
            "tracked_ips":   len(self._ip_windows),
            "tracked_users": len(self._user_windows),
        }


# Singleton
limiter = RateLimiter()
