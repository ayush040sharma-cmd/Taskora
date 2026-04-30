"""
Security Agent — Static code analysis + dependency vulnerability scanning.
Produces a structured VulnerabilityReport.
"""

import ast
import os
import re
import json
import subprocess
import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger("jarvis.security_agent")

# ── Data models ───────────────────────────────────────────────────────────────
@dataclass
class Vulnerability:
    file:       str
    line:       int
    severity:   str          # Critical | High | Medium | Low
    category:   str
    description: str
    fix:        str
    snippet:    str = ""
    cwe:        str = ""


@dataclass
class VulnerabilityReport:
    scanned_at:      str
    target_dir:      str
    total_files:     int = 0
    critical_count:  int = 0
    high_count:      int = 0
    medium_count:    int = 0
    low_count:       int = 0
    vulnerabilities: list[Vulnerability] = field(default_factory=list)
    dep_audit:       list[dict] = field(default_factory=list)
    risk_score:      int = 0  # 0-100

    def add(self, v: Vulnerability):
        self.vulnerabilities.append(v)
        if v.severity == "Critical": self.critical_count += 1
        elif v.severity == "High":   self.high_count += 1
        elif v.severity == "Medium": self.medium_count += 1
        else:                        self.low_count += 1

    def to_dict(self) -> dict:
        d = asdict(self)
        d["vulnerabilities"] = [asdict(v) for v in self.vulnerabilities]
        return d

    def compute_risk_score(self):
        """0-100 risk score weighted by severity."""
        score = min(100, self.critical_count * 25 + self.high_count * 10 +
                    self.medium_count * 3 + self.low_count * 1)
        self.risk_score = score


