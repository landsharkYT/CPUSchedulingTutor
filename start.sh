#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v npm >/dev/null 2>&1; then
  printf 'npm is required to start CPU Scheduling Lab.\n' >&2
  exit 1
fi

if [[ ! -x node_modules/.bin/vite ]]; then
  printf 'Installing dependencies from package-lock.json...\n'
  npm ci
fi

server_pid=''
stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}

trap 'stop_server; exit 130' INT
trap 'stop_server; exit 143' TERM
trap stop_server EXIT

printf 'Starting CPU Scheduling Lab. Press Ctrl+C to stop.\n'
./node_modules/.bin/vite --host 127.0.0.1 &
server_pid=$!
status=0
wait "$server_pid" || status=$?
exit "$status"
