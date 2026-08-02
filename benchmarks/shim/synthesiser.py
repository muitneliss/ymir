"""Arm B — the LLM synthesis step the wiki is designed around.

The wiki CLI deliberately does **not** summarise: `SCHEMA.md` puts that on the
calling LLM, which reads a source, discusses it, then calls `ingest` with an
extracted body and updates related notes. Arm A skips this (raw transcript in,
measuring BM25 over the page schema); arm B performs it, so the A/B delta
isolates what the synthesis discipline is actually worth.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Literal

import anthropic

NoteType = Literal["entity", "concept", "topic"]

MODEL = os.environ.get("WIKI_SHIM_SYNTH_MODEL", "claude-sonnet-5")
MAX_NOTES = int(os.environ.get("WIKI_SHIM_MAX_NOTES", "6"))

PROMPT = """You maintain a knowledge wiki. Below is one session of a conversation.

Write a wiki source page body that preserves every retrievable fact: who said or
did what, all names, dates, numbers, places, preferences, plans and events. Keep
concrete details verbatim where they carry information — this page is the only
record of the session and will be searched by keyword later. Do not editorialise
and do not omit specifics to be concise.

Then list the durable entities and concepts worth their own note.

Return ONLY JSON:
{{"page": "<markdown body>",
  "notes": [{{"type": "entity|concept|topic", "name": "<short name>", "body": "<markdown>"}}]}}

At most {max_notes} notes.

SESSION:
{session}
"""


@dataclass(frozen=True)
class SynthNote:
    note_type: NoteType
    name: str
    body: str


class Synthesiser:
    """Turns a raw session transcript into a source page plus synthesis notes."""

    def __init__(self, model: str = MODEL) -> None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY must be set for WIKI_SHIM_MODE=synth")
        self.model = model
        self.client = anthropic.AsyncAnthropic()

    async def summarise(self, session_text: str) -> tuple[str, list[SynthNote]]:
        resp = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": PROMPT.format(max_notes=MAX_NOTES, session=session_text),
                }
            ],
        )
        text = "".join(block.text for block in resp.content if block.type == "text").strip()
        page, notes = self._parse(text)
        # Never let a parse failure silently drop the session from the wiki.
        return (page or session_text), notes

    @staticmethod
    def _parse(text: str) -> tuple[str, list[SynthNote]]:
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return "", []
        if not isinstance(data, dict):
            return "", []

        page = str(data.get("page", ""))
        notes: list[SynthNote] = []
        for raw in data.get("notes", [])[:MAX_NOTES]:
            if not isinstance(raw, dict):
                continue
            ntype = str(raw.get("type", "concept"))
            if ntype not in ("entity", "concept", "topic"):
                ntype = "concept"
            name = str(raw.get("name", "")).strip()
            body = str(raw.get("body", "")).strip()
            if name and body:
                notes.append(SynthNote(note_type=ntype, name=name, body=body))  # type: ignore[arg-type]
        return page, notes
