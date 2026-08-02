# Shared plumbing for the benchmark run scripts. Sourced, not executed.
# shellcheck shell=bash

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH="$(dirname "$HERE")"
REPO="$(dirname "$BENCH")"
HARNESS="$BENCH/.vendor/memory-benchmarks"
VENV="$BENCH/.venv"
PORT="${WIKI_SHIM_PORT:-8899}"
LLM_PORT="${CLAUDE_PROXY_PORT:-8898}"

export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$HOME/.local/bin:$PATH"

# Local secrets (CLAUDE_CODE_OAUTH_TOKEN). Gitignored; see README.
# shellcheck source=/dev/null
[ -f "$BENCH/.env.local" ] && . "$BENCH/.env.local"

# Answering and judging run through Claude Code headless, not a metered API key.
PROVIDER="${PROVIDER:-anthropic}"
ANSWERER_MODEL="${ANSWERER_MODEL:-claude-sonnet-5}"
JUDGE_MODEL="${JUDGE_MODEL:-claude-sonnet-5}"

# The Anthropic SDK reads these; the proxy speaks the Messages API.
export ANTHROPIC_BASE_URL="http://localhost:$LLM_PORT"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-unused-routed-through-claude-code}"

SHIM_PID=""
LLM_PID=""

preflight() {
  command -v qmd >/dev/null 2>&1 || { echo "FATAL: qmd not on PATH — run scripts/setup.sh"; exit 1; }
  command -v claude >/dev/null 2>&1 || { echo "FATAL: claude CLI not on PATH"; exit 1; }
  [ -f "$REPO/plugins/ymir/wiki-cli/dist/cli.js" ] || { echo "FATAL: wiki CLI not built — run scripts/setup.sh"; exit 1; }
  [ -d "$HARNESS" ] || { echo "FATAL: harness not cloned — run scripts/setup.sh"; exit 1; }

  # Fail in seconds on an expired login rather than after hundreds of questions.
  # `claude -p` occasionally hangs and aborts, so a single failure is not proof
  # of a bad credential — retry before condemning it.
  echo "checking claude authentication..."
  local probe attempt
  for attempt in 1 2 3; do
    probe="$(cd /tmp && echo 'Reply with exactly: PONG' \
      | timeout 120 claude -p --output-format json --model "$ANSWERER_MODEL" \
          --system-prompt 'Reply with the answer only.' \
          --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' 2>&1)" || true

    if echo "$probe" | grep -qiE '"(is_error|error)":true.*(authenticate|oauth)|Failed to authenticate'; then
      echo "FATAL: claude CLI is not authenticated."
      echo "  Run 'claude login', or export CLAUDE_CODE_OAUTH_TOKEN in benchmarks/.env.local"
      exit 1
    fi
    if echo "$probe" | grep -q "PONG"; then
      echo "claude authenticated (attempt $attempt)"
      return 0
    fi
    echo "  probe attempt $attempt did not return PONG; retrying..."
  done

  echo "FATAL: claude auth probe failed 3 times. Last output:"
  echo "$probe" | tail -c 400
  exit 1
}

start_llm_proxy() {
  "$VENV/bin/python" -m uvicorn claude_proxy:app --app-dir "$BENCH/shim" \
      --port "$LLM_PORT" --log-level warning > "$BENCH/.workspace/llm-proxy.log" 2>&1 &
  LLM_PID=$!
  for _ in $(seq 1 60); do
    curl -sf "localhost:$LLM_PORT/health" >/dev/null 2>&1 && { echo "llm proxy up (pid=$LLM_PID)"; return 0; }
    sleep 0.5
  done
  echo "FATAL: llm proxy did not become healthy; see $BENCH/.workspace/llm-proxy.log"
  exit 1
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

  for _ in $(seq 1 60); do
    curl -sf "localhost:$PORT/health" >/dev/null 2>&1 && { echo "shim up (arm=$arm, pid=$SHIM_PID)"; return 0; }
    sleep 0.5
  done
  echo "FATAL: shim did not become healthy; see $BENCH/.workspace/shim-$arm.log"
  exit 1
}

stop_all() {
  [ -n "$SHIM_PID" ] && kill "$SHIM_PID" 2>/dev/null || true
  [ -n "$LLM_PID" ] && kill "$LLM_PID" 2>/dev/null || true
  SHIM_PID=""; LLM_PID=""
}

start_services() {
  mkdir -p "$BENCH/.workspace"
  trap stop_all EXIT INT TERM
  start_llm_proxy
  start_shim "$1"
}

# run_bench <module> <arm> [extra harness args...]
run_bench() {
  local module="$1" arm="$2"; shift 2
  # Keep harness concurrency at or below the proxy's, so we don't queue up
  # hundreds of `claude -p` processes.
  local workers="${MAX_WORKERS:-${CLAUDE_PROXY_CONCURRENCY:-6}}"
  ( cd "$HARNESS" && "$VENV/bin/python" -m "$module" \
      --project-name "ymir-wiki-$arm" \
      --backend oss \
      --mem0-host "http://localhost:$PORT" \
      --provider "$PROVIDER" \
      --answerer-model "$ANSWERER_MODEL" \
      --judge-model "$JUDGE_MODEL" \
      --max-workers "$workers" \
      --output-dir "$BENCH/results/raw/$module/$arm" \
      "$@" )
}
