#!/usr/bin/env bash
# Run INSIDE a provisioned macOS guest as its logged-in desktop user.
# Xcode, its license/first-launch setup, and the chosen runtime must exist already.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This script must run inside macOS, not on the Linux/WSL host.' >&2
  exit 1
fi
: "${TUXCODE_SIMULATOR_UDID:?Set the UDID from xcrun simctl list devices available}"
xcrun simctl list devices available --json | python3 -c '
import json, os, subprocess, sys
udid = os.environ["TUXCODE_SIMULATOR_UDID"]
devices = [d for group in json.load(sys.stdin)["devices"].values() for d in group]
match = next((d for d in devices if d["udid"] == udid and d.get("isAvailable")), None)
if match is None:
    sys.exit("Selected simulator is unavailable; install its runtime or select another UDID.")
if match["state"] != "Booted":
    subprocess.run(["xcrun", "simctl", "boot", udid], check=True)
'
xcrun simctl bootstatus "$TUXCODE_SIMULATOR_UDID" -b
open -a Simulator --args -CurrentDeviceUDID "$TUXCODE_SIMULATOR_UDID"
echo 'Simulator boot completed.'
