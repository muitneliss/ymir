#!/usr/bin/env bash
# Provision everything the wiki benchmark needs. Idempotent.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH="$(dirname "$HERE")"
REPO="$(dirname "$BENCH")"

QMD_VERSION="${QMD_VERSION:-latest}"
HARNESS_DIR="$BENCH/.vendor/memory-benchmarks"

echo "==> 1/5  wiki CLI bundle"
(cd "$REPO/plugins/ymir/wiki-cli" && bun install --frozen-lockfile >/dev/null && bun run build >/dev/null)
test -f "$REPO/plugins/ymir/wiki-cli/dist/cli.js"
echo "    built dist/cli.js"

echo "==> 2/5  qmd (the wiki's retrieval engine)"
# `bun install -g` lands binaries in ~/.bun/bin, which is often not on PATH.
BUN_BIN="${BUN_INSTALL:-$HOME/.bun}/bin"
export PATH="$BUN_BIN:$PATH"
if command -v qmd >/dev/null 2>&1; then
  echo "    already installed: $(qmd --version 2>&1 | head -1)"
else
  bun install -g "@tobilu/qmd@${QMD_VERSION}" >/dev/null
  command -v qmd >/dev/null 2>&1 || { echo "    ERROR: qmd not on PATH after install"; exit 1; }
  echo "    installed: $(qmd --version 2>&1 | head -1)"
fi
echo "    NOTE: the shim and any benchmark run need qmd on PATH:"
echo "          export PATH=\"$BUN_BIN:\$PATH\""

echo "==> 3/5  upstream harness (pristine clone, never edited)"
if [ -d "$HARNESS_DIR/.git" ]; then
  git -C "$HARNESS_DIR" fetch --depth 1 origin main -q && git -C "$HARNESS_DIR" reset --hard -q origin/main
  echo "    updated"
else
  git clone --depth 1 -q https://github.com/mem0ai/memory-benchmarks.git "$HARNESS_DIR"
  echo "    cloned"
fi
git -C "$HARNESS_DIR" rev-parse --short HEAD | sed 's/^/    harness commit /'

echo "==> 4/5  python env"
VENV="$BENCH/.venv"
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$BENCH/shim/requirements.txt"
"$VENV/bin/pip" install -q -r "$HARNESS_DIR/requirements.txt"
echo "    ready: $VENV"

echo "==> 5/5  preflight"
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "    WARNING: ANTHROPIC_API_KEY is not set — required before any benchmark run."
else
  echo "    ANTHROPIC_API_KEY present"
fi

cat <<EOF

Setup complete. Next:

  # terminal 1 — the shim (arm A)
  WIKI_SHIM_MODE=raw WIKI_SHIM_WORKSPACE=$BENCH/.workspace/raw \\
    $VENV/bin/python -m uvicorn app:app --app-dir $BENCH/shim --port 8899

  # terminal 2 — the pilot
  bash $HERE/run-locomo.sh raw --conversations 1

EOF
