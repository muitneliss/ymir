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
