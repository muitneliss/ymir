#!/usr/bin/env bash
# Run LoCoMo against the wiki-backed shim.
#   ./run-locomo.sh raw                        # full run, arm A
#   ./run-locomo.sh synth --conversations 0,1  # pilot, arm B
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

ARM="${1:-raw}"; shift || true
case "$ARM" in raw|synth) ;; *) echo "usage: $0 <raw|synth> [harness args...]"; exit 1 ;; esac

preflight
start_shim "$ARM"
run_bench benchmarks.locomo.run "$ARM" "$@"
stop_shim
echo "done — results under benchmarks/results/raw/benchmarks.locomo.run/$ARM"
