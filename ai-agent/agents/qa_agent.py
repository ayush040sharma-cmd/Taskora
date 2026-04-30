"""
QA Agent — runs tests, lint, and code-quality analysis.
Produces a structured QAReport.
"""

import os
import re
import ast
import json
import subprocess
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("jarvis.qa_agent")


@dataclass
class QAIssue:
    file:        str
    line:        int
    severity:    str       # Critical | High | Medium | Low | Info
    category:    str       # lint | dead_code | complexity | test_failure | performance
    rule:        str
    description: str
    fix:         str = ""


@dataclass
class TestResult:
    total:   int = 0
    passed:  int = 0
    failed:  int = 0
    errors:  int = 0
    skipped: int = 0
    duration_s: float = 0.0
    failures: list[dict] = field(default_factory=list)


@dataclass
class QAReport:
    scanned_at:   str
    target_dir:   str
    test_result:  TestResult = field(default_factory=TestResult)
    issues:       list[QAIssue] = field(default_factory=list)
    quality_score: int = 100   # starts at 100, deducted per issue
    dead_files:   list[str] = field(default_factory=list)

    def add(self, issue: QAIssue):
        self.issues.append(issue)
        deduction = {"Critical": 10, "High": 5, "Medium": 2, "Low": 1, "Info": 0}.get(issue.severity, 0)
        self.quality_score = max(0, self.quality_score - deduction)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["issues"] = [asdict(i) for i in self.issues]
        return d

    @property
    def issue_counts(self) -> dict:
        counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0}
        for i in self.issues:
            counts[i.severity] = counts.get(i.severity, 0) + 1
        return counts


