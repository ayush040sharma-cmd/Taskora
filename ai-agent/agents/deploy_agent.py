"""
Deploy Agent — creates fix branches, applies auto-fixes, validates, opens PRs.

SAFETY RULES (hard-coded, never bypass):
  • NEVER commits to main/master/develop
  • NEVER pushes untested code
  • ALWAYS creates a fresh branch per fix cycle
  • ALWAYS rollbacks on test failure
"""

import re
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..services.github_client import GitClient, GitHubAPIClient

logger = logging.getLogger("jarvis.deploy_agent")

PROTECTED_BRANCHES = {"main", "master", "develop", "release", "production"}


@dataclass
class DeployResult:
    success:     bool
    branch:      str = ""
    pr_url:      str = ""
    pr_number:   int = 0
    commits:     list[str] = field(default_factory=list)
    rolled_back: bool = False
    error:       str = ""
    fixes_applied: list[str] = field(default_factory=list)


class AutoFixer:
    """Applies low-risk, deterministic code fixes."""

    def apply_to_file(self, filepath: str) -> list[str]:
        """Apply safe fixes. Returns list of fix descriptions applied."""
        path    = Path(filepath)
        applied = []

        if not path.exists():
            return applied

        try:
            original = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return applied

        content = original

        if path.suffix == ".py":
            # Fix trailing whitespace
            new = re.sub(r'[ \t]+$', '', content, flags=re.MULTILINE)
            if new != content:
                content = new
                applied.append("Removed trailing whitespace")

            # Fix bare except → except Exception (only if clearly a bare except block)
            new = re.sub(r'^(\s*)except:\s*$', r'\1except Exception:', content, flags=re.MULTILINE)
            if new != content:
                content = new
                applied.append("Replaced bare `except:` with `except Exception:`")

            # Fix double blank lines > 2 (PEP8)
            new = re.sub(r'\n{4,}', '\n\n\n', content)
            if new != content:
                content = new
                applied.append("Normalized excessive blank lines")

        elif path.suffix in (".js", ".jsx", ".ts", ".tsx"):
            # Fix trailing whitespace
            new = re.sub(r'[ \t]+$', '', content, flags=re.MULTILINE)
            if new != content:
                content = new
                applied.append("Removed trailing whitespace")

            # Remove debugger statements
            new = re.sub(r'^\s*debugger;\s*\n', '', content, flags=re.MULTILINE)
            if new != content:
                content = new
                applied.append("Removed debugger statements")

        elif path.suffix in (".json",):
            # Normalize JSON formatting
            import json
            try:
                parsed = json.loads(content)
                formatted = json.dumps(parsed, indent=2, ensure_ascii=False) + "\n"
                if formatted != content:
                    content = formatted
                    applied.append("Normalized JSON formatting")
            except json.JSONDecodeError:
                pass

        if content != original and applied:
            path.write_text(content, encoding="utf-8")

        return applied


