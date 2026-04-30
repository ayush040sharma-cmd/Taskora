"""
Claude API client with agentic tool-calling loop.
Supports multi-turn tool use: Claude calls tools, gets results, reasons, calls more tools,
until it decides to stop and return a final answer.
"""
import anthropic
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from config import settings
from services.tool_registry import TOOL_DEFINITIONS, dispatch_tool
from services.taskora_client import TaskoraClient

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


SYSTEM_PROMPT = """You are Jarvis — the AI assistant for Taskora, a production SaaS task management platform.

You have access to tools that let you:
- Read and create tasks in Taskora
- Analyze source code for bugs and quality issues
- Audit workspace health, workload, and team capacity
- Read audit logs and detect anomalies
- Generate backlog items and test cases

## Your behavior rules:
1. Always use tools to gather real data before drawing conclusions
2. Be specific — name files, task IDs, and line numbers when relevant
3. Think step by step before acting
4. When auditing: collect_workspace_snapshot first, then collect_ux_signals, then synthesize
5. When generating backlog: fetch tasks first, then create structured items
6. Format your final response in clean markdown
7. If a tool call fails, explain the limitation and continue with available data
8. Never fabricate data — if you don't have it, say so

## Response format for audits:
Use structured markdown with emoji severity indicators:
🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
"""


async def run_agent(
    messages: List[Dict],
    token: str,
    workspace_id: Optional[int] = None,
    max_iterations: int = None,
) -> Tuple[str, int, List[str]]:
    """
    Run the agentic tool-calling loop.
    Returns: (final_text, tool_call_count, list_of_actions_taken)
    """
    max_iter = max_iterations or settings.max_tool_iterations
    taskora = TaskoraClient(token)
    tool_call_count = 0
    actions_taken = []
    current_messages = list(messages)

    for iteration in range(max_iter):
        logger.info(f"Agent iteration {iteration + 1}/{max_iter}")

        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=8096,
            system=SYSTEM_PROMPT,
            tools=TOOL_DEFINITIONS,
            messages=current_messages,
        )

        # If Claude wants to use tools
        if response.stop_reason == "tool_use":
            # Append Claude's response to conversation
            current_messages.append({
                "role": "assistant",
                "content": response.content
            })

            # Process all tool calls in this response
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                tool_call_count += 1
                tool_name = block.name
                tool_input = block.input
                logger.info(f"Tool call: {tool_name}({json.dumps(tool_input)[:200]})")

                result = await dispatch_tool(tool_name, tool_input, taskora)
                action_desc = f"{tool_name}({', '.join(f'{k}={v}' for k, v in tool_input.items() if k != 'token')})"
                actions_taken.append(action_desc)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str),
                })

            # Add all tool results as a user message
            current_messages.append({
                "role": "user",
                "content": tool_results
            })

        elif response.stop_reason == "end_turn":
            # Claude is done — extract final text
            final_text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    final_text += block.text
            return final_text, tool_call_count, actions_taken

        else:
            logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
            break

    # Exhausted iterations — get final response
    final_response = client.messages.create(
        model=settings.claude_model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=current_messages + [{
            "role": "user",
            "content": "Please summarize your findings based on all the data you've gathered."
        }],
    )
    final_text = ""
    for block in final_response.content:
        if hasattr(block, "text"):
            final_text += block.text
    return final_text, tool_call_count, actions_taken


async def simple_completion(prompt: str, system: str = None) -> str:
    """Single-turn completion without tool use. For structured JSON outputs."""
    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=4096,
        system=system or SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text if response.content else ""
