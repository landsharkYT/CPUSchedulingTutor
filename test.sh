#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != '--browser' ) ]]; then
  printf 'Usage: %s [--browser]\n' "$0" >&2
  exit 2
fi

if ! command -v npm >/dev/null 2>&1; then
  printf 'npm is required to test CPU Scheduling Lab.\n' >&2
  exit 1
fi

if [[ ! -x node_modules/.bin/vitest || ! -x node_modules/.bin/vite || ! -x node_modules/.bin/tsc ]]; then
  printf 'Installing dependencies from package-lock.json...\n'
  npm ci
fi

npm test
npm run build

if [[ ${1:-} == '--browser' ]]; then
  npm run test:browser
fi
