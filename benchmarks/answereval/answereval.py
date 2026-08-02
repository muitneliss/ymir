"""End-to-end ANSWER-accuracy harness for the wiki CLI.

benchmarks/selfeval/evaluate.py measures retrieval: does the gold page show up
in `wiki query`'s top-k? That is a proxy. This script measures the thing we
actually care about: given ONLY the snippets `wiki query` returns, can an LLM
produce a correct answer? A page ranked #1 is worthless if the returned
snippet doesn't carry the fact, and a lower-ranked page can still save you if
the fact happens to live there too.

Pipeline per question (see evaluate() below):
  1. `wiki query <q> --limit K --chunks`               -> ranked chunk hits
     (retrieval invocation reused verbatim from selfeval/evaluate.py so both
     harnesses agree on what a "hit" is)
  2. LLM #1 (generation): answer the question using ONLY those snippets, with
     an explicit escape hatch ("INSUFFICIENT CONTEXT") so it can't quietly
     fall back on world knowledge.
  3. LLM #2 (judge): a SEPARATE call, blind to the gold page and to the
     retrieval rank, decides whether the generated answer matches
     gold_answer. Judge blindness matters -- otherwise we'd be measuring
     whether the judge can read a rank number, not whether the answer is
     right.
  4. Cross-tabulate against whether the gold page was actually retrieved
     (rank <= 3) to answer the only question that matters: is retrieval the
     bottleneck, or is it context quality once retrieval already succeeded?

Usage:
    cd benchmarks
    ANTHROPIC_BASE_URL=http://localhost:8898 ANTHROPIC_API_KEY=dummy \\
        .venv/bin/python answereval/answereval.py --limit 5

Results (including every per-question generation + judge verdict) are written
to --out as JSON; LLM calls are cached in --cache keyed by the exact prompt
content, so re-running with the same CLI/wiki/limit is free.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import anthropic

THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parents[1]
SELFEVAL_DIR = THIS_DIR.parent / "selfeval"

# Reuse selfeval's CLI-invocation + page-ranking logic verbatim rather than
# re-implementing it, so "was the gold page retrieved" means exactly the same
# thing in both harnesses. selfeval/evaluate.py is owned by another lane --
# we only import it, never write to it.
sys.path.insert(0, str(SELFEVAL_DIR))
import evaluate as selfeval  # noqa: E402

MODEL = "claude-sonnet-5"
INSUFFICIENT_MARKER = "INSUFFICIENT CONTEXT"
HIT_RANK_CUTOFF = 3  # "retrieval succeeded" == gold page within top-3

ANSWER_SYSTEM = f"""You answer questions using ONLY the context provided below. \
Do not use outside knowledge, prior training, or assumptions -- only facts \
explicitly stated in the context.

If the context does not contain enough information to answer the question, \
respond with EXACTLY this and nothing else:
{INSUFFICIENT_MARKER}

Otherwise, answer the question directly and concisely (1-3 sentences), \
stating only facts that appear in the context."""

JUDGE_SYSTEM = f"""You are grading whether a candidate answer is factually \
correct, judged ONLY against a reference (gold) answer. You are not told \
where either answer came from or how it was retrieved -- judge purely on \
whether the candidate's claims match the reference's claims.

A candidate answer of "{INSUFFICIENT_MARKER}" is always INCORRECT (the \
reference always has an answer). Minor wording differences are fine as long \
as the substantive fact(s) match. Partial answers that omit a key fact from \
the reference are INCORRECT.

