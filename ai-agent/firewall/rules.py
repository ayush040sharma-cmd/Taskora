"""
Attack detection rules for the Jarvis firewall.
Each rule returns (blocked: bool, reason: str, severity: str).
"""

import re
from typing import Tuple

# ── SQL Injection patterns ────────────────────────────────────────────────────
SQL_PATTERNS = [
    r"(\b(select|insert|update|delete|drop|create|alter|truncate|exec|execute|union|having|where)\b.{0,20}\b(from|into|table|database|schema)\b)",
    r"('|\"|`)\s*(or|and)\s*('|\"|`)?\s*[\w\d]+\s*=\s*[\w\d]+",
    r"--\s*$",                        # SQL comment at end
    r";\s*(drop|delete|truncate)\b",  # Stacked queries
    r"\bunion\s+(all\s+)?select\b",
    r"\bor\s+1\s*=\s*1\b",
    r"\band\s+1\s*=\s*1\b",
    r"xp_cmdshell",
    r"\bwaitfor\s+delay\b",
    r"\bsleep\s*\(\s*\d+\s*\)",
    r"benchmark\s*\(",
    r"load_file\s*\(",
    r"into\s+(out|dump)file",
    r"information_schema",
    r"0x[0-9a-fA-F]{4,}",            # Hex encoding
]

# ── XSS patterns ──────────────────────────────────────────────────────────────
XSS_PATTERNS = [
    r"<\s*script[\s>]",
    r"javascript\s*:",
    r"on(load|error|click|mouse|key|focus|blur|change|submit|reset|select|unload)\s*=",
    r"<\s*iframe[\s>]",
    r"<\s*object[\s>]",
    r"<\s*embed[\s>]",
    r"<\s*link[\s>]",
    r"<\s*meta[\s>]",
    r"vbscript\s*:",
    r"data\s*:\s*text/html",
    r"expression\s*\(",              # IE CSS expression
    r"&#[xX]?[0-9a-fA-F]+;",        # HTML entity encoding
    r"%3[cC]script",                 # URL-encoded <script
    r"\\u003[cC]",                   # Unicode-encoded <
]

# ── Command injection patterns ────────────────────────────────────────────────
CMD_PATTERNS = [
    r";\s*(ls|cat|whoami|id|uname|wget|curl|nc|bash|sh|python|perl|ruby)\b",
    r"\|\s*(ls|cat|whoami|id|uname|wget|curl|nc|bash|sh)\b",
    r"`[^`]+`",                       # Backtick execution
    r"\$\([^)]+\)",                   # $() subshell
    r"\b(rm|mv|cp|chmod|chown|kill)\s+-",
    r"\.\./\.\./",                    # Directory traversal
    r"/etc/(passwd|shadow|hosts|crontab)",
    r"&&\s*(rm|wget|curl|nc|bash)",
]

# ── SSRF patterns ─────────────────────────────────────────────────────────────
SSRF_PATTERNS = [
    r"(https?|ftp)://(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)",
    r"(https?|ftp)://10\.\d{1,3}\.\d{1,3}\.\d{1,3}",
    r"(https?|ftp)://172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}",
    r"(https?|ftp)://192\.168\.\d{1,3}\.\d{1,3}",
    r"(https?|ftp)://169\.254\.",     # Link-local (AWS metadata)
    r"file://",
    r"gopher://",
    r"dict://",
]

# ── Path traversal ────────────────────────────────────────────────────────────
PATH_TRAVERSAL = [
    r"\.\.[/\\]",
    r"%2e%2e[%2f%5c]",               # URL-encoded ../
    r"\.\.%2f",
    r"\.\.%5c",
]

# ── Compiled rule sets ────────────────────────────────────────────────────────
_COMPILED: dict[str, list] = {
    "sql_injection":     [re.compile(p, re.IGNORECASE) for p in SQL_PATTERNS],
    "xss":               [re.compile(p, re.IGNORECASE) for p in XSS_PATTERNS],
    "command_injection": [re.compile(p, re.IGNORECASE) for p in CMD_PATTERNS],
    "ssrf":              [re.compile(p, re.IGNORECASE) for p in SSRF_PATTERNS],
    "path_traversal":    [re.compile(p, re.IGNORECASE) for p in PATH_TRAVERSAL],
}

SEVERITY_MAP = {
    "sql_injection":     "Critical",
    "xss":               "High",
    "command_injection": "Critical",
    "ssrf":              "High",
    "path_traversal":    "High",
}


def check_payload(value: str) -> Tuple[bool, str, str]:
    """
    Scan a string value against all attack patterns.
    Returns (blocked, attack_type, severity).
    """
    if not isinstance(value, str):
        return False, "", ""

    for attack_type, patterns in _COMPILED.items():
        for pattern in patterns:
            if pattern.search(value):
                return True, attack_type, SEVERITY_MAP[attack_type]

    return False, "", ""


def scan_dict(data: dict, prefix: str = "") -> list[dict]:
    """
    Recursively scan a dict (request body/params) for attacks.
    Returns list of findings.
    """
    findings = []
    if not isinstance(data, dict):
        return findings

    for key, value in data.items():
        field = f"{prefix}.{key}" if prefix else key
        if isinstance(value, str):
            blocked, attack_type, severity = check_payload(value)
            if blocked:
                findings.append({
                    "field":       field,
                    "attack_type": attack_type,
                    "severity":    severity,
                    "snippet":     value[:120],
                })
        elif isinstance(value, dict):
            findings.extend(scan_dict(value, field))
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, str):
                    blocked, attack_type, severity = check_payload(item)
                    if blocked:
                        findings.append({
                            "field":       f"{field}[{i}]",
                            "attack_type": attack_type,
                            "severity":    severity,
                            "snippet":     item[:120],
                        })
                elif isinstance(item, dict):
                    findings.extend(scan_dict(item, f"{field}[{i}]"))

    return findings
