"""Generate a retrieval eval set from a real wiki.

For each page we ask for questions a developer would genuinely ask, whose answer
lives in that page — giving us a gold page per question. Retrieval can then be
scored with recall@k / MRR without an LLM in the loop, which is what makes the
evolution loop cheap enough to run many rounds.

    python genquestions.py --wiki ../../wiki --out questions.json --per-page 4
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import anthropic

PROMPT = """Below is one page from a technical wiki about a developer tool.

Write {n} questions a developer would realistically ask whose answer is in THIS page.

Rules:
- Each question must be answerable from this page alone.
- Do NOT quote the page title verbatim — a question that just repeats the title
  tests nothing. Ask about the substance.
- Prefer specifics: command names, flags, file paths, invariants, ordering,
  failure behaviour, concrete values.
- Vary the form: some "how", some "what", some "why", some "which".
- Also give the short gold answer (one sentence, drawn from the page).

Return ONLY JSON:
{{"questions": [{{"q": "<question>", "a": "<gold answer>"}}]}}

PAGE TITLE: {title}

PAGE CONTENT:
{body}
"""


def read_pages(wiki: Path) -> list[tuple[str, str, str]]:
    """(relative path, title, body-without-frontmatter) for every wiki page."""
    out: list[tuple[str, str, str]] = []
    for sub in ("sources", "notes"):
        for p in sorted((wiki / sub).glob("*.md")):
            text = p.read_text(encoding="utf-8")
            m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
            fm, body = (m.group(1), m.group(2)) if m else ("", text)
            tm = re.search(r"^title:\s*(.+)$", fm, re.MULTILINE)
            title = tm.group(1).strip() if tm else p.stem
            out.append((f"{sub}/{p.name}", title, body.strip()))
    return out


def parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1].rsplit("```", 1)[0]
    m = re.search(r"\{.*\}", t, re.DOTALL)
    return json.loads(m.group(0)) if m else {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--per-page", type=int, default=4)
    ap.add_argument("--model", default=os.environ.get("ANSWERER_MODEL", "claude-sonnet-5"))
    args = ap.parse_args()

    wiki = Path(args.wiki).resolve()
    pages = read_pages(wiki)
    if not pages:
        print(f"no pages under {wiki}", file=sys.stderr)
        return 1
    print(f"{len(pages)} pages", file=sys.stderr)

    client = anthropic.Anthropic()
    questions: list[dict] = []
    for rel, title, body in pages:
        resp = client.messages.create(
            model=args.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": PROMPT.format(n=args.per_page, title=title, body=body)}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        data = parse_json(text)
        got = 0
        for item in data.get("questions", []):
            q, a = str(item.get("q", "")).strip(), str(item.get("a", "")).strip()
            if q and a:
                questions.append({"q": q, "gold_answer": a, "gold_page": rel, "gold_title": title})
                got += 1
        print(f"  {rel}: {got}", file=sys.stderr)

    Path(args.out).write_text(json.dumps({"questions": questions}, indent=2), encoding="utf-8")
    print(f"wrote {len(questions)} questions -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
