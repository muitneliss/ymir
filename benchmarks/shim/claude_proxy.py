"""Anthropic Messages API surface backed by Claude Code headless (`claude -p`).

Lets the benchmark run on an existing Claude Code subscription instead of a
metered API key. The harness builds `anthropic.AsyncAnthropic()`, and the SDK
honours `ANTHROPIC_BASE_URL`, so pointing that at this proxy reroutes every
answerer, judge and structured-output call through the CLI — with the harness
still completely unmodified.

    ANTHROPIC_BASE_URL=http://localhost:8898 ANTHROPIC_API_KEY=unused

Only the subset the harness actually uses is implemented: a single-shot
`POST /v1/messages` with text content. No streaming, no tool use, no vision —
the harness needs none of them (even its "structured output" path is plain text
plus a "reply with JSON" instruction).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

CLAUDE_BIN = os.environ.get("CLAUDE_BIN", shutil.which("claude") or "claude")
CONCURRENCY = int(os.environ.get("CLAUDE_PROXY_CONCURRENCY", "6"))
# `claude -p` normally answers in seconds but occasionally hangs; cap it so one
# stall cannot pin a worker. The harness retries on our error responses.
CALL_TIMEOUT = float(os.environ.get("CLAUDE_PROXY_TIMEOUT", "180"))
DEFAULT_SYSTEM = (
    "You are a precise text completion assistant. Follow the user's instructions "
    "exactly and reply with the answer only — no preamble, no commentary."
)

# The harness passes full model ids; the CLI accepts ids or short aliases.
MODEL_ALIASES: dict[str, str] = {
    "claude-sonnet-5": "sonnet",
    "claude-opus-5": "opus",
    "claude-haiku-4-5-20251001": "haiku",
    "claude-opus-4-8": "opus",
}

app = FastAPI(title="Claude Code headless → Anthropic Messages proxy")
_semaphore = asyncio.Semaphore(CONCURRENCY)

# A scratch cwd with no CLAUDE.md, no settings and no project context, so a
# judging call cannot inherit this repo's instructions.
_SANDBOX = Path(tempfile.mkdtemp(prefix="claude-proxy-"))


class ContentBlock(BaseModel):
    type: str = "text"
    text: str = ""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str | list[dict[str, Any]]


class MessagesRequest(BaseModel):
    model: str
    messages: list[Message]
    max_tokens: int = 4096
    system: str | list[dict[str, Any]] | None = None
    temperature: float | None = None
    stream: bool = False
    metadata: dict[str, Any] | None = Field(default=None)


def _flatten(content: str | list[dict[str, Any]] | None) -> str:
    """Anthropic content may be a string or a list of blocks."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text", "")))
    return "\n".join(parts)


def _build_prompt(messages: list[Message]) -> str:
    """Collapse the conversation into one prompt.

    The harness only ever sends a single user message, but a multi-turn list is
    labelled rather than silently dropped.
    """
    if len(messages) == 1:
        return _flatten(messages[0].content)
    return "\n\n".join(f"{m.role.upper()}: {_flatten(m.content)}" for m in messages)


def _parse_cli_output(stdout: str) -> tuple[str, dict[str, int]]:
    """Extract the assistant text from `claude -p --output-format json`.

    The CLI emits either a result object or an array of session events whose
    last `type: "result"` entry carries the final text.
    """
    text = stdout.strip()
    if not text:
        raise HTTPException(status_code=502, detail="claude CLI produced no output")

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"unparseable CLI output: {text[:300]}") from exc

    record: dict[str, Any] | None = None
    if isinstance(data, list):
        for item in reversed(data):
            if isinstance(item, dict) and item.get("type") == "result":
                record = item
                break
    elif isinstance(data, dict):
        record = data

    if record is None:
        raise HTTPException(status_code=502, detail="no result record in CLI output")

    if record.get("is_error"):
        raise HTTPException(
            status_code=502,
            detail=f"claude CLI error: {str(record.get('result'))[:300]}",
        )

    usage_raw = record.get("usage") or {}
    usage = {
        "input_tokens": int(usage_raw.get("input_tokens", 0) or 0),
        "output_tokens": int(usage_raw.get("output_tokens", 0) or 0),
    }
    return str(record.get("result", "")), usage


def _child_env() -> dict[str, str]:
    """Environment for the `claude` child process.

    CRITICAL: the CLI honours ANTHROPIC_BASE_URL exactly as the SDK does. Since
    that variable is what points the harness at *this* proxy, leaving it set
    would make every child call back into us — an infinite loop that presents as
    a hang. Strip the routing/credential overrides and let the CLI use its own
    OAuth session (CLAUDE_CODE_OAUTH_TOKEN is deliberately preserved).
    """
    env = dict(os.environ)
    for key in ("ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        env.pop(key, None)
    return env


async def _invoke(prompt: str, system: str, model: str) -> tuple[str, dict[str, int]]:
    args = [
        CLAUDE_BIN,
        "-p",
        "--output-format", "json",
        "--model", MODEL_ALIASES.get(model, model),
        "--system-prompt", system or DEFAULT_SYSTEM,
        # Pure completion: no tools, no MCP servers, no project context. Also
        # removes seconds of per-call startup that plugin/MCP loading costs.
        # `--tools` is variadic and REQUIRES a value — passing it bare silently
        # swallows the following flags as tool names, leaving MCP servers loaded.
        "--tools", "",
        "--strict-mcp-config",
        "--mcp-config", '{"mcpServers":{}}',
    ]

    async with _semaphore:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(_SANDBOX),
            env=_child_env(),
        )
        try:
            out, err = await asyncio.wait_for(
                proc.communicate(prompt.encode()), timeout=CALL_TIMEOUT
            )
        except asyncio.TimeoutError:
            proc.kill()
            raise HTTPException(status_code=504, detail="claude CLI timed out") from None

    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"claude exited {proc.returncode}: {err.decode(errors='replace')[:300]}",
        )
    return _parse_cli_output(out.decode(errors="replace"))


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "bin": CLAUDE_BIN,
        "concurrency": CONCURRENCY,
        "sandbox": str(_SANDBOX),
    }


@app.post("/v1/messages")
async def create_message(req: MessagesRequest) -> dict[str, Any]:
    if req.stream:
        raise HTTPException(status_code=400, detail="streaming is not supported by this proxy")

    prompt = _build_prompt(req.messages)
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="empty prompt")

    text, usage = await _invoke(prompt, _flatten(req.system), req.model)

    return {
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "role": "assistant",
        "model": req.model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": usage,
    }
