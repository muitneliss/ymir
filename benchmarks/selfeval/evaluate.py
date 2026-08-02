"""Score the wiki's retrieval against a gold-page eval set.

Deliberately LLM-free: every metric here is computed from which pages `wiki
query` returns, so a round of the evolution loop costs seconds rather than
minutes and can be run after every candidate change.

    python evaluate.py --wiki ../../wiki --questions questions.json --json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

CUTOFFS = (1, 3, 5, 10)


@dataclass
class QuestionResult:
    q: str
    gold_page: str
    ranked_pages: list[str] = field(default_factory=list)

    @property
    def rank(self) -> int | None:
        """1-based rank of the gold page, or None if absent."""
        for i, p in enumerate(self.ranked_pages, start=1):
            if p == self.gold_page:
                return i
        return None


def page_of(hit: dict) -> str:
    """qmd emits `qmd://<collection>/<sub>/<file>.md`; we want `<sub>/<file>.md`."""
    raw = str(hit.get("file") or hit.get("path") or "")
    m = re.search(r"(sources|notes)/[^/]+\.md$", raw)
    return m.group(0) if m else raw


def run_query(cli: Path, wiki: Path, q: str, limit: int, verbatim: bool) -> list[dict]:
    args = ["node", str(cli), "--root", str(wiki), "query", q, "--limit", str(limit), "--chunks"]
    if verbatim:
        args.append("--verbatim")
    proc = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        return []
    try:
        data = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else data.get("results", [])


def dedupe_pages(hits: list[dict]) -> list[str]:
    """Chunk hits collapse to a ranked, de-duplicated page list."""
    seen: set[str] = set()
    order: list[str] = []
    for h in hits:
        p = page_of(h)
        if p and p not in seen:
            seen.add(p)
            order.append(p)
    return order


def evaluate(cli: Path, wiki: Path, questions: list[dict], limit: int, verbatim: bool) -> dict:
    results = []
    for item in questions:
        hits = run_query(cli, wiki, item["q"], limit, verbatim)
        results.append(QuestionResult(item["q"], item["gold_page"], dedupe_pages(hits)))

    n = len(results)
    zero = sum(1 for r in results if not r.ranked_pages)
    ranks = [r.rank for r in results]
    mrr = sum(1.0 / r for r in ranks if r) / n if n else 0.0
    recall = {f"recall@{k}": sum(1 for r in ranks if r and r <= k) / n if n else 0.0 for k in CUTOFFS}

    return {
        "n": n,
        "zero_retrieval": zero,
        "zero_retrieval_rate": zero / n if n else 0.0,
        "mrr": mrr,
        **recall,
        "failures": [
            {"q": r.q, "gold_page": r.gold_page, "got": r.ranked_pages[:5]}
            for r in results
            if r.rank is None or r.rank > 3
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki", required=True)
    ap.add_argument("--questions", required=True)
    ap.add_argument("--cli", default=str(Path(__file__).resolve().parents[2] / "plugins/ymir/wiki-cli/dist/cli.js"))
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--verbatim", action="store_true", help="shipped pre-fix behaviour")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))["questions"]
    m = evaluate(Path(args.cli), Path(args.wiki).resolve(), questions, args.limit, args.verbatim)

    if args.json:
        print(json.dumps(m, indent=2))
    else:
        print(f"questions      : {m['n']}")
        print(f"zero-retrieval : {m['zero_retrieval']} ({m['zero_retrieval_rate']*100:.0f}%)")
        print(f"MRR            : {m['mrr']:.3f}")
        for k in CUTOFFS:
            print(f"recall@{k:<8}: {m[f'recall@{k}']*100:.0f}%")
        print(f"failures (rank>3 or missing): {len(m['failures'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
