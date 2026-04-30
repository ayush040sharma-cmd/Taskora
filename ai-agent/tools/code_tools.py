"""
Code analysis tools — reads source files and generates test cases.
"""
import os
import re
from pathlib import Path
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

FRONTEND_ROOT = Path(__file__).parent.parent.parent / "frontend" / "src"
BACKEND_ROOT  = Path(__file__).parent.parent.parent / "backend"

MAX_FILE_CHARS = 12_000  # Stay within Claude context window


def _resolve_path(file_path: str) -> Optional[Path]:
    """Resolve a file path relative to the project root or absolute."""
    p = Path(file_path)
    if p.is_absolute() and p.exists():
        return p
    for root in [FRONTEND_ROOT, BACKEND_ROOT, Path(file_path).parent]:
        candidate = root / p
        if candidate.exists():
            return candidate
    return None


async def read_source_file(file_path: str) -> Dict:
    """Read a source file and return its content with metadata."""
    resolved = _resolve_path(file_path)
    if not resolved:
        return {"error": f"File not found: {file_path}"}
    try:
        content = resolved.read_text(encoding="utf-8", errors="replace")
        if len(content) > MAX_FILE_CHARS:
            content = content[:MAX_FILE_CHARS] + "\n\n... [truncated]"
        ext = resolved.suffix.lower()
        lang = {".js": "javascript", ".jsx": "javascript",
                ".ts": "typescript", ".tsx": "typescript",
                ".py": "python", ".sql": "sql",
                ".css": "css", ".json": "json"}.get(ext, "text")
        lines = content.count("\n") + 1
        return {
            "path": str(resolved),
            "language": lang,
            "lines": lines,
            "content": content,
        }
    except Exception as e:
        return {"error": str(e)}


async def list_project_files(directory: str = None, extension: str = None) -> Dict:
    """List files in the project with optional extension filter."""
    root = Path(directory) if directory else FRONTEND_ROOT.parent.parent
    try:
        files = []
        for f in root.rglob("*"):
            if f.is_file() and "node_modules" not in str(f) and "__pycache__" not in str(f):
                if extension is None or f.suffix == extension:
                    files.append(str(f.relative_to(root)))
        return {"files": files[:200], "total": len(files)}
    except Exception as e:
        return {"error": str(e)}


async def scan_for_patterns(pattern: str, directory: str = None, extension: str = None) -> Dict:
    """Search for a regex pattern across source files."""
    root = Path(directory) if directory else FRONTEND_ROOT.parent.parent
    results = []
    try:
        regex = re.compile(pattern)
        for f in root.rglob("*"):
            if not f.is_file():
                continue
            if "node_modules" in str(f) or "__pycache__" in str(f):
                continue
            if extension and f.suffix != extension:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
                for i, line in enumerate(text.splitlines(), 1):
                    if regex.search(line):
                        results.append({
                            "file": str(f.relative_to(root)),
                            "line": i,
                            "match": line.strip()
                        })
                        if len(results) >= 100:
                            break
            except Exception:
                pass
        return {"matches": results, "total": len(results)}
    except re.error as e:
        return {"error": f"Invalid regex: {e}"}


async def generate_test_cases(file_path: str, function_name: str = None) -> Dict:
    """
    Returns structured test case templates for a given file.
    Claude will use this tool input + the file content to generate actual test code.
    """
    file_data = await read_source_file(file_path)
    if "error" in file_data:
        return file_data

    lang = file_data["language"]
    framework = "jest" if lang in ("javascript", "typescript") else "pytest"
    return {
        "file": file_path,
        "language": lang,
        "test_framework": framework,
        "function_focus": function_name,
        "source_snippet": file_data["content"][:3000],
        "instruction": "Generate unit tests covering happy path, edge cases, and error conditions.",
    }
