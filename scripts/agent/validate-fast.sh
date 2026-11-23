#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

started_at="$(date +%s)"
report_elapsed() {
  local ended_at
  ended_at="$(date +%s)"
  echo "validate-fast elapsed: $((ended_at - started_at))s"
}
trap report_elapsed EXIT

# Resolve Python for offline Subconscious contract tests across main checkouts,
# isolated git worktrees, and CI runners without a prebuilt .venv.
resolve_python() {
  if [ -n "${PYTHON:-}" ]; then
    printf '%s\n' "$PYTHON"
    return 0
  fi
  if [ -x "$ROOT/.venv/bin/python" ]; then
    printf '%s\n' "$ROOT/.venv/bin/python"
    return 0
  fi
  local common_git_dir common_root
  common_git_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$common_git_dir" ]; then
    common_root="$(cd "$common_git_dir/.." 2>/dev/null && pwd || true)"
    if [ -n "$common_root" ] && [ -x "$common_root/.venv/bin/python" ]; then
      printf '%s\n' "$common_root/.venv/bin/python"
      return 0
    fi
  fi
  return 1
}

run_unittest_suite() {
  if [ -n "$PY_BIN" ]; then
    PYTHONPATH=backend:scripts/subconscious "$PY_BIN" -m unittest "$@"
  elif command -v uv >/dev/null 2>&1; then
    PYTHONPATH=backend:scripts/subconscious uv run --no-project --with jsonschema==4.25.1 python3 -m unittest "$@"
  else
    PYTHONPATH=backend:scripts/subconscious python3 -m unittest "$@"
  fi
}

run_models_pytest() {
  if [ -n "$PY_BIN" ]; then
    PYTHONPATH=backend "$PY_BIN" -m pytest --noconftest -q "$@"
  elif command -v uv >/dev/null 2>&1; then
    PYTHONPATH=backend uv run --no-project --with pytest --with httpx --with jsonschema==4.25.1 --with pydantic python3 -m pytest --noconftest -q "$@"
  else
    PYTHONPATH=backend python3 -m pytest --noconftest -q "$@"
  fi
}

PY_BIN="$(resolve_python || true)"

echo "==> Burn interview proof contracts"
run_unittest_suite \
  test_profile_context \
  test_eval_interview \
  test_structured_brief \
  test_requested_tool \
  test_research_startup \
  test_adversarial_uat \
  test_interviewer_comparison

echo "==> Burn background brief and research retry contracts"
run_unittest_suite \
  test_brief_background \
  test_brief_generations \
  test_research_job_retry \
  test_research_state_update

echo "==> Models chat tools contracts"
run_models_pytest \
  backend/tests/unit/onyx/server/test_models_page.py \
  backend/tests/unit/onyx/server/query_and_chat/test_model_tools.py

echo "==> validate-fast: PASS"
