# Evaluating the Ymir wiki's retrieval — results

**Corpus:** this repo's own `wiki/` (7 source pages + 4 notes).
**Eval set:** 44 questions generated from those pages, each with a gold page
(`selfeval/questions.json`). Scoring is LLM-free — metrics come from which pages
`wiki query` returns — so a round costs seconds and can gate every change.

## Headline

The shipped `wiki query` found the correct page for **zero of 44** realistic
developer questions about Ymir's own documentation. Four root-cause fixes later
it finds it in the top 3 for **64%**, and never returns nothing.

| | shipped | +term extraction | +conjunctive backoff | +curated-only index | +sequential probing |
| --- | ---: | ---: | ---: | ---: | ---: |
| zero-retrieval | 93% | 70% | 25% | 14% | **0%** |
| query errors | – | – | – | 2 | **0** |
| MRR | 0.000 | 0.104 | 0.246 | 0.511 | **0.580** |
| recall@1 | 0% | 9% | 18% | 48% | **52%** |
| recall@3 | 0% | 11% | 30% | 55% | **64%** |
| recall@10 | 0% | 14% | 34% | 55% | **64%** |

## The five defects, in the order they were found

Each was found by evidence, fixed at the root, and covered by tests
(120 passing). None was a tuning tweak.

### 1. `wiki query` searched every collection on the machine
`reindex` registered the wiki as `<project>-wiki`, but `query` called
`qmd search` with **no `-c` flag** — so it searched every qmd collection
registered on the machine, including other projects' wikis and personal notes.
Wrong results *and* a cross-project information leak.

### 2. `wiki reindex` never refreshed the index
It called `qmd collection add`, which exits **non-zero on an existing
collection and indexes nothing**. The failure was swallowed as
`"reindex: qmd non-zero exit — skipping"`. After the very first ingest, every
page written thereafter was **permanently invisible to search**. The refresh
path is `qmd update`.

### 3. Natural-language questions destroyed retrieval
`qmd search` is **conjunctive**: hit count falls monotonically as terms are
added, and one term absent from the index zeroes the entire query.

```
hook                                                   19 hits
sessionstart hook binary download verify                4 hits
happens sessionstart hook fails download verify binary  0 hits
happens                                                 0 hits   <- the culprit
```

`wiki query` exists to be called by an LLM, which forwards a user's question
verbatim — the worst possible input. Now: reduce to content terms, drop terms
the index lacks, then shed the least selective terms until something matches.

### 4. Search returned raw originals instead of curated pages
`qmd collection add` defaults to mask `**/*.md`, so `raw/` was indexed
alongside `sources/` and `notes/`. Raw files are longer and share their
summary's vocabulary, so they outranked it — a `raw/` page was the **top hit
for 21 of 25 wrong answers**. The wiki's entire value is the curated layer.
Mask is now `{sources,notes}/**/*.md`.

Fixing this exposed a second exit-code lie: qmd keys collections by **path, not
name**, so adding a new name for an already-registered directory exits **zero
and does nothing**. `reindex` claimed success for a collection that did not
exist. It now reconciles observed state and verifies before claiming success.

### 5. Concurrent probing crashed the query
Term probing used `Promise.all`, spawning one qmd process per term. Concurrent
qmd invocations contend on its shared index and intermittently exit non-zero
(measured: **1 failure in 10** parallel probes), and that rejection propagated
out, killing the whole command. Probing is now sequential and failure-tolerant,
while a genuine fault (qmd missing) still surfaces.

## A recurring theme worth naming

Three of the five defects were the same mistake: **trusting a qmd exit code, or
turning a failure into an empty result.** `collection add` exits non-zero when
the collection exists, exits *zero* when another name owns the path, and the CLI
exits zero when it gives up entirely. Every time, a broken index looked exactly
like "no matches" — and a wrong answer is far more expensive than an error.

The same conflation appeared twice in the benchmark harness itself (the shim's
`query` swallowing errors, then `evaluate.py` doing it again). Both now
distinguish a miss from a crash.

## Where it plateaus, and why

The remaining 16 failures are largely **eval-set artifacts rather than retrieval
failures**. The 11 pages overlap heavily — design spec, implementation plan and
synthesis notes all describe the same system — so a single "correct" page is
often arbitrary:

| Question | gold | returned |
| --- | --- | --- |
| Which component is the only sanctioned write path for wiki content? | `wiki-harness-implementation-plan` | `wiki-harness-design-spec` |
| How does the wiki CLI implement `query` under the hood? | `wiki-schema` | `wiki-cli-command-surface` |

In both cases the returned page genuinely answers the question. Single-gold
scoring under-reports real quality, so further retrieval tuning would be
optimising against measurement noise.

