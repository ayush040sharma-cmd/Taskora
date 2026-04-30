#!/usr/bin/env python3
"""
Taskora AI CLI — run audits, generate backlog, analyze code from the terminal.
Works standalone or via VS Code tasks.

Usage:
  python scripts/cli.py audit   --workspace-id 1 --token <jwt>
  python scripts/cli.py backlog --workspace-id 1 --token <jwt>
  python scripts/cli.py code    --file src/components/TaskCard.jsx --token <jwt>
  python scripts/cli.py chat    --workspace-id 1 --token <jwt>
"""
import typer
import httpx
import json
import sys
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.markdown import Markdown
from rich import print as rprint

app = typer.Typer(help="Taskora AI Agent CLI (Jarvis)")
console = Console()

AGENT_URL = "http://localhost:8000/api"
PRIORITY_COLORS = {
    "critical": "red",
    "high": "orange3",
    "medium": "yellow",
    "low": "green",
}


def _post(endpoint: str, payload: dict) -> dict:
    with httpx.Client(timeout=120) as client:
        r = client.post(f"{AGENT_URL}{endpoint}", json=payload)
        r.raise_for_status()
        return r.json()


@app.command()
def audit(
    workspace_id: int = typer.Option(..., "--workspace-id", "-w", help="Taskora workspace ID"),
    token: str = typer.Option(..., "--token", "-t", help="JWT auth token"),
    scope: str = typer.Option("full", "--scope", "-s", help="full | ux | security | performance"),
    output: str = typer.Option("table", "--output", "-o", help="table | json | markdown"),
):
    """Run a full AI audit of the workspace."""
    console.print(f"\n🔍 [bold blue]Running {scope} audit on workspace {workspace_id}...[/bold blue]\n")
    try:
        result = _post("/audit", {"workspace_id": workspace_id, "token": token, "scope": scope})
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

    if output == "json":
        print(json.dumps(result, indent=2))
        return

    # Summary panel
    score = result.get("score", 0)
    score_color = "green" if score >= 80 else "yellow" if score >= 60 else "red"
    console.print(Panel(
        f"[{score_color}]Health Score: {score}/100[/{score_color}]\n"
        f"Total Issues: {len(result.get('issues', []))}\n"
        f"Audit ID: {result.get('audit_id')}\n"
        f"Tool calls: {result.get('tool_calls_made', 0)}",
        title="🛡️ Audit Summary",
        border_style="blue",
    ))

    # Issues table
    issues = result.get("issues", [])
    if issues:
        table = Table(title="Issues Found", show_lines=True)
        table.add_column("#", width=4)
        table.add_column("Priority", width=10)
        table.add_column("Category", width=14)
        table.add_column("Title", width=40)
        table.add_column("Location", width=30)
        table.add_column("Fix", width=50)

        for i, issue in enumerate(issues, 1):
            p = issue.get("priority", "medium")
            color = PRIORITY_COLORS.get(p, "white")
            table.add_row(
                str(i),
                f"[{color}]{p}[/{color}]",
                issue.get("category", ""),
                issue.get("title", ""),
                issue.get("location", ""),
                issue.get("fix", "")[:60],
            )
        console.print(table)

    # Quick wins
    quick_wins = result.get("quick_wins", [])
    if quick_wins:
        console.print(Panel("\n".join(f"• {w}" for w in quick_wins), title="⚡ Quick Wins", border_style="green"))