# ── Python linter (AST-based, no external deps required) ─────────────────────
class PythonLinter:
    MAX_FUNCTION_LINES     = 60
    MAX_FUNCTION_ARGS      = 7
    MAX_FILE_LINES         = 500
    MAX_CYCLOMATIC         = 10
    MAX_NESTING_DEPTH      = 4

    def lint_file(self, filepath: str, report: QAReport) -> None:
        try:
            src = Path(filepath).read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(src, filename=filepath)
        except SyntaxError as e:
            report.add(QAIssue(
                file=filepath, line=e.lineno or 0,
                severity="High", category="syntax",
                rule="syntax_error",
                description=f"Syntax error: {e.msg}",
                fix="Fix the syntax error before deployment.",
            ))
            return

        lines = src.splitlines()
        if len(lines) > self.MAX_FILE_LINES:
            report.add(QAIssue(
                file=filepath, line=1,
                severity="Low", category="complexity",
                rule="file_too_long",
                description=f"File has {len(lines)} lines (max {self.MAX_FILE_LINES}).",
                fix="Split into smaller modules.",
            ))

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self._check_function(node, filepath, lines, report)
            elif isinstance(node, ast.ClassDef):
                self._check_class(node, filepath, report)

        # Check for bare excepts
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                ln = lines[node.lineno - 1].strip() if node.lineno <= len(lines) else ""
                report.add(QAIssue(
                    file=filepath, line=node.lineno,
                    severity="Medium", category="lint",
                    rule="bare_except",
                    description="Bare `except:` catches all exceptions including SystemExit and KeyboardInterrupt.",
                    fix="Specify exception types: `except (ValueError, TypeError):`",
                ))

        # TODO comments
        for i, line in enumerate(lines, 1):
            if re.search(r"\b(TODO|FIXME|HACK|XXX)\b", line):
                report.add(QAIssue(
                    file=filepath, line=i,
                    severity="Info", category="technical_debt",
                    rule="todo_comment",
                    description=f"TODO/FIXME found: {line.strip()[:80]}",
                    fix="Address the issue and remove the TODO comment.",
                ))

    def _check_function(self, node, filepath, lines, report):
        # Function length
        func_lines = (node.end_lineno or node.lineno) - node.lineno
        if func_lines > self.MAX_FUNCTION_LINES:
            report.add(QAIssue(
                file=filepath, line=node.lineno,
                severity="Medium", category="complexity",
                rule="function_too_long",
                description=f"Function `{node.name}` is {func_lines} lines (max {self.MAX_FUNCTION_LINES}).",
                fix=f"Break `{node.name}` into smaller functions.",
            ))

        # Too many arguments
        num_args = len(node.args.args)
        if num_args > self.MAX_FUNCTION_ARGS:
            report.add(QAIssue(
                file=filepath, line=node.lineno,
                severity="Low", category="complexity",
                rule="too_many_args",
                description=f"Function `{node.name}` has {num_args} arguments (max {self.MAX_FUNCTION_ARGS}).",
                fix="Consolidate arguments into a dataclass or config object.",
            ))

        # Missing return type annotation on public functions
        if not node.name.startswith("_") and node.returns is None:
            report.add(QAIssue(
                file=filepath, line=node.lineno,
                severity="Info", category="lint",
                rule="missing_return_annotation",
                description=f"Function `{node.name}` is missing a return type annotation.",
                fix=f"Add return type: `def {node.name}(...) -> ReturnType:`",
            ))

        # Mutable default arguments
        for default in node.args.defaults:
            if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                report.add(QAIssue(
                    file=filepath, line=node.lineno,
                    severity="High", category="bug",
                    rule="mutable_default_arg",
                    description=f"Mutable default argument in `{node.name}`. Shared across all calls.",
                    fix="Use `None` as default and initialize inside the function body.",
                ))

    def _check_class(self, node, filepath, report):
        method_count = sum(1 for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
        if method_count > 20:
            report.add(QAIssue(
                file=filepath, line=node.lineno,
                severity="Low", category="complexity",
                rule="class_too_large",
                description=f"Class `{node.name}` has {method_count} methods.",
                fix="Split responsibilities into multiple focused classes (SRP).",
            ))


# ── JS/TS linter ──────────────────────────────────────────────────────────────
class JSLinter:
    RULES = [
        (r"\bconsole\.(log|debug|info)\b", "Info", "debug_statement", "Remove console.log before production.", "debug"),
        (r"\bdebugger\b", "High", "debugger_statement", "Remove debugger statement.", "debug"),
        (r"var\s+\w", "Low", "var_usage", "Use `const` or `let` instead of `var`.", "lint"),
        (r"==(?!=)", "Low", "loose_equality", "Use `===` instead of `==` for strict equality.", "lint"),
        (r"any\b", "Low", "typescript_any", "Avoid `any` type in TypeScript. Use proper types.", "lint"),
        (r"TODO|FIXME|HACK", "Info", "todo_comment", "Address TODO/FIXME comments.", "technical_debt"),
        (r"setTimeout\s*\(\s*['\"]", "High", "eval_in_timeout", "String passed to setTimeout is eval'd. Pass a function.", "bug"),
    ]

    def lint_file(self, filepath: str, report: QAReport) -> None:
        try:
            src = Path(filepath).read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return

        for i, line in enumerate(src.splitlines(), 1):
            stripped = line.strip()
            if not stripped or stripped.startswith("//") or stripped.startswith("*"):
                continue
            for pattern, severity, rule, fix, category in self.RULES:
                if re.search(pattern, line):
                    report.add(QAIssue(
                        file=filepath, line=i,
                        severity=severity, category=category,
                        rule=rule,
                        description=f"Rule `{rule}`: {line.strip()[:80]}",
                        fix=fix,
                    ))
                    break


# ── Test runner ───────────────────────────────────────────────────────────────
class TestRunner:
    def run_pytest(self, project_dir: str) -> TestResult:
        result = TestResult()
        try:
            proc = subprocess.run(
                ["python", "-m", "pytest", "--tb=short", "--json-report",
                 "--json-report-file=/tmp/jarvis_pytest.json", "-q"],
                cwd=project_dir, capture_output=True, text=True, timeout=120,
            )
            # Parse JSON report
            report_path = Path("/tmp/jarvis_pytest.json")
            if report_path.exists():
                data = json.loads(report_path.read_text())
                summary = data.get("summary", {})
                result.total   = summary.get("total", 0)
                result.passed  = summary.get("passed", 0)
                result.failed  = summary.get("failed", 0)
                result.errors  = summary.get("error", 0)
                result.skipped = summary.get("skipped", 0)
                result.duration_s = data.get("duration", 0.0)
                for test in data.get("tests", []):
                    if test.get("outcome") in ("failed", "error"):
                        result.failures.append({
                            "name":    test.get("nodeid", ""),
                            "message": test.get("call", {}).get("longrepr", "")[:500],
                        })
            else:
                # Parse stdout fallback
                m = re.search(r"(\d+) passed", proc.stdout)
                if m: result.passed = int(m.group(1))
                m = re.search(r"(\d+) failed", proc.stdout)
                if m: result.failed = int(m.group(1))
                result.total = result.passed + result.failed
        except FileNotFoundError:
            logger.warning("pytest not installed — skipping test run")
        except subprocess.TimeoutExpired:
            logger.warning("pytest timed out after 120s")
        except Exception as e:
            logger.error(f"Test runner error: {e}")
        return result

    def run_npm_test(self, project_dir: str) -> TestResult:
        result = TestResult()
        pkg = Path(project_dir) / "package.json"
        if not pkg.exists():
            return result
        try:
            proc = subprocess.run(
                ["npm", "test", "--", "--watchAll=false", "--json"],
                cwd=project_dir, capture_output=True, text=True, timeout=120,
                env={**os.environ, "CI": "true"},
            )
            # Jest outputs JSON to stdout
            match = re.search(r'({.*"numTotalTests".*})', proc.stdout, re.DOTALL)
            if match:
                data = json.loads(match.group(1))
                result.total   = data.get("numTotalTests", 0)
                result.passed  = data.get("numPassedTests", 0)
                result.failed  = data.get("numFailedTests", 0)
                result.duration_s = data.get("startTime", 0)
        except Exception as e:
            logger.warning(f"npm test failed: {e}")
        return result


# ── Dead code detector ────────────────────────────────────────────────────────
class DeadCodeDetector:
    def find_unused_exports(self, frontend_dir: str) -> list[str]:
        """Find JS/TS files that are never imported anywhere."""
        if not Path(frontend_dir).exists():
            return []

        all_files   = set()
        imported    = set()
        skip_dirs   = {"node_modules", ".git", "dist", "build"}

        for root, dirs, files in os.walk(frontend_dir):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for f in files:
                if Path(f).suffix in (".js", ".jsx", ".ts", ".tsx"):
                    rel = os.path.relpath(os.path.join(root, f), frontend_dir)
                    all_files.add(rel)

        for root, dirs, files in os.walk(frontend_dir):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for f in files:
                if Path(f).suffix in (".js", ".jsx", ".ts", ".tsx"):
                    try:
                        src = Path(os.path.join(root, f)).read_text(errors="ignore")
                        for match in re.finditer(r"(?:import|require)[^'\"]*['\"]([./][^'\"]+)['\"]", src):
                            imported.add(match.group(1))
                    except Exception:
                        pass

        # Normalize and find files with no imports
        potentially_dead = []
        for f in all_files:
            stem = re.sub(r'\.(js|jsx|ts|tsx)$', '', f)
            if not any(stem in imp or f in imp for imp in imported):
                if "index" not in f and "App" not in f and "main" not in f:
                    potentially_dead.append(f)

        return potentially_dead[:20]  # Cap at 20


# ── QA Agent ──────────────────────────────────────────────────────────────────
class QAAgent:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.py_linter    = PythonLinter()
        self.js_linter    = JSLinter()
        self.test_runner  = TestRunner()
        self.dead_code    = DeadCodeDetector()

    def run(self) -> QAReport:
        report = QAReport(
            scanned_at=datetime.now(timezone.utc).isoformat(),
            target_dir=str(self.project_root),
        )

        skip_dirs = {".git", "node_modules", "__pycache__", ".venv", "dist", "build"}

        for root, dirs, files in os.walk(self.project_root):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for fname in files:
                filepath = os.path.join(root, fname)
                ext = Path(fname).suffix.lower()
                if ext == ".py":
                    self.py_linter.lint_file(filepath, report)
                elif ext in (".js", ".jsx", ".ts", ".tsx"):
                    self.js_linter.lint_file(filepath, report)

        # Run Python tests from ai-agent dir
        agent_dir = self.project_root / "ai-agent"
        if agent_dir.exists():
            report.test_result = self.test_runner.run_pytest(str(agent_dir))

        # Dead code detection
        frontend_dir = self.project_root / "frontend" / "src"
        if frontend_dir.exists():
            report.dead_files = self.dead_code.find_unused_exports(str(frontend_dir))

        counts = report.issue_counts
        logger.info(
            f"QA scan complete: quality_score={report.quality_score} "
            f"critical={counts['Critical']} high={counts['High']} "
            f"medium={counts['Medium']} low={counts['Low']} "
            f"tests={report.test_result.passed}/{report.test_result.total} passed"
        )
        return report