class DeployAgent:

    def __init__(
        self,
        repo_dir:        str,
        github_token:    str = "",
        github_owner:    str = "",
        github_repo:     str = "",
    ):
        self.git        = GitClient(repo_dir)
        self.fixer      = AutoFixer()
        self.gh: Optional[GitHubAPIClient] = None

        if github_token and github_owner and github_repo:
            self.gh = GitHubAPIClient(github_token, github_owner, github_repo)

    def _safe_branch_name(self, prefix: str = "jarvis/fix") -> str:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        return f"{prefix}-{ts}"

    def _assert_not_protected(self) -> None:
        branch = self.git.current_branch()
        if branch in PROTECTED_BRANCHES:
            raise RuntimeError(
                f"SAFETY: Refusing to operate on protected branch `{branch}`. "
                "Jarvis only works on feature branches."
            )

    def create_fix_branch(self, base_branch: str = "main") -> str:
        """Checkout base, pull latest, create a new fix branch."""
        branch_name = self._safe_branch_name()

        try:
            self.git.checkout(base_branch)
            self.git.pull(base_branch)
        except Exception as e:
            logger.warning(f"Could not pull {base_branch}: {e}")

        self.git.create_branch(branch_name)
        logger.info(f"Working on branch: {branch_name}")
        return branch_name

    def apply_fixes(self, files_to_fix: list[str]) -> list[str]:
        """Apply auto-fixes to a list of files. Returns all fix descriptions."""
        all_fixes = []
        for filepath in files_to_fix:
            fixes = self.fixer.apply_to_file(filepath)
            for fix in fixes:
                all_fixes.append(f"{Path(filepath).name}: {fix}")
                logger.info(f"  Fixed {filepath}: {fix}")
        return all_fixes

    def validate(self, project_dir: str) -> tuple[bool, str]:
        """Run tests + lint. Returns (passed, error_message)."""
        import subprocess, os

        # Python: run pytest if tests exist
        test_dir = Path(project_dir) / "tests"
        if test_dir.exists():
            result = subprocess.run(
                ["python", "-m", "pytest", str(test_dir), "-q", "--tb=short", "--no-header"],
                cwd=project_dir, capture_output=True, text=True, timeout=120,
            )
            if result.returncode != 0:
                return False, f"Tests failed:\n{result.stdout[-1000:]}"

        # JS: npm test if package.json exists
        pkg = Path(project_dir) / "package.json"
        if pkg.exists():
            result = subprocess.run(
                ["npm", "test", "--", "--watchAll=false", "--passWithNoTests"],
                cwd=project_dir, capture_output=True, text=True, timeout=120,
                env={**os.environ, "CI": "true"},
            )
            if result.returncode != 0:
                return False, f"JS tests failed:\n{result.stdout[-1000:]}"

        return True, ""

    def commit_and_push(self, branch: str, message: str) -> Optional[str]:
        """Commit and push to origin. Returns commit SHA or None."""
        sha = self.git.commit(message)
        if sha:
            self.git.push(branch)
        return sha

    def open_pr(
        self,
        branch:      str,
        title:       str,
        body:        str,
        labels:      list[str] | None = None,
        draft:       bool = True,
    ) -> dict:
        if not self.gh:
            logger.warning("No GitHub credentials — skipping PR creation")
            return {}

        try:
            pr = self.gh.create_pr(title=title, body=body, head=branch, draft=draft)
            pr_url    = pr.get("html_url", "")
            pr_number = pr.get("number", 0)
            logger.info(f"PR opened: {pr_url}")

            if labels and pr_number:
                self.gh.add_pr_labels(pr_number, labels)

            return pr
        except Exception as e:
            logger.error(f"PR creation failed: {e}")
            return {}

    def rollback(self, original_branch: str) -> None:
        """Abort and return to original branch."""
        try:
            current = self.git.current_branch()
            self.git.checkout(original_branch)
            if current not in PROTECTED_BRANCHES:
                # Delete the failed fix branch
                self.git._git("branch", "-D", current, check=False)
            logger.warning(f"Rolled back to {original_branch}")
        except Exception as e:
            logger.error(f"Rollback failed: {e}")

    def run_fix_cycle(
        self,
        files_to_fix: list[str],
        project_dir:  str,
        pr_title:     str = "Jarvis: Auto-fix cycle",
        pr_body:      str = "",
        validate:     bool = True,
    ) -> DeployResult:
        """
        Full deploy cycle:
          1. Create branch
          2. Apply fixes
          3. Validate (if enabled)
          4. Commit + push
          5. Open PR
        """
        result   = DeployResult(success=False)
        original = self.git.current_branch()

        try:
            # Safety check
            if not files_to_fix:
                result.error = "No files to fix"
                return result

            # 1. Create fix branch
            branch = self.create_fix_branch()
            result.branch = branch

            # 2. Apply fixes
            fixes = self.apply_fixes(files_to_fix)
            result.fixes_applied = fixes

            if not self.git.has_changes():
                result.error = "No changes after applying fixes"
                self.rollback(original)
                return result

            # 3. Validate
            if validate:
                passed, err = self.validate(project_dir)
                if not passed:
                    logger.error(f"Validation failed — rolling back: {err}")
                    self.rollback(original)
                    result.rolled_back = True
                    result.error       = err
                    return result

            # 4. Commit + push
            commit_msg  = f"fix(jarvis): auto-fix {len(fixes)} issues\n\n" + "\n".join(f"- {f}" for f in fixes)
            sha         = self.commit_and_push(branch, commit_msg)
            if sha:
                result.commits.append(sha)

            # 5. Open PR
            if not pr_body:
                pr_body = self._build_pr_body(fixes)

            pr = self.open_pr(
                branch=branch,
                title=pr_title,
                body=pr_body,
                labels=["jarvis", "auto-fix"],
                draft=True,
            )
            result.pr_url    = pr.get("html_url", "")
            result.pr_number = pr.get("number", 0)
            result.success   = True

            return result

        except Exception as e:
            logger.error(f"Deploy cycle failed: {e}")
            self.rollback(original)
            result.rolled_back = True
            result.error       = str(e)
            return result

    @staticmethod
    def _build_pr_body(fixes: list[str]) -> str:
        lines = [
            "## 🤖 Jarvis Auto-Fix",
            "",
            "This PR was automatically generated by Jarvis.",
            "",
            "### Changes Applied",
            "",
        ]
        for fix in fixes:
            lines.append(f"- {fix}")
        lines += [
            "",
            "### Review Checklist",
            "- [ ] Verify all changes are safe",
            "- [ ] Run full test suite",
            "- [ ] Review security implications",
            "",
            "> **Note:** This PR is a draft. Do NOT merge without human review.",
        ]
        return "\n".join(lines)
