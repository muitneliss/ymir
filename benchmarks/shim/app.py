"""mem0-OSS-compatible HTTP surface backed by the Ymir wiki CLI.

The mem0 harness hardcodes ``Mem0Client(...)``, but in ``oss`` mode that client
is a plain HTTP client aimed at ``--mem0-host``. Reimplementing the three
endpoints it exercises lets the benchmark run against an **unmodified**
checkout — no fork, no patch, trivially upgradable.

    python -m uvicorn app:app --port 8899
    python -m benchmarks.locomo.run --backend oss --mem0-host http://localhost:8899 ...

Session buffering
-----------------
The harness ingests one *turn* per ``add`` call (``CHUNK_SIZE = 1``). Writing a
wiki page per utterance is both quadratic (every ``ingest`` revalidates the whole
wiki) and pathological as a wiki. We therefore buffer turns keyed by the
``timestamp`` the harness sends — which changes at each session boundary — and
write one source page per session. The same information reaches the wiki, at the
granularity the wiki was designed for, identically in both arms.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from synthesiser import Synthesiser
from tenancy import Tenant, tenant_for
from wiki_backend import WikiCLI, WikiCLIError

IngestMode = Literal["raw", "synth"]
Granularity = Literal["session", "turn"]

WORKSPACE = Path(os.environ.get("WIKI_SHIM_WORKSPACE", "./.workspace")).resolve()
CLI_ENTRY = Path(
    os.environ.get(
        "WIKI_SHIM_CLI",
        Path(__file__).resolve().parents[2] / "plugins/ymir/wiki-cli/dist/cli.js",
    )
).resolve()
MODE: IngestMode = os.environ.get("WIKI_SHIM_MODE", "raw")  # type: ignore[assignment]
GRANULARITY: Granularity = os.environ.get("WIKI_SHIM_GRANULARITY", "session")  # type: ignore[assignment]

app = FastAPI(title="Ymir wiki memory shim")
wiki = WikiCLI(CLI_ENTRY)
synthesiser = Synthesiser() if MODE == "synth" else None


# --------------------------------------------------------------------------- #
# Request models — mirror docker/mem0/main.py
# --------------------------------------------------------------------------- #


class AddRequest(BaseModel):
    messages: list[dict[str, Any]]
    user_id: str | None = None
    agent_id: str | None = None
    run_id: str | None = None
    metadata: dict[str, Any] | None = None
    observation_date: str | None = None
    custom_instructions: str | None = None
    timestamp: int | None = None


class SearchRequest(BaseModel):
    query: str
    user_id: str | None = None
    agent_id: str | None = None
    run_id: str | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    filters: dict[str, Any] | None = None
    rerank: bool = False


# --------------------------------------------------------------------------- #
# Per-tenant state
# --------------------------------------------------------------------------- #


@dataclass
class TenantState:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    initialised: bool = False
    #  session key -> accumulated turns
    buffer: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    flushed: set[str] = field(default_factory=set)
    dirty: bool = False
    pages: int = 0


_state: dict[str, TenantState] = defaultdict(TenantState)

# `qmd update` re-indexes EVERY collection through one shared SQLite database,
# so it is a process-global critical section, not a per-tenant one. Without this
# lock, two tenants reindexing concurrently contend on the DB; the CLI reports
# "skipped" and every later search silently returns zero hits.
_QMD_LOCK = asyncio.Lock()


def _session_label(key: str) -> tuple[str, str]:
    """Human date for a session key, as (title_suffix, body_header).

    The harness identifies sessions by unix timestamp. Using that opaque number
    as the page title discards the date entirely — which makes LoCoMo's temporal
    questions ("When did X happen?") unanswerable no matter how good retrieval
    is. The date has to survive into the page text.
    """
    try:
        dt = datetime.fromtimestamp(int(key), tz=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return key, ""
    iso = dt.strftime("%Y-%m-%d")
    pretty = dt.strftime("%d %B %Y (%A)")
    return f"{iso} {key}", f"Session date: {pretty}, {iso}.\n\n"


def _require_user(user_id: str | None) -> str:
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    return user_id


def _render_turns(messages: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for m in messages:
        content = str(m.get("content", "")).strip()
        if content:
            out.append(content)
    return out


async def _ensure_init(tenant: Tenant, st: TenantState) -> None:
    if st.initialised:
        return
    await asyncio.to_thread(wiki.init, tenant)
    st.initialised = True


async def _flush(tenant: Tenant, st: TenantState, keys: list[str]) -> int:
    """Write buffered sessions as wiki pages. Caller must hold ``st.lock``."""
    written = 0
    for key in keys:
        turns = st.buffer.pop(key, [])
        if not turns:
            continue
        suffix, header = _session_label(key)
        body = header + "\n\n".join(turns)
        title = f"session {suffix}"
        try:
            if synthesiser is not None:
                page, notes = await synthesiser.summarise(body)
                await asyncio.to_thread(wiki.ingest, tenant, title, page, f"bench://{key}")
                for note in notes:
                    try:
                        await asyncio.to_thread(
                            wiki.note, tenant, note.note_type, note.name, note.body
                        )
                    except WikiCLIError:
                        # A rejected note must not lose the source page.
                        continue
            else:
                await asyncio.to_thread(wiki.ingest, tenant, title, body, f"bench://{key}")
            written += 1
            st.flushed.add(key)
            st.dirty = True
        except WikiCLIError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    st.pages += written
    return written


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Ymir wiki memory shim", "mode": MODE, "granularity": GRANULARITY}


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "llm": f"wiki-shim:{MODE}",
        "embedder": "qmd-bm25",
        "cli": str(CLI_ENTRY),
        "workspace": str(WORKSPACE),
    }


@app.post("/memories")
async def add_memories(req: AddRequest) -> dict[str, Any]:
    user_id = _require_user(req.user_id)
    tenant = tenant_for(WORKSPACE, user_id)
    st = _state[user_id]

    turns = _render_turns(req.messages)
    if not turns:
        return {"results": []}

    key = str(req.timestamp if req.timestamp is not None else req.observation_date or "default")
    if GRANULARITY == "turn":
        key = f"{key}-{len(st.flushed) + len(st.buffer)}"

    async with st.lock:
        await _ensure_init(tenant, st)
        st.buffer[key].extend(turns)

        # A new session key means every earlier session is complete — flush them.
        stale = [k for k in st.buffer if k != key]
        written = await _flush(tenant, st, stale) if stale else 0
        if GRANULARITY == "turn":
            written += await _flush(tenant, st, [key])

    return {"results": [{"event": "BUFFERED", "memory": t} for t in turns], "pages_written": written}


async def _reindex_verified(tenant: Tenant, st: TenantState) -> None:
    """Bring the tenant's collection up to date, serialised process-wide.

    Retries because `qmd update` can lose a race against another tenant; raises
    rather than leaving the tenant queryable-but-empty, so a failure surfaces as
    an HTTP error the harness retries instead of a silent wrong answer.
    """
    last = ""
    for attempt in range(4):
        async with _QMD_LOCK:
            try:
                if await asyncio.to_thread(wiki.reindex, tenant):
                    st.dirty = False
                    return
                last = "wiki reindex reported 'skipped'"
            except WikiCLIError as exc:
                last = str(exc)
        await asyncio.sleep(1.5 * (attempt + 1))
    raise HTTPException(status_code=503, detail=f"reindex failed for {tenant.collection}: {last}")


@app.post("/search")
async def search(req: SearchRequest) -> dict[str, Any]:
    user_id = _require_user(req.user_id)
    tenant = tenant_for(WORKSPACE, user_id)
    st = _state[user_id]

    async with st.lock:
        if not st.initialised and not tenant.wiki_root.exists():
            return {"results": []}
        await _ensure_init(tenant, st)
        # Retrieval must see everything ingested so far.
        if st.buffer:
            await _flush(tenant, st, list(st.buffer))
        if st.dirty:
            await _reindex_verified(tenant, st)

    for attempt in range(3):
        try:
            hits = await asyncio.to_thread(wiki.query, tenant, req.query, req.limit, True)
            return {"results": [h.to_mem0() for h in hits[: req.limit]]}
        except WikiCLIError as exc:
            if attempt == 2:
                raise HTTPException(status_code=503, detail=f"query failed: {exc}") from exc
            await asyncio.sleep(1.0 * (attempt + 1))
    return {"results": []}


@app.delete("/memories")
async def delete_memories(user_id: str | None = Query(default=None)) -> dict[str, str]:
    uid = _require_user(user_id)
    tenant = tenant_for(WORKSPACE, uid)
    st = _state[uid]
    async with st.lock:
        if tenant.project_dir.exists():
            shutil.rmtree(tenant.project_dir, ignore_errors=True)
        _state.pop(uid, None)
    return {"message": "All memories deleted"}


@app.post("/reset")
async def reset() -> dict[str, str]:
    wikis = WORKSPACE / "wikis"
    if wikis.exists():
        shutil.rmtree(wikis, ignore_errors=True)
    _state.clear()
    return {"message": "All memories reset"}