@app.command()
def backlog(
    workspace_id: int = typer.Option(..., "--workspace-id", "-w"),
    token: str = typer.Option(..., "--token", "-t"),
    context: str = typer.Option(None, "--context", "-c", help="Additional context for backlog generation"),
    max_items: int = typer.Option(20, "--max-items", "-m"),
):
    """Generate a prioritized product backlog."""
    console.print(f"\n📋 [bold blue]Generating backlog for workspace {workspace_id}...[/bold blue]\n")
    try:
        result = _post("/generate-backlog", {
            "workspace_id": workspace_id, "token": token,
            "context": context, "max_items": max_items,
        })
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

    console.print(Panel(
        f"Items generated: {len(result.get('items', []))}\n"
        f"Total effort: {result.get('total_effort_hours')}h\n"
        f"Backlog ID: {result.get('backlog_id')}",
        title="📊 Backlog Summary",
        border_style="blue",
    ))

    table = Table(title="Generated Backlog", show_lines=True)
    table.add_column("ID", width=8)
    table.add_column("Type", width=12)
    table.add_column("Priority", width=10)
    table.add_column("Title", width=45)
    table.add_column("Effort", width=8)
    table.add_column("Column", width=12)
    table.add_column("Tags", width=25)

    for item in result.get("items", []):
        p = item.get("priority", "medium")
        color = PRIORITY_COLORS.get(p, "white")
        table.add_row(
            item.get("id", ""),
            item.get("type", ""),
            f"[{color}]{p}[/{color}]",
            item.get("title", ""),
            f"{item.get('effort_hours', 0)}h",
            item.get("column", ""),
            ", ".join(item.get("tags", [])),
        )
    console.print(table)


@app.command()
def code(
    file: str = typer.Option(..., "--file", "-f", help="File path to analyze"),
    token: str = typer.Option(..., "--token", "-t"),
    focus: str = typer.Option("all", "--focus", help="bugs | security | performance | all"),
):
    """Analyze source code for bugs, security issues, and quality."""
    console.print(f"\n🔬 [bold blue]Analyzing {file}...[/bold blue]\n")
    try:
        result = _post("/analyze-code", {"file_path": file, "token": token, "focus": focus})
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

    score = result.get("risk_score", 0)
    score_color = "green" if score <= 30 else "yellow" if score <= 60 else "red"
    console.print(Panel(
        f"Language: {result.get('language')}\n"
        f"[{score_color}]Risk Score: {score}/100[/{score_color}]\n"
        f"Issues: {len(result.get('issues', []))}\n\n"
        f"{result.get('summary', '')}",
        title=f"📄 {file}",
        border_style="blue",
    ))

    issues = result.get("issues", [])
    if issues:
        table = Table(title="Code Issues", show_lines=True)
        table.add_column("Line", width=6)
        table.add_column("Severity", width=10)
        table.add_column("Category", width=12)
        table.add_column("Description", width=50)
        table.add_column("Fix", width=40)
        for issue in issues:
            s = issue.get("severity", "medium")
            color = PRIORITY_COLORS.get(s, "white")
            table.add_row(
                str(issue.get("line") or "—"),
                f"[{color}]{s}[/{color}]",
                issue.get("category", ""),
                issue.get("description", ""),
                issue.get("suggestion", "")[:50],
            )
        console.print(table)

    test_cases = result.get("test_cases", [])
    if test_cases:
        console.print(Panel("\n".join(f"• {t}" for t in test_cases), title="🧪 Test Cases", border_style="green"))


@app.command()
def chat(
    workspace_id: int = typer.Option(None, "--workspace-id", "-w"),
    token: str = typer.Option(..., "--token", "-t"),
):
    """Interactive AI chat session (Jarvis mode)."""
    console.print(Panel(
        "Jarvis is ready. Type your question and press Enter.\nType 'exit' to quit.",
        title="🤖 Taskora Jarvis",
        border_style="blue",
    ))

    session_id = None
    while True:
        try:
            user_input = console.input("[bold cyan]You:[/bold cyan] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[yellow]Goodbye![/yellow]")
            break

        if user_input.lower() in ("exit", "quit", "q"):
            break
        if not user_input:
            continue

        with console.status("[bold green]Thinking...[/bold green]"):
            try:
                result = _post("/chat", {
                    "message": user_input,
                    "token": token,
                    "workspace_id": workspace_id,
                    "session_id": session_id,
                })
                session_id = result.get("session_id")
            except Exception as e:
                console.print(f"[red]Error: {e}[/red]")
                continue

        console.print(f"\n[bold green]Jarvis[/bold green] (tools: {result.get('tool_calls_made', 0)}):")
        console.print(Markdown(result.get("reply", "")))

        suggestions = result.get("follow_up_suggestions", [])
        if suggestions:
            console.print(f"\n[dim]Suggestions: {' | '.join(suggestions)}[/dim]")
        console.print()


if __name__ == "__main__":
    app()
