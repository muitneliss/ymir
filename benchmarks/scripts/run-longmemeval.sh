#!/usr/bin/env bash
# Run LongMemEval against the wiki-backed shim.
#   ./run-longmemeval.sh raw --all-questions
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

ARM="${1:-raw}"; shift || true
case "$ARM" in raw|synth) ;; *) echo "usage: $0 <raw|synth> [harness args...]"; exit 1 ;; esac

preflight
start_services "$ARM"
run_bench benchmarks.longmemeval.run "$ARM" "$@"
stop_all
echo "done — results under benchmarks/results/raw/benchmarks.longmemeval.run/$ARM"
