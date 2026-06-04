#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/node-v22.22.2/bin:$PATH"

PI_AGENT_BIN="${PI3GROQ_PI_AGENT_BIN:-$HOME/.local/bin/pi-agent}"

if [ ! -x "$PI_AGENT_BIN" ]; then
  echo "PiAgent was not found at $PI_AGENT_BIN" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  exec "$PI_AGENT_BIN" --resume
fi

exec "$PI_AGENT_BIN" "$@"
