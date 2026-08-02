"""Score the wiki's retrieval against a gold-page eval set.

Deliberately LLM-free at scoring time: every metric here is computed from
which pages `wiki query` returns, so a round of the evolution loop costs
seconds rather than minutes and can be run after every candidate change. The
one LLM-derived input is qrels.json (built offline by build_qrels.py) —
graded relevance judgements for every (question, page) pair, produced without
looking at retrieval output. This script only reads that file; it never
calls an LLM itself.

    python evaluate.py --wiki ../../wiki --questions questions.json --json

Reports two scorings side by side:
  - single-gold: exact match against the one gold_page per question (the
    original metric — byte-identical in behaviour to before, so historical
    numbers stay comparable).
  - multi-gold / lenient-gold: derived from qrels.json's graded labels
    (2 = fully answers, 1 = partially relevant, 0 = not relevant). A hit is a
    returned page with label >= 2 (multi-gold) or >= 1 (lenient-gold). Also
    reports nDCG@3 using the graded labels. If qrels.json is missing, these
    sections are simply omitted and single-gold scoring runs as before.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

CUTOFFS = (1, 3, 5, 10)
NDCG_K = 3


@dataclass
class QuestionResult:
    q: str
    gold_page: str
    ranked_pages: list[str] = field(default_factory=list)
    labels: dict[str, int] = field(default_factory=dict)
    """Graded relevance labels (0/1/2) for this question, keyed by page path.

    Empty when qrels.json wasn't loaded. Independent of ranked_pages — these
    come from build_qrels.py judging page content vs. question, never from
    what retrieval returned.
    """

    @property
    def rank(self) -> int | None:
        """1-based rank of the gold page, or None if absent."""
        for i, p in enumerate(self.ranked_pages, start=1):
            if p == self.gold_page:
                return i
        return None

    def graded_rank(self, threshold: int) -> int | None:
        """1-based rank of the first returned page with label >= threshold, or None."""
        for i, p in enumerate(self.ranked_pages, start=1):
            if self.labels.get(p, 0) >= threshold:
                return i
        return None

    @property
    def max_label(self) -> int:
        """Highest relevance label any wiki page has for this question (0 if unjudged)."""
        return max(self.labels.values()) if self.labels else 0

    def ndcg_at_k(self, k: int) -> float | None:
        """Graded nDCG@k from self.labels. None if this question has no judged labels."""
        if not self.labels:
            return None
        gains = [self.labels.get(p, 0) for p in self.ranked_pages[:k]]
        dcg = sum((2**rel - 1) / math.log2(i + 1) for i, rel in enumerate(gains, start=1))
        ideal = sorted(self.labels.values(), reverse=True)[:k]
        idcg = sum((2**rel - 1) / math.log2(i + 1) for i, rel in enumerate(ideal, start=1))
        return dcg / idcg if idcg > 0 else 0.0


def page_of(hit: dict) -> str:
    """qmd emits `qmd://<collection>/<sub>/<file>.md`; we want `<sub>/<file>.md`."""
    raw = str(hit.get("file") or hit.get("path") or "")
    m = re.search(r"(sources|notes)/[^/]+\.md$", raw)
    return m.group(0) if m else raw


class QueryError(RuntimeError):
    """The CLI failed. Distinct from a query that legitimately found nothing."""


def run_query(cli: Path, wiki: Path, q: str, limit: int, verbatim: bool) -> list[dict]:
    """Raises QueryError on CLI failure.

    Returning [] on a crash would score infrastructure failures as retrieval
    misses — precisely the conflation that hid an 84%-zero-retrieval bug in the
    earlier LoCoMo run. A miss and a crash must never look the same.
    """
    args = ["node", str(cli), "--root", str(wiki), "query", q, "--limit", str(limit), "--chunks"]
    if verbatim:
        args.append("--verbatim")
    proc = subprocess.run(args, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        raise QueryError(proc.stderr.strip()[:300] or f"exit {proc.returncode}")
    try:
        data = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise QueryError(f"unparseable output: {proc.stdout[:200]}") from exc
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


def load_qrels(path: Path) -> dict[str, dict[str, int]] | None:
    """Load graded relevance judgements built offline by build_qrels.py.

    Returns None (multi-gold scoring skipped) if the file doesn't exist, so
    evaluate.py keeps working with only single-gold scoring when qrels
    hasn't been built yet.
    """
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {q: {p: int(v) for p, v in labels.items()} for q, labels in raw.items()}


def graded_scores(results: list[QuestionResult], threshold: int) -> dict:
    """Multi-gold-style recall@k / MRR at a given relevance threshold (2=full, 1=lenient).

    A "hit" is a returned page whose qrels label is >= threshold, computed
    from build_qrels.py's independent judgements — never from what the
    single gold_page happens to be.
    """
    n = len(results)
    ranks = [r.graded_rank(threshold) for r in results]
    mrr = sum(1.0 / r for r in ranks if r) / n if n else 0.0
    recall = {f"recall@{k}": sum(1 for r in ranks if r and r <= k) / n if n else 0.0 for k in CUTOFFS}
    return {"mrr": mrr, **recall, "threshold": threshold}


def evaluate(
    cli: Path,
    wiki: Path,
    questions: list[dict],
    limit: int,
    verbatim: bool,
    qrels: dict[str, dict[str, int]] | None = None,
) -> dict:
    results = []
    errors: list[dict] = []
    for item in questions:
        try:
            hits = run_query(cli, wiki, item["q"], limit, verbatim)
        except QueryError as exc:
            errors.append({"q": item["q"], "error": str(exc)})
            hits = []
        labels = (qrels or {}).get(item["q"], {})
        results.append(QuestionResult(item["q"], item["gold_page"], dedupe_pages(hits), labels))

    n = len(results)
    zero = sum(1 for r in results if not r.ranked_pages)
    ranks = [r.rank for r in results]
    mrr = sum(1.0 / r for r in ranks if r) / n if n else 0.0
    recall = {f"recall@{k}": sum(1 for r in ranks if r and r <= k) / n if n else 0.0 for k in CUTOFFS}

    out = {
        "n": n,
        "query_errors": len(errors),
        "errors": errors,
        "zero_retrieval": zero,
        "zero_retrieval_rate": zero / n if n else 0.0,
        "mrr": mrr,
        **recall,
        "failures": [
            {
                "q": r.q,
                "gold_page": r.gold_page,
                "got": r.ranked_pages[:5],
                # Diagnostic only, additive: does the eval-set failure actually
                # return content the LLM judged relevant? (0/1/2, or None if
                # qrels wasn't loaded / nothing was returned.)
                "top_result_label": r.labels.get(r.ranked_pages[0]) if r.ranked_pages and r.labels else None,
            }
            for r in results
            if r.rank is None or r.rank > 3
        ],
    }

    if qrels is not None:
        n_judged = sum(1 for r in results if r.labels)
        ndcg_values = [v for r in results if (v := r.ndcg_at_k(NDCG_K)) is not None]
        unjudged = [r.q for r in results if r.labels and r.max_label == 0]
        out["multi_gold"] = graded_scores(results, threshold=2)
        out["lenient_gold"] = graded_scores(results, threshold=1)
        out["ndcg@3"] = sum(ndcg_values) / len(ndcg_values) if ndcg_values else 0.0
        out["qrels_questions_judged"] = n_judged
        out["questions_with_no_relevant_page"] = unjudged

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki", required=True)
    ap.add_argument("--questions", required=True)
    ap.add_argument("--cli", default=str(Path(__file__).resolve().parents[2] / "plugins/ymir/wiki-cli/dist/cli.js"))
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--verbatim", action="store_true", help="shipped pre-fix behaviour")
    ap.add_argument("--json", action="store_true")
    ap.add_argument(
        "--qrels",
        default="qrels.json",
        help="graded relevance judgements from build_qrels.py; multi-gold scoring is "
        "skipped if this file doesn't exist (default: qrels.json)",
    )
    args = ap.parse_args()

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))["questions"]
    qrels = load_qrels(Path(args.qrels))
    m = evaluate(Path(args.cli), Path(args.wiki).resolve(), questions, args.limit, args.verbatim, qrels)

    if args.json:
        print(json.dumps(m, indent=2))
    else:
        print(f"questions      : {m['n']}")
        print(f"query errors   : {m['query_errors']}")
        print(f"zero-retrieval : {m['zero_retrieval']} ({m['zero_retrieval_rate']*100:.0f}%)")
        print()
        print("-- single-gold (exact gold_page match) --")
        print(f"MRR            : {m['mrr']:.3f}")
        for k in CUTOFFS:
            print(f"recall@{k:<8}: {m[f'recall@{k}']*100:.0f}%")
        print(f"failures (rank>3 or missing): {len(m['failures'])}")

        if "multi_gold" in m:
            mg, lg = m["multi_gold"], m["lenient_gold"]
            print()
            print(f"-- multi-gold (label >= 2, from {m['qrels_questions_judged']} judged questions) --")
            print(f"MRR            : {mg['mrr']:.3f}")
            print(f"recall@1       : {mg['recall@1']*100:.0f}%")
            print(f"recall@3       : {mg['recall@3']*100:.0f}%")
            print()
            print("-- lenient-gold (label >= 1) --")
            print(f"MRR            : {lg['mrr']:.3f}")
            print(f"recall@1       : {lg['recall@1']*100:.0f}%")
            print(f"recall@3       : {lg['recall@3']*100:.0f}%")
            print()
            print(f"nDCG@3         : {m['ndcg@3']:.3f}")
            if m["questions_with_no_relevant_page"]:
                print(f"questions with NO page judged relevant: {len(m['questions_with_no_relevant_page'])}")
        else:
            print()
            print(f"(no {args.qrels} found — multi-gold scoring skipped; run build_qrels.py first)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
