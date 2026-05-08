#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required to run tests. Install it from https://docs.astral.sh/uv/" >&2
  exit 127
fi

exec uv run --extra dev pytest "$@"
