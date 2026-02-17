#!/usr/bin/env bash

set -u -o pipefail

readonly MODE="${1:-auto}"
LAST_LOG_FILE=""
LAST_EXIT_CODE=0

usage() {
  cat <<'EOF'
Usage: scripts/build-next.sh [auto|bun|node]

Modes:
  auto (default): Bun primary -> Bun retry on known transient failures -> Node fallback
  bun:            Bun-only build
  node:           Node-only build
EOF
}

run_step() {
  local label="$1"
  shift

  local log_file
  log_file="$(mktemp -t "build-next-${label//[^a-zA-Z0-9]/_}-XXXX.log")"

  echo "==> BUILD_STEP=${label}"
  if "$@" 2>&1 | tee "${log_file}"; then
    LAST_LOG_FILE="${log_file}"
    LAST_EXIT_CODE=0
    echo "==> BUILD_STEP=${label} STATUS=success LOG=${log_file}"
    return 0
  else
    local exit_code=$?
    LAST_LOG_FILE="${log_file}"
    LAST_EXIT_CODE=${exit_code}
    echo "==> BUILD_STEP=${label} STATUS=failed EXIT_CODE=${exit_code} LOG=${log_file}"
    return "${exit_code}"
  fi
}

is_known_bun_transient_failure() {
  local log_file="$1"
  grep -Fq "failed to deserialize message" "${log_file}" && return 0
  grep -Fq "failed to receive message" "${log_file}" && return 0
  grep -Fq "Cannot find module '../package.json'" "${log_file}" && return 0
  return 1
}

clear_next_cache() {
  if [[ -d ".next/cache" ]]; then
    echo "==> Clearing .next/cache before Bun retry"
    rm -rf .next/cache
  fi
}

run_bun() {
  run_step "$1" bun --bun next build
}

run_node() {
  run_step "$1" node node_modules/next/dist/bin/next build
}

run_auto() {
  if run_bun "bun-primary"; then
    echo "BUILD_RUNTIME_PATH=bun-primary"
    return 0
  fi

  local first_exit_code=${LAST_EXIT_CODE}
  local first_log_file="${LAST_LOG_FILE}"
  if ! is_known_bun_transient_failure "${first_log_file}"; then
    echo "==> Bun build failed with a non-transient error; skipping fallback"
    return "${first_exit_code}"
  fi

  clear_next_cache
  if run_bun "bun-retry"; then
    echo "BUILD_RUNTIME_PATH=bun-retry"
    return 0
  fi

  local second_exit_code=${LAST_EXIT_CODE}
  local second_log_file="${LAST_LOG_FILE}"
  if ! is_known_bun_transient_failure "${second_log_file}"; then
    echo "==> Bun retry failed with a non-transient error; skipping fallback"
    return "${second_exit_code}"
  fi

  echo "==> Falling back to Node runtime for Next.js build"
  if run_node "node-fallback"; then
    echo "BUILD_RUNTIME_PATH=node-fallback"
    return 0
  fi

  return "${LAST_EXIT_CODE}"
}

case "${MODE}" in
  auto)
    run_auto
    exit $?
    ;;
  bun)
    run_bun "bun-strict"
    if [[ ${LAST_EXIT_CODE} -eq 0 ]]; then
      echo "BUILD_RUNTIME_PATH=bun-strict"
    fi
    exit "${LAST_EXIT_CODE}"
    ;;
  node)
    run_node "node-only"
    if [[ ${LAST_EXIT_CODE} -eq 0 ]]; then
      echo "BUILD_RUNTIME_PATH=node-only"
    fi
    exit "${LAST_EXIT_CODE}"
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown mode: ${MODE}" >&2
    usage >&2
    exit 2
    ;;
esac
