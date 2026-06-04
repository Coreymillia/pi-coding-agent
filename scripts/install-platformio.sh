#!/usr/bin/env bash
set -euo pipefail

if command -v pio >/dev/null 2>&1; then
  echo "PlatformIO is already installed:"
  pio --version
  exit 0
fi

if command -v pipx >/dev/null 2>&1; then
  echo "Installing PlatformIO with pipx..."
  if pipx list 2>/dev/null | grep -q '^package platformio '; then
    pipx upgrade platformio
  else
    pipx install platformio
  fi
  pipx ensurepath || true
elif python3 -m pip --version >/dev/null 2>&1; then
  echo "Installing PlatformIO with python3 -m pip --user..."
  python3 -m pip install --user platformio
else
  echo "python3 -m pip or pipx is required to install PlatformIO." >&2
  exit 1
fi

if command -v pio >/dev/null 2>&1; then
  echo "PlatformIO installed:"
  pio --version
  exit 0
fi

if [ -x "$HOME/.local/bin/pio" ]; then
  echo "PlatformIO installed at $HOME/.local/bin/pio"
  "$HOME/.local/bin/pio" --version
  echo "Add \$HOME/.local/bin to PATH if 'pio' is still not found in new shells."
  exit 0
fi

echo "PlatformIO installation completed, but the pio binary was not found on PATH." >&2
exit 1