Respond in exactly this format, nothing else:
VERDICT: yes|no
REASON: <one sentence>"""


def strip_diff_header(snippet: str) -> str:
    """`wiki query --chunks` prefixes each snippet with a diff-style header
    like '@@ -15,3 @@ (14 before, 0 after)\\n\\n'; the LLM only needs the text."""
    return re.sub(r"^@@[^\n]*\n\n?", "", snippet or "")


def format_context(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return "(no results returned)"
    parts = []
    for i, h in enumerate(hits, start=1):
        title = h.get("title") or "(untitled)"
        # `--full` returns the whole page in `body`; snippets omit the sentence
        # that answers the question in ~half of all cases.
        text = str(h.get("body") or "").strip() or strip_diff_header(str(h.get("snippet") or ""))
        parts.append(f"[{i}] {title}\n{text}")
    return "\n\n".join(parts)


def cache_key(*parts: str) -> str:
    return hashlib.sha256("||".join(parts).encode("utf-8")).hexdigest()


class Cache:
    """Thread-safe JSON cache of LLM call results, keyed by exact prompt content.

    Keying on (question, context, gold_answer) means the cache self-invalidates
    whenever --limit, --cli, or the wiki content changes the retrieved
    snippets -- no manual versioning needed.
    """

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.data: dict[str, dict[str, Any]] = {}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.data = {}

    def get(self, key: str) -> dict[str, Any] | None:
        with self.lock:
            return self.data.get(key)

    def put(self, key: str, value: dict[str, Any]) -> None:
        with self.lock:
            self.data[key] = value
            self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True), encoding="utf-8")


def call_llm(client: anthropic.Anthropic, system: str, user: str, max_tokens: int, retries: int = 3) -> str:
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return "".join(b.text for b in resp.content if b.type == "text").strip()
        except Exception as exc:  # local proxy hiccups, rate limits, etc.
            last_exc = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"LLM call failed after {retries} attempts: {last_exc}")


def generate_answer(client: anthropic.Anthropic, q: str, context: str) -> str:
    user = f"Context (retrieved snippets -- may be incomplete, irrelevant, or absent):\n\n{context}\n\nQuestion: {q}"
    return call_llm(client, ANSWER_SYSTEM, user, max_tokens=300)


_VERDICT_RE = re.compile(r"VERDICT:\s*(yes|no)", re.IGNORECASE)
_REASON_RE = re.compile(r"REASON:\s*(.+)", re.IGNORECASE | re.DOTALL)


def judge_answer(client: anthropic.Anthropic, q: str, gold_answer: str, generated: str) -> tuple[bool, str]:
    # Deliberately excludes gold_page and retrieval rank -- the judge must not
    # be able to infer correctness from "was this retrieved", only from
    # whether the text itself states the right fact.
    user = f"Question: {q}\nReference answer: {gold_answer}\nCandidate answer: {generated}"
    raw = call_llm(client, JUDGE_SYSTEM, user, max_tokens=150)
    verdict_m = _VERDICT_RE.search(raw)
    reason_m = _REASON_RE.search(raw)
    correct = bool(verdict_m and verdict_m.group(1).lower() == "yes")
    reason = reason_m.group(1).strip() if reason_m else raw
    return correct, reason


@dataclass
class QuestionOutcome:
    q: str
    gold_page: str
    gold_answer: str
    rank: int | None
    n_hits: int
    generated_answer: str
    insufficient: bool
    correct: bool
    judge_reason: str
    error: str | None = None

    @property
    def retrieval_hit(self) -> bool:
        return self.rank is not None and self.rank <= HIT_RANK_CUTOFF

    def to_dict(self) -> dict[str, Any]:
        d = dict(self.__dict__)
        d["retrieval_hit"] = self.retrieval_hit
        return d


def evaluate_one(
    client: anthropic.Anthropic,
    cli: Path,
    wiki: Path,
    limit: int,
    item: dict[str, str],
    cache: Cache,
    full: bool = False,
) -> QuestionOutcome:
    q, gold_answer, gold_page = item["q"], item["gold_answer"], item["gold_page"]
    try:
        hits = selfeval.run_query(cli, wiki, q, limit, verbatim=False, full=full)
    except selfeval.QueryError as exc:
        return QuestionOutcome(q, gold_page, gold_answer, None, 0, "", False, False, "", error=str(exc))

    ranked_pages = selfeval.dedupe_pages(hits)
    rank = next((i for i, p in enumerate(ranked_pages, start=1) if p == gold_page), None)
    context = format_context(hits)

    key = cache_key(q, context, gold_answer)
    cached = cache.get(key)
    if cached:
        generated, correct, reason = cached["generated_answer"], cached["judge_correct"], cached["judge_reason"]
    else:
        generated = generate_answer(client, q, context)
        correct, reason = judge_answer(client, q, gold_answer, generated)
        cache.put(key, {"generated_answer": generated, "judge_correct": correct, "judge_reason": reason})

    insufficient = generated.strip().upper().startswith(INSUFFICIENT_MARKER)
    return QuestionOutcome(q, gold_page, gold_answer, rank, len(hits), generated, insufficient, correct, reason)


def evaluate(
    cli: Path,
    wiki: Path,
    questions: list[dict[str, str]],
    limit: int,
    workers: int,
    cache_path: Path,
    full: bool = False,
) -> dict[str, Any]:
    client = anthropic.Anthropic()
    cache = Cache(cache_path)
    outcomes: list[QuestionOutcome] = [None] * len(questions)  # type: ignore[list-item]

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(evaluate_one, client, cli, wiki, limit, item, cache, full): i
            for i, item in enumerate(questions)
        }
        for fut in concurrent.futures.as_completed(futures):
            outcomes[futures[fut]] = fut.result()

    n = len(outcomes)
    scored = [o for o in outcomes if o.error is None]
    errors = [o for o in outcomes if o.error is not None]
    n_scored = len(scored)

    correct = sum(1 for o in scored if o.correct)
    insufficient = sum(1 for o in scored if o.insufficient)

    hit_correct = sum(1 for o in scored if o.retrieval_hit and o.correct)
    hit_incorrect = sum(1 for o in scored if o.retrieval_hit and not o.correct)
    miss_correct = sum(1 for o in scored if not o.retrieval_hit and o.correct)
    miss_incorrect = sum(1 for o in scored if not o.retrieval_hit and not o.correct)
    n_hit = hit_correct + hit_incorrect
    n_miss = miss_correct + miss_incorrect

    return {
        "n": n,
        "n_scored": n_scored,
        "query_errors": len(errors),
        "errors": [{"q": o.q, "error": o.error} for o in errors],
        "limit": limit,
        "full": full,
        "model": MODEL,
        "answer_accuracy": correct / n_scored if n_scored else 0.0,
        "insufficient_context_rate": insufficient / n_scored if n_scored else 0.0,
        "confusion": {
            "retrieval_hit_answer_correct": hit_correct,
            "retrieval_hit_answer_incorrect": hit_incorrect,
            "retrieval_miss_answer_correct": miss_correct,
            "retrieval_miss_answer_incorrect": miss_incorrect,
            "retrieval_hit_accuracy": hit_correct / n_hit if n_hit else None,
            "retrieval_miss_accuracy": miss_correct / n_miss if n_miss else None,
            "n_retrieval_hit": n_hit,
            "n_retrieval_miss": n_miss,
        },
        "results": [o.to_dict() for o in scored],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wiki", default=str(REPO_ROOT / "wiki"))
    ap.add_argument("--questions", default=str(SELFEVAL_DIR / "questions.json"))
    ap.add_argument("--cli", default=str(REPO_ROOT / "plugins/ymir/wiki-cli/dist/cli.js"))
    ap.add_argument("--limit", type=int, default=5, help="k passed to `wiki query --limit`")
    ap.add_argument("--workers", type=int, default=6, help="thread-pool size for LLM calls (capped at 8)")
    ap.add_argument("--cache", default=str(THIS_DIR / "cache.json"))
    ap.add_argument("--out", default=None, help="defaults to results-limit<K>.json in this directory")
    ap.add_argument("--full", action="store_true", help="return whole pages instead of snippets")
    ap.add_argument("--sample", type=int, default=None, help="only run the first N questions (debugging)")
    ap.add_argument("--json", action="store_true", help="print the full JSON summary instead of a text report")
    args = ap.parse_args()

    workers = max(1, min(args.workers, 8))

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))["questions"]
    if args.sample:
        questions = questions[: args.sample]

    out_path = Path(args.out) if args.out else THIS_DIR / f"results-limit{args.limit}.json"

    m = evaluate(Path(args.cli), Path(args.wiki).resolve(), questions, args.limit, workers, Path(args.cache), args.full)
    out_path.write_text(json.dumps(m, indent=2), encoding="utf-8")

    if args.json:
        print(json.dumps(m, indent=2))
    else:
        c = m["confusion"]
        print(f"questions          : {m['n']}  (scored: {m['n_scored']}, query errors: {m['query_errors']})")
        print(f"limit (k)          : {m['limit']}")
        print(f"answer accuracy    : {m['answer_accuracy']*100:.1f}%")
        print(f"insufficient rate  : {m['insufficient_context_rate']*100:.1f}%")
        print()
        print("retrieval x answer accuracy (2x2, hit = gold page rank <= 3):")
        print(f"  retrieval HIT  & answer correct   : {c['retrieval_hit_answer_correct']}")
        print(f"  retrieval HIT  & answer incorrect : {c['retrieval_hit_answer_incorrect']}")
        print(f"  retrieval MISS & answer correct   : {c['retrieval_miss_answer_correct']}")
        print(f"  retrieval MISS & answer incorrect : {c['retrieval_miss_answer_incorrect']}")
        hit_acc = c["retrieval_hit_accuracy"]
        miss_acc = c["retrieval_miss_accuracy"]
        print(f"  accuracy | hit  ({c['n_retrieval_hit']:>2}) : {hit_acc*100:.1f}%" if hit_acc is not None else "  accuracy | hit  : n/a")
        print(f"  accuracy | miss ({c['n_retrieval_miss']:>2}) : {miss_acc*100:.1f}%" if miss_acc is not None else "  accuracy | miss : n/a")
        print()
        print(f"full results written to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
