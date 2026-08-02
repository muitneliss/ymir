"""Subprocess driver for the Ymir wiki CLI.

Every call goes through the real ``wiki`` binary — never around it to ``qmd``
directly — so the benchmark measures the shipped code path (validation, page
schema, index rebuild, collection scoping) rather than a bypass of it.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

from tenancy import Tenant

NoteType = Literal["entity", "concept", "topic"]


class WikiCLIError(RuntimeError):
    """A wiki CLI invocation exited non-zero."""

    def __init__(self, args: Sequence[str], returncode: int, stderr: str) -> None:
        super().__init__(f"wiki {' '.join(args)} exited {returncode}: {stderr.strip()[:500]}")
        self.args_ = list(args)
        self.returncode = returncode
        self.stderr = stderr


@dataclass(frozen=True)
class Hit:
    """One retrieved passage, in the shape mem0's client expects."""

    id: str
    memory: str
    score: float
    path: str

    def to_mem0(self) -> dict[str, object]:
        return {"id": self.id, "memory": self.memory, "score": self.score, "path": self.path}


def sanitise_body(text: str) -> str:
    """Neutralise wiki syntax that would fail ``wiki validate``.

    ``validateWiki`` rejects ``[[Link]]`` targets that do not resolve. Dataset
    transcripts are arbitrary prose and may contain double brackets, which would
    make an otherwise valid ingest throw. Breaking the token preserves the text
    for retrieval while removing its link semantics.
    """
    return text.replace("[[", "[ [").replace("]]", "] ]")


class WikiCLI:
    """Thin, typed wrapper around the wiki CLI executable."""

    def __init__(self, cli_entry: Path, node: str = "node", timeout: float = 300.0) -> None:
        if not cli_entry.exists():
            raise FileNotFoundError(
                f"wiki CLI bundle not found at {cli_entry} — run benchmarks/scripts/setup.sh"
            )
        self.cli_entry = cli_entry
        self.node = node
        self.timeout = timeout

    def _run(self, wiki_root: Path, args: Sequence[str], stdin: str | None = None) -> str:
        cmd = [self.node, str(self.cli_entry), "--root", str(wiki_root), *args]
        proc = subprocess.run(
            cmd,
            input=stdin if stdin is not None else "",
            capture_output=True,
            text=True,
            timeout=self.timeout,
        )
        if proc.returncode != 0:
            raise WikiCLIError(args, proc.returncode, proc.stderr)
        return proc.stdout

    # --- write side ---------------------------------------------------------

    def init(self, tenant: Tenant) -> None:
        tenant.wiki_root.mkdir(parents=True, exist_ok=True)
        self._run(
            tenant.wiki_root,
            ["init", "--project-root", str(tenant.project_dir), "--name", tenant.project_dir.name],
        )

    def ingest(self, tenant: Tenant, title: str, body: str, raw_ref: str) -> str:
        return self._run(
            tenant.wiki_root,
            ["ingest", "--raw", raw_ref, "--title", title, "--no-reindex"],
            stdin=sanitise_body(body),
        )

    def note(self, tenant: Tenant, note_type: NoteType, name: str, body: str) -> str:
        return self._run(
            tenant.wiki_root,
            ["note", "--type", note_type, "--name", name, "--no-reindex"],
            stdin=sanitise_body(body),
        )

    def reindex(self, tenant: Tenant) -> bool:
        """Register/refresh the tenant's qmd collection. True if it actually ran.

        Called once per flush rather than per page — ``ingest`` is invoked with
        ``--no-reindex`` because a full ``qmd collection add`` per turn is what
        makes naive ingestion quadratic.

        The CLI exits 0 even when it gives up (it treats a missing/failing qmd as
        non-fatal and prints "reindex skipped"), so the exit code alone cannot be
        trusted — serving searches against an unindexed collection silently
        returns zero hits, which scores as a wrong answer rather than an error.
        """
        out = self._run(tenant.wiki_root, ["reindex"])
        return "skipped" not in out.lower()

    # --- read side ----------------------------------------------------------

    def query(self, tenant: Tenant, q: str, limit: int, chunks: bool = True) -> list[Hit]:
        args = ["query", q, "--limit", str(limit)]
        if chunks:
            args.append("--chunks")
        # Deliberately NOT swallowing WikiCLIError here. Treating a failed query
        # as an empty result makes infrastructure failures indistinguishable
        # from genuine misses, which is how a reindex race silently produced an
        # 84%-zero-retrieval benchmark run. Let the caller retry or fail loudly.
        return self._parse_hits(self._run(tenant.wiki_root, args))

    @staticmethod
    def _strip_hunk_header(snippet: str) -> str:
        """Drop qmd's diff-style context header from a snippet.

        qmd 2.5.x prefixes each snippet with e.g. ``@@ -11,3 @@ (10 before, 0 after)``.
        That is display chrome; feeding it to the answerer is pure noise.
        """
        text = snippet.lstrip()
        if text.startswith("@@"):
            _, _, rest = text.partition("\n")
            return rest.strip()
        return text.strip()

    @staticmethod
    def _parse_hits(raw: str) -> list[Hit]:
        """Normalise qmd's JSON into mem0 memory items.

        Verified against qmd 2.5.3, which emits a bare list of
        ``{docid, score, file, line, title, snippet}``. Older/newer versions
        differ, so both a bare list and a ``{"results": [...]}`` envelope are
        accepted and the usual text/path field names are probed.
        """
        text = raw.strip()
        if not text:
            return []
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return []

        rows = data.get("results", []) if isinstance(data, dict) else data
        if not isinstance(rows, list):
            return []

        hits: list[Hit] = []
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            raw_body = next(
                (
                    str(row[k])
                    for k in ("snippet", "text", "content", "chunk", "body", "excerpt")
                    if row.get(k)
                ),
                "",
            )
            body = WikiCLI._strip_hunk_header(raw_body)
            path = str(row.get("file") or row.get("path") or row.get("document") or "")
            if not body:
                # --files mode returns paths only; the path is the only signal.
                body = path
            if not body:
                continue

            # A title gives the answerer the session context a bare snippet lacks.
            title = str(row.get("title") or "").strip()
            memory = f"[{title}] {body}" if title else body

            try:
                score = float(row.get("score", 0.0))
            except (TypeError, ValueError):
                score = 0.0
            hit_id = str(row.get("docid") or row.get("id") or f"{path}#{i}")
            hits.append(Hit(id=hit_id, memory=memory, score=score, path=path))

        hits.sort(key=lambda h: h.score, reverse=True)
        return hits