# ── AST-based Python scanner ──────────────────────────────────────────────────
class PythonASTScanner:
    DANGEROUS_FUNCTIONS = {
        "eval":            ("Critical", "Code Injection", "Arbitrary code execution via eval(). Replace with ast.literal_eval() or safe alternatives.", "CWE-94"),
        "exec":            ("Critical", "Code Injection", "Arbitrary code execution via exec(). Avoid dynamic code execution.", "CWE-94"),
        "compile":         ("High",     "Code Injection", "Dynamic code compilation can lead to injection. Validate inputs strictly.", "CWE-94"),
        "os.system":       ("Critical", "Command Injection", "Use subprocess.run() with a list argument and shell=False instead.", "CWE-78"),
        "subprocess.call": ("High",     "Command Injection", "Use shell=False and pass args as a list, not a string.", "CWE-78"),
        "subprocess.Popen": ("High",    "Command Injection", "Ensure shell=False and arguments are a list, not a string.", "CWE-78"),
        "pickle.loads":    ("Critical", "Deserialization", "Deserializing untrusted data with pickle allows arbitrary code execution. Use JSON.", "CWE-502"),
        "pickle.load":     ("Critical", "Deserialization", "Same as pickle.loads. Use JSON or signed data.", "CWE-502"),
        "yaml.load":       ("High",     "Deserialization", "Use yaml.safe_load() instead to prevent arbitrary code execution.", "CWE-502"),
        "marshal.loads":   ("Critical", "Deserialization", "Avoid marshal for untrusted data. Use JSON.", "CWE-502"),
        "hashlib.md5":     ("Medium",   "Weak Cryptography", "MD5 is cryptographically broken. Use SHA-256 or better.", "CWE-327"),
        "hashlib.sha1":    ("Medium",   "Weak Cryptography", "SHA-1 is deprecated. Use SHA-256 or better.", "CWE-327"),
        "random.random":   ("Low",      "Weak Randomness", "For security use secrets.token_bytes() or os.urandom().", "CWE-338"),
        "random.randint":  ("Low",      "Weak Randomness", "For security use secrets.randbelow() or os.urandom().", "CWE-338"),
        "tempfile.mktemp": ("Medium",   "Race Condition", "mktemp is insecure. Use tempfile.mkstemp() instead.", "CWE-377"),
    }

    DANGEROUS_IMPORTS = {
        "telnetlib":  ("High",   "Insecure Protocol", "telnetlib uses unencrypted Telnet. Use SSH/paramiko instead.", "CWE-319"),
        "ftplib":     ("Medium", "Insecure Protocol", "FTP sends credentials in plaintext. Use SFTP/FTPS.", "CWE-319"),
        "ssl":        ("Low",    "TLS Config", "Ensure SSL/TLS version and certificate validation are configured correctly.", "CWE-326"),
    }

    def scan_file(self, filepath: str, report: VulnerabilityReport) -> None:
        try:
            src = Path(filepath).read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(src, filename=filepath)
        except SyntaxError:
            return

        lines = src.splitlines()

        for node in ast.walk(tree):
            # Check function calls
            if isinstance(node, ast.Call):
                fname = self._func_name(node.func)
                if fname in self.DANGEROUS_FUNCTIONS:
                    severity, category, fix, cwe = self.DANGEROUS_FUNCTIONS[fname]
                    snippet = lines[node.lineno - 1].strip() if node.lineno <= len(lines) else ""
                    report.add(Vulnerability(
                        file=filepath, line=node.lineno, severity=severity,
                        category=category,
                        description=f"Dangerous function `{fname}` used.",
                        fix=fix, snippet=snippet, cwe=cwe,
                    ))

            # Check imports
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                module = ""
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        module = alias.name.split(".")[0]
                        if module in self.DANGEROUS_IMPORTS:
                            severity, cat, fix, cwe = self.DANGEROUS_IMPORTS[module]
                            report.add(Vulnerability(
                                file=filepath, line=node.lineno, severity=severity,
                                category=cat,
                                description=f"Import of insecure module `{module}`.",
                                fix=fix, cwe=cwe,
                            ))
                else:
                    module = (node.module or "").split(".")[0]
                    if module in self.DANGEROUS_IMPORTS:
                        severity, cat, fix, cwe = self.DANGEROUS_IMPORTS[module]
                        report.add(Vulnerability(
                            file=filepath, line=node.lineno, severity=severity,
                            category=cat,
                            description=f"Import of insecure module `{module}`.",
                            fix=fix, cwe=cwe,
                        ))

            # Detect hardcoded secrets
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        name_lower = target.id.lower()
                        if any(kw in name_lower for kw in ("password", "secret", "api_key", "token", "private_key")):
                            if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                                val = node.value.value
                                if len(val) > 4 and val not in ("", "changeme", "your_key_here"):
                                    snippet = lines[node.lineno - 1].strip() if node.lineno <= len(lines) else ""
                                    report.add(Vulnerability(
                                        file=filepath, line=node.lineno,
                                        severity="Critical",
                                        category="Hardcoded Secret",
                                        description=f"Hardcoded secret in variable `{target.id}`.",
                                        fix="Move secrets to environment variables or a secrets manager. Never commit credentials.",
                                        snippet=snippet[:80] + "...",
                                        cwe="CWE-798",
                                    ))

    @staticmethod
    def _func_name(node) -> str:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parent = PythonASTScanner._func_name(node.value)
            return f"{parent}.{node.attr}" if parent else node.attr
        return ""


# ── Regex-based scanner (JS/TS files) ────────────────────────────────────────
class JSScanner:
    PATTERNS = [
        (r"eval\s*\(", "Critical", "Code Injection", "Avoid eval(). Use JSON.parse() or safer alternatives.", "CWE-94"),
        (r"innerHTML\s*=", "High", "XSS", "innerHTML allows XSS. Use textContent or DOMPurify.", "CWE-79"),
        (r"document\.write\s*\(", "High", "XSS", "document.write allows XSS. Build DOM elements instead.", "CWE-79"),
        (r"(localStorage|sessionStorage)\.setItem\s*\([^,]+password", "High", "Insecure Storage", "Never store passwords in Web Storage.", "CWE-312"),
        (r"https?://[^\"']+api[_-]?key[^\"']*=\s*[\"'][a-zA-Z0-9]{16,}", "Critical", "Hardcoded API Key", "API key hardcoded in source. Use environment variables.", "CWE-798"),
        (r"console\.log\s*\(.*password", "Medium", "Sensitive Data Exposure", "Logging passwords. Remove debug statements from production.", "CWE-532"),
        (r"http://(?!localhost)[a-zA-Z]", "Medium", "Insecure Transport", "Non-TLS HTTP used. Use HTTPS in production.", "CWE-319"),
        (r"dangerouslySetInnerHTML", "High", "XSS", "dangerouslySetInnerHTML bypasses React XSS protection. Sanitize content.", "CWE-79"),
    ]

    def scan_file(self, filepath: str, report: VulnerabilityReport) -> None:
        try:
            src = Path(filepath).read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return

        for i, line in enumerate(src.splitlines(), 1):
            for pattern, severity, category, fix, cwe in self.PATTERNS:
                if re.search(pattern, line, re.IGNORECASE):
                    report.add(Vulnerability(
                        file=filepath, line=i, severity=severity,
                        category=category,
                        description=f"Pattern `{pattern}` matched.",
                        fix=fix, snippet=line.strip()[:120], cwe=cwe,
                    ))
                    break  # One finding per line


