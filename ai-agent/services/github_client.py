"""
GitHub integration — branch management, PR creation, status checks.
Uses raw git subprocess + GitHub REST API (no PyGitHub dependency needed).
"""

import os
import json
import logging
import subprocess
from pathlib import Path
from typing import Optional
import httpx

logger = logging.getLogger("jarvis.github")


class GitClient:
    """Local git operations via subprocess."""

    def __init__(self, repo_dir: str):
        self.repo_dir = Path(repo_dir)

    def _git(self, *args, check: bool = True) -> subprocess.CompletedProcess:
        result = subprocess.run(
            ["git", *args],
            cwd=self.repo_dir,
            capture_output=True,
            text=True,
        )
        if check and result.returncode != 0:
            raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
        return result

    def current_branch(self) -> str:
        return self._git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()

    def status(self) -> str:
        return self._git("status", "--short").stdout.strip()

    def has_changes(self) -> bool:
        return bool(self.status())

    def create_branch(self, name: str) -> None:
        self._git("checkout", "-b", name)
        logger.info(f"Created branch: {name}")

    def checkout(self, branch: str) -> None:
        self._git("checkout", branch)

    def add_all(self) -> None:
        self._git("add", "-A")

    def commit(self, message: str) -> Optional[str]:
        if not self.has_changes():
            logger.info("Nothing to commit")
            return None
        self._git("add", "-A")
        self._git("commit", "-m", message)
        sha = self._git("rev-parse", "HEAD").stdout.strip()
        logger.info(f"Committed: {sha[:8]} — {message}")
        return sha

    def push(self, branch: str, remote: str = "origin") -> None:
        self._git("push", remote, branch, "--set-upstream")
        logger.info(f"Pushed {branch} to {remote}")

    def pull(self, branch: str = "main") -> None:
        self._git("pull", "origin", branch)

    def diff(self, base: str = "main") -> str:
        result = self._git("diff", f"{base}...HEAD", "--stat", check=False)
        return result.stdout.strip()

    def log_since(self, base: str = "main") -> list[str]:
        result = self._git("log", f"{base}...HEAD", "--oneline", check=False)
        return result.stdout.strip().splitlines()

    def stash(self) -> None:
        self._git("stash", check=False)

    def stash_pop(self) -> None:
        self._git("stash", "pop", check=False)


class GitHubAPIClient:
    """GitHub REST API v3 client."""

    BASE = "https://api.github.com"

    def __init__(self, token: str, owner: str, repo: str):
        self.token = token
        self.owner = owner
        self.repo  = repo
        self._headers = {
            "Authorization": f"token {token}",
            "Accept":        "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def create_pr(
        self,
        title:  str,
        body:   str,
        head:   str,
        base:   str = "main",
        draft:  bool = True,
    ) -> dict:
        url = f"{self.BASE}/repos/{self.owner}/{self.repo}/pulls"
        payload = {
            "title": title,
            "body":  body,
            "head":  head,
            "base":  base,
            "draft": draft,
        }
        with httpx.Client(timeout=30) as client:
            r = client.post(url, json=payload, headers=self._headers)
            if r.status_code not in (200, 201):
                raise RuntimeError(f"GitHub PR creation failed {r.status_code}: {r.text[:300]}")
            return r.json()

    def add_pr_labels(self, pr_number: int, labels: list[str]) -> None:
        url = f"{self.BASE}/repos/{self.owner}/{self.repo}/issues/{pr_number}/labels"
        with httpx.Client(timeout=30) as client:
            client.post(url, json={"labels": labels}, headers=self._headers)

    def get_pr(self, pr_number: int) -> dict:
        url = f"{self.BASE}/repos/{self.owner}/{self.repo}/pulls/{pr_number}"
        with httpx.Client(timeout=30) as client:
            r = client.get(url, headers=self._headers)
            return r.json()

    def create_issue(self, title: str, body: str, labels: list[str] | None = None) -> dict:
        url = f"{self.BASE}/repos/{self.owner}/{self.repo}/issues"
        payload = {"title": title, "body": body}
        if labels:
            payload["labels"] = labels
        with httpx.Client(timeout=30) as client:
            r = client.post(url, json=payload, headers=self._headers)
            if r.status_code not in (200, 201):
                raise RuntimeError(f"GitHub issue creation failed {r.status_code}: {r.text[:300]}")
            return r.json()

    def list_open_prs(self, head_prefix: str = "jarvis/") -> list[dict]:
        url = f"{self.BASE}/repos/{self.owner}/{self.repo}/pulls?state=open&per_page=100"
        with httpx.Client(timeout=30) as client:
            r = client.get(url, headers=self._headers)
            return [p for p in r.json() if p.get("head", {}).get("ref", "").startswith(head_prefix)]
