"""Build multi-gold relevance judgements (qrels) for the wiki retrieval eval.

Single-gold scoring (one gold_page per question) under-reports retrieval
quality on a wiki whose 11 pages overlap heavily (a design spec, an
implementation plan, and synthesis notes often describe the same system).
This script asks an LLM to grade EVERY page against EVERY question,
independent of what the retrieval system actually returns, producing:

    2 = page fully answers the question
    1 = page is partially relevant / related context
    0 = page is not relevant

Output is selfeval/qrels.json:

    {"<question text>": {"sources/x.md": 2, "notes/y.md": 0, ...}, ...}

INTEGRITY: judging happens purely from page content vs. question text. This
script never calls `wiki query` or the CLI, and never looks at retrieval
output — the whole point of qrels is to be a judgement independent of the
system under test.

    cd benchmarks/selfeval
    ANTHROPIC_BASE_URL=http://localhost:8898 ANTHROPIC_API_KEY=dummy \
        ../.venv/bin/python build_qrels.py --wiki ../../wiki --out qrels.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import anthropic

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)
TITLE_RE = re.compile(r"^title:\s*(.+)$", re.MULTILINE)

PROMPT = """You are building relevance judgements (qrels) for a retrieval eval over a small \
technical wiki about a developer tool. You will judge how relevant EACH of the wiki pages \
below is to ONE question.

Grade each page on this scale:
  2 = the page fully answers the question (contains the specific fact/answer asked for)
  1 = the page is partially relevant or useful related context, but does not fully answer it
  0 = the page is not relevant to the question

Judge strictly from the page content shown below. Do not guess about pages not shown. Multiple \
pages may deserve a 2 if the wiki has overlapping/duplicated content (e.g. a design spec and an \
implementation plan and a synthesis note that all describe the same mechanism) — that is \
expected and correct, grade each page independently on its own merits.

QUESTION: {question}

PAGES:
{pages_block}

Return ONLY JSON mapping every page path (exactly as given) to its integer label:
{{"<page_path>": <0|1|2>, ...}}
"""


def read_pages(wiki: Path) -> list[tuple[str, str, str]]:
    """(relative path, title, body-without-frontmatter) for every wiki page."""
    out: list[tuple[str, str, str]] = []
    for sub in ("sources", "notes"):
        for p in sorted((wiki / sub).glob("*.md")):
            text = p.read_text(encoding="utf-8")
            m = FRONTMATTER_RE.match(text)
            fm, body = (m.group(1), m.group(2)) if m else ("", text)
            tm = TITLE_RE.search(fm)
            title = tm.group(1).strip() if tm else p.stem
            out.append((f"{sub}/{p.name}", title, body.strip()))
    return out


def parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1].rsplit("```", 1)[0]
    m = re.search(r"\{.*\}", t, re.DOTALL)
    return json.loads(m.group(0)) if m else {}


def build_pages_block(pages: list[tuple[str, str, str]]) -> str:
    parts = []
    for rel, title, body in pages:
        parts.append(f"### PAGE: {rel}\nTITLE: {title}\n{body}")
    return "\n\n".join(parts)


def judge_question(
    client: anthropic.Anthropic, model: str, question: str, pages: list[tuple[str, str, str]]
) -> dict[str, int]:
    pages_block = build_pages_block(pages)
    prompt = PROMPT.format(question=question, pages_block=pages_block)
    resp = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    data = parse_json(text)

    labels: dict[str, int] = {}
    valid_paths = {rel for rel, _, _ in pages}
    for rel, val in data.items():
        if rel not in valid_paths:
            continue
        try:
            iv = int(val)
        except (TypeError, ValueError):
            continue
        labels[rel] = max(0, min(2, iv))

    # Any page the model omitted defaults to 0 (not relevant).
    for rel in valid_paths:
        labels.setdefault(rel, 0)
    return labels


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki", required=True)
    ap.add_argument("--questions", default="questions.json")
    ap.add_argument("--out", default="qrels.json")
    ap.add_argument("--model", default="claude-sonnet-5")
    args = ap.parse_args()

    wiki = Path(args.wiki).resolve()
    pages = read_pages(wiki)
    if not pages:
        print(f"no pages under {wiki}", file=sys.stderr)
        return 1
    print(f"{len(pages)} pages", file=sys.stderr)

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))["questions"]
    print(f"{len(questions)} questions", file=sys.stderr)

    client = anthropic.Anthropic()
    qrels: dict[str, dict[str, int]] = {}
    for i, item in enumerate(questions, start=1):
        q = item["q"]
        labels = judge_question(client, args.model, q, pages)
        qrels[q] = labels
        n_full = sum(1 for v in labels.values() if v == 2)
        n_partial = sum(1 for v in labels.values() if v == 1)
        print(f"[{i}/{len(questions)}] full={n_full} partial={n_partial}  {q[:70]}", file=sys.stderr)

    Path(args.out).write_text(json.dumps(qrels, indent=2), encoding="utf-8")
    print(f"wrote qrels for {len(qrels)} questions -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
