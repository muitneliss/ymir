# Benchmarking the Ymir wiki as a memory system

Runs [`mem0ai/memory-benchmarks`](https://github.com/mem0ai/memory-benchmarks)
(LoCoMo + LongMemEval) against the Ymir wiki CLI, to answer: **how good is the
wiki at being a memory?**

See [`PLAN.md`](./PLAN.md) for the full design and rationale.

## How it works

The harness hardcodes `Mem0Client(...)`, but in `oss` mode that is a plain HTTP
client aimed at `--mem0-host`, and it only ever calls three endpoints. So rather
than fork the harness, we reimplement its API surface over the wiki CLI:

```
memory-benchmarks (pristine clone)  ──HTTP──▶  shim/app.py  ──subprocess──▶  wiki CLI ──▶ qmd
```

The harness is cloned into `.vendor/` and **never edited**, so it stays
upgradable with a `git pull`.

| mem0 endpoint | wiki realisation |
| --- | --- |
| `POST /memories` | buffer turns by session → `wiki ingest` (+ `wiki note` in arm B) |
| `POST /search` | `wiki query --limit N --chunks` → qmd BM25 hits as memory items |
| `DELETE /memories?user_id=` | drop that tenant's wiki tree |

## The two arms

The wiki CLI deliberately does not summarise — `SCHEMA.md` puts that on the
calling LLM. So a single number would be ambiguous. We run both:

- **`raw`** — session transcript written verbatim. Measures BM25 over the page schema.
- **`synth`** — Anthropic summarises each session into a source page plus entity/concept
  notes, as a real wiki session would. Measures the schema *plus* the synthesis discipline.

**`synth − raw` is the headline number:** what the wiki's write discipline is actually worth.

## Two deliberate adaptations (both documented, neither hidden)

1. **Session-level pages.** The harness ingests one *turn* per `add` call
   (`CHUNK_SIZE = 1`). One wiki page per utterance is quadratic — every `ingest`
   revalidates the whole wiki — and pathological as a wiki. The shim buffers
   turns by the `timestamp` the harness sends (which changes at session
   boundaries) and writes one page per session. Same information, wiki-native
   granularity, applied identically to both arms. Set
   `WIKI_SHIM_GRANULARITY=turn` to disable.
2. **Chunk-level retrieval.** `wiki query` defaults to `--files` (whole pages).
   A page is not a memory item, so top-k would not be comparable to mem0's
   atomic facts. The shim passes `--chunks`.

## Running

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bash scripts/setup.sh                          # build CLI, install qmd, clone harness, venv
export PATH="$HOME/.bun/bin:$PATH"             # qmd lives here

bash scripts/run-locomo.sh raw --conversations 0,1   # pilot first
bash scripts/run-locomo.sh raw                       # full
bash scripts/run-locomo.sh synth
bash scripts/run-longmemeval.sh raw --all-questions
```

Defaults live in `scripts/_common.sh` (`PROVIDER`, `ANSWERER_MODEL`,
`JUDGE_MODEL`); override by exporting them.

**Run the pilot before any full run.** A full matrix is ~12,800 judged LLM calls.

## Bugs this work found in the wiki CLI

Building the adapter surfaced two shipped defects in the wiki's read path. Both
are fixed at the root in `plugins/ymir/wiki-cli` — the benchmark exercises the
real code path, so it could not have proceeded around them.

1. **`wiki query` was not scoped to its own collection.** It called
   `qmd search` with no `-c`, so it searched *every qmd collection on the
   machine* — wrong results plus a cross-project information leak.
2. **`wiki reindex` never refreshed the index.** It called
   `qmd collection add`, which exits non-zero on an existing collection and
   indexes nothing; the failure was swallowed as "skipping". After the first
   ingest, **every subsequent page was permanently invisible to search.** The
   re-index path is `qmd update`.

Verified against qmd 2.5.3.

## Layout

```
benchmarks/
├── PLAN.md              design + rationale
├── shim/                the mem0-compatible service
│   ├── app.py           endpoints, session buffering, per-tenant locking
│   ├── wiki_backend.py  typed subprocess driver for the wiki CLI
│   ├── tenancy.py       user_id → wiki root + qmd collection
│   └── synthesiser.py   arm B: Anthropic session → source page + notes
├── scripts/             setup + run wrappers
├── results/             curated reports (raw outputs gitignored)
└── .vendor/             pristine harness clone (gitignored)
```
