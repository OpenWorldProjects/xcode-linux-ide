#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null; then
  echo 'Run ./scripts/setup-wsl.sh first.' >&2
  exit 1
fi
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo 'No desktop display detected. isim needs WSLg; run wsl --update on Windows and restart WSL.' >&2
fi
echo 'Open http://localhost:3000 in your Windows browser.'
echo 'Choose the third device option: isim (Linux Simulator), then Open isim.'
echo 'Keep this terminal open. Ctrl+C stops the IDE.'
exec node "$root_dir/packages/tuxcode-ide/src/server.js"
