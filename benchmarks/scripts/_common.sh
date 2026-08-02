# Shared plumbing for the benchmark run scripts. Sourced, not executed.
# shellcheck shell=bash

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH="$(dirname "$HERE")"
REPO="$(dirname "$BENCH")"
HARNESS="$BENCH/.vendor/memory-benchmarks"
VENV="$BENCH/.venv"
PORT="${WIKI_SHIM_PORT:-8899}"

export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"

# Anthropic for answering and judging (chosen for this study).
PROVIDER="${PROVIDER:-anthropic}"
ANSWERER_MODEL="${ANSWERER_MODEL:-claude-sonnet-5}"
JUDGE_MODEL="${JUDGE_MODEL:-claude-sonnet-5}"

SHIM_PID=""

preflight() {
  command -v qmd >/dev/null 2>&1 || { echo "FATAL: qmd not on PATH — run scripts/setup.sh"; exit 1; }
  [ -f "$REPO/plugins/ymir/wiki-cli/dist/cli.js" ] || { echo "FATAL: wiki CLI not built — run scripts/setup.sh"; exit 1; }
  [ -d "$HARNESS" ] || { echo "FATAL: harness not cloned — run scripts/setup.sh"; exit 1; }
  [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "FATAL: ANTHROPIC_API_KEY is not set"; exit 1; }
}

# start_shim <arm: raw|synth>
start_shim() {
  local arm="$1"
  local workspace="$BENCH/.workspace/$arm"
  mkdir -p "$workspace"

  WIKI_SHIM_MODE="$arm" \
  WIKI_SHIM_WORKSPACE="$workspace" \
  "$VENV/bin/python" -m uvicorn app:app --app-dir "$BENCH/shim" \
      --port "$PORT" --log-level warning > "$BENCH/.workspace/shim-$arm.log" 2>&1 &
  SHIM_PID=$!
  trap stop_shim EXIT INT TERM

  for _ in $(seq 1 60); do
    curl -sf "localhost:$PORT/health" >/dev/null 2>&1 && { echo "shim up (arm=$arm, pid=$SHIM_PID)"; return 0; }
    sleep 0.5
  done
  echo "FATAL: shim did not become healthy; see $BENCH/.workspace/shim-$arm.log"
  exit 1
}

stop_shim() {
  [ -n "$SHIM_PID" ] && kill "$SHIM_PID" 2>/dev/null || true
  SHIM_PID=""
}

# run_bench <module> <arm> [extra harness args...]
run_bench() {
  local module="$1" arm="$2"; shift 2
  ( cd "$HARNESS" && "$VENV/bin/python" -m "$module" \
      --project-name "ymir-wiki-$arm" \
      --backend oss \
      --mem0-host "http://localhost:$PORT" \
      --provider "$PROVIDER" \
      --answerer-model "$ANSWERER_MODEL" \
      --judge-model "$JUDGE_MODEL" \
      --output-dir "$BENCH/results/raw/$module/$arm" \
      "$@" )
}