**Next lever:** proper relevance judgements (qrels) — label every acceptable
page per question, not just one — then re-measure. Only after that is it worth
asking whether the remaining gap needs semantic search, which would mean
`qmd query` (embeddings + local LLM) and a break from the wiki's deliberate
no-embeddings design.

## Reproducing

```bash
bash scripts/setup.sh
node ../plugins/ymir/wiki-cli/dist/cli.js --root ../wiki reindex
cd selfeval
../.venv/bin/python evaluate.py --wiki ../../wiki --questions questions.json            # fixed
../.venv/bin/python evaluate.py --wiki ../../wiki --questions questions.json --verbatim # shipped
```

Regenerating the question set needs the LLM proxy (`shim/claude_proxy.py`) and
an authenticated `claude` CLI; see `README.md`.

---

# Round 2 — the OKR run (answer accuracy)

Five lanes ran in parallel against the frame in `OKR-PLAN.md`.

## Outcome: objective met, but not by the work we planned

| target | result | |
| --- | ---: | --- |
| answer accuracy ≥ 85% | **90.9%** | met |
| multi-gold recall@3 ≥ 85% | **93.2%** | met |
| multi-gold MRR ≥ 0.75 | **0.914** | met |
| query errors 0 | **0** | met |

Walls: A1 held (no embeddings — verified by the qmd subcommands actually
invoked, not by grep), A2 held (129 tests), A3 held after a human-authorised
re-baseline to 4.5s (measured 4.00s), A4 held (question set hash frozen),
A5 held (both scorings reported throughout).

## The `pointless` flag earned the whole exercise

Retrieval improved a lot and answer accuracy **did not move at all**:

| | before | after |
| --- | ---: | ---: |
| multi-gold recall@3 | 81.8% | 93.2% |
| single-gold recall@3 | 63.6% | 81.8% |
| **answers correct** | **19 / 44** | **19 / 44** |

Nine retrieval misses became hits and produced zero additional correct answers.
Accuracy *given* a hit actually fell (57.1% → 45.9%), because the newly-retrieved
pages were relevant but their snippets still lacked the fact.

Without the paired objective read this would have shipped as a clear win:
+18pt recall@3, six bugs fixed, tests green. The objective metric was flat.

## What actually moved it: context, not ranking

`wiki query` returned qmd's snippet — ~333 chars against a ~1.9KB page — which
omitted the answering sentence in about half of all questions.

| context | k | corpus returned | accuracy |
| --- | ---: | ---: | ---: |
| snippet | 5 | ~45% | 43.2% |
| full page | 5 | ~45% | 100.0% *(degenerate — see below)* |
| **full page** | **1** | **9%** | **90.9%** |

Returning **fewer pages with more of each** doubled accuracy.

**The 100% is not a real result.** This wiki is 11 pages / 18 KB, so `k=5` full
pages hands over ~45% of the entire corpus and even retrieval *misses* score
100%. The k=1 number is the one that generalises: one page, 9% of the corpus,
90.9% correct. Reported rather than quietly banked.

## Sixth defect: none of the retrieval work reached real users

qmd lets `--files` override `--json`, so default `wiki query` emitted **CSV**.
`hitCount()` read that as zero hits, so every default-mode query took the failure
path, burned one probe per term, found "nothing", and returned raw CSV. Every
retrieval fix from round 1 only ever applied to `--chunks` — the mode the
benchmark passes. The benchmark was exercising a path its own users do not take.

## Negative results worth keeping

- **Content is not the lever** (Lane C). Every content edit made retrieval worse:
  BM25 is corpus-relative, so editing one page shifts IDF for all others, and
  replacing a terse stale claim with an accurate paragraph diluted term density.
  It did find 4 genuine documentation errors, worth fixing on their own merit.
- **Embeddings are not worth it** (Lane D). +13pt recall@3, but −9 to −16pt
  recall@1, 44× slower (0.55s → 24.5s p50), 2.25 GB of models with no offline
  fallback, and silent degradation on a stale index — which breaks the wiki's
  fail-loud contract. Wall A1 is defensible on evidence, not preference.
- **Ranking was never the problem** (Lane B). All 16 remaining failures were
  recall, not mis-ranking, so reranking and title-boosting were ruled out before
  any code was written.
- **The ±9pt "measurement noise" was self-inflicted.** Serialised, the eval is
  perfectly deterministic — three paired rounds, byte-identical. Running lanes
  concurrently bought throughput and cost measurement precision.

## Recommended next

1. Make `--full` the default for `wiki query`, or have `SCHEMA.md` instruct the
   LLM to pass it. The accuracy difference is 43.2% → 90.9%.
2. Re-measure on a larger wiki before trusting any of this at scale; 11 pages is
   too small for the k=5 result to mean anything.
3. DKR-7: why does one query cost ~3s? Suspects are node startup, qmd startup,
   and up to 12 sequential probe spawns on the backoff path.
