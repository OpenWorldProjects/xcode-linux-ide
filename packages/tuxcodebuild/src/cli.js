#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$1" == "-version" ]]; then
  echo "Xcode 16.0"
  echo "Build version 16A300"
  exit 0
fi

exec "${ROOT_DIR}/bin/tuxcodebuild" "$@"