# ── Dependency scanner ────────────────────────────────────────────────────────
class DependencyScanner:
    def scan_npm(self, project_dir: str) -> list[dict]:
        pkg = Path(project_dir) / "package.json"
        if not pkg.exists():
            return []
        try:
            result = subprocess.run(
                ["npm", "audit", "--json"],
                cwd=project_dir, capture_output=True, text=True, timeout=60,
            )
            data = json.loads(result.stdout or "{}")
            vulns = []
            for adv in (data.get("advisories") or {}).values():
                vulns.append({
                    "package":  adv.get("module_name", ""),
                    "severity": adv.get("severity", "").capitalize(),
                    "title":    adv.get("title", ""),
                    "url":      adv.get("url", ""),
                    "fix":      adv.get("recommendation", "Run npm audit fix"),
                })
            return vulns
        except Exception as e:
            logger.warning(f"npm audit failed: {e}")
            return []

    def scan_pip(self, project_dir: str) -> list[dict]:
        req_file = Path(project_dir) / "requirements.txt"
        if not req_file.exists():
            return []
        try:
            result = subprocess.run(
                ["pip", "index", "versions", "--no-index"],
                capture_output=True, text=True, timeout=30,
            )
            # Try pip-audit if available
            audit = subprocess.run(
                ["pip-audit", "--format", "json", "-r", str(req_file)],
                capture_output=True, text=True, timeout=120,
            )
            if audit.returncode == 0:
                data = json.loads(audit.stdout or "[]")
                return [
                    {
                        "package":  d.get("name", ""),
                        "version":  d.get("version", ""),
                        "severity": "High",
                        "title":    v.get("description", ""),
                        "url":      v.get("fix_versions", []),
                        "fix":      f"Upgrade to {v.get('fix_versions', ['latest'])[0] if v.get('fix_versions') else 'latest'}",
                    }
                    for d in data
                    for v in d.get("vulns", [])
                ]
        except Exception as e:
            logger.warning(f"pip-audit failed (not installed?): {e}")
        return []


# ── Security Agent ────────────────────────────────────────────────────────────
class SecurityAgent:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.py_scanner   = PythonASTScanner()
        self.js_scanner   = JSScanner()
        self.dep_scanner  = DependencyScanner()

    def run(self) -> VulnerabilityReport:
        report = VulnerabilityReport(
            scanned_at=datetime.now(timezone.utc).isoformat(),
            target_dir=str(self.project_root),
        )

        skip_dirs = {".git", "node_modules", "__pycache__", ".venv", "dist", "build", ".next"}
        file_count = 0

        for root, dirs, files in os.walk(self.project_root):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for fname in files:
                filepath = os.path.join(root, fname)
                ext = Path(fname).suffix.lower()
                if ext == ".py":
                    self.py_scanner.scan_file(filepath, report)
                    file_count += 1
                elif ext in (".js", ".jsx", ".ts", ".tsx"):
                    self.js_scanner.scan_file(filepath, report)
                    file_count += 1

        report.total_files = file_count

        # Dependency audits
        frontend_dir = self.project_root / "frontend"
        backend_dir  = self.project_root / "backend"
        agent_dir    = self.project_root / "ai-agent"

        for d in [frontend_dir, backend_dir, self.project_root]:
            report.dep_audit.extend(self.dep_scanner.scan_npm(str(d)))

        report.dep_audit.extend(self.dep_scanner.scan_pip(str(agent_dir)))

        report.compute_risk_score()

        logger.info(
            f"Security scan complete: {file_count} files, "
            f"critical={report.critical_count} high={report.high_count} "
            f"medium={report.medium_count} low={report.low_count} "
            f"risk_score={report.risk_score}"
        )
        return report
