#!/usr/bin/env bash
# Minimal native simulator + web IDE setup for Ubuntu 24.04 in WSL2.
set -euo pipefail
if [[ "$(uname -m)" != x86_64 ]]; then
  echo 'This isim setup currently requires x86_64 WSL2.' >&2
  exit 1
fi
if ! command -v apt-get >/dev/null; then
  echo 'Use Ubuntu 24.04 in WSL2 for this setup.' >&2
  exit 1
fi
sudo apt-get update
sudo apt-get install -y nodejs curl ca-certificates python3 fontconfig adwaita-icon-theme
if [[ ! -x "$HOME/.local/bin/isim" ]]; then
  installer=$(mktemp)
  trap 'rm -f "$installer"' EXIT
  curl --fail --show-error --location \
    https://raw.githubusercontent.com/kolabs-dev/isim/main/install.sh -o "$installer"
  bash "$installer" --no-desktop
fi
"$HOME/.local/bin/isim" version
echo 'Ready. Run ./scripts/start-wsl.sh, then open http://localhost:3000 in Windows.'
