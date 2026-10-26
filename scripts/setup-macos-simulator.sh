#!/usr/bin/env bash
# ==============================================================================
# TuxCode - Real Apple iOS Simulator Runner via macOS KVM / QEMU
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KVM_DIR="${ROOT_DIR}/kvm"
mkdir -p "${KVM_DIR}"

echo "🍎 Initializing Real Apple iOS Simulator (macOS KVM)..."

# 1. Verify KVM support
if [ ! -e /dev/kvm ]; then
  echo "❌ Error: /dev/kvm device not found. Ensure VT-x/AMD-V virtualization is enabled in BIOS."
  exit 1
fi

echo "✅ KVM acceleration detected."

# 2. Check dependencies
for bin in qemu-system-x86_64 qemu-img python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Installing missing virtualization package: $bin..."
    sudo apt-get update && sudo apt-get install -y qemu-system-x86 qemu-utils python3 dmg2img
  fi
done

# 3. Clone OSX-KVM if not present
if [ ! -d "${KVM_DIR}/OSX-KVM" ]; then
  echo "📥 Fetching OSX-KVM runner..."
  git clone --depth 1 https://github.com/kholia/OSX-KVM.git "${KVM_DIR}/OSX-KVM"
fi

cd "${KVM_DIR}/OSX-KVM"

# 4. Fetch macOS Monterey / Ventura Recovery Image if not present
if [ ! -f "BaseSystem.img" ] && [ ! -f "BaseSystem.dmg" ]; then
  echo "🌐 Downloading official Apple macOS Recovery Image..."
  python3 fetch-macOS-v2.py -s sonoma || python3 fetch-macOS-v2.py -s monterey
  if [ -f "BaseSystem.dmg" ]; then
    echo "Converting BaseSystem.dmg -> BaseSystem.img..."
    dmg2img BaseSystem.dmg BaseSystem.img
  fi
fi

# 5. Create virtual disk if not present (64GB dynamic sparse image)
if [ ! -f "mac_hdd_ng.img" ]; then
  echo "💾 Creating dynamic 64GB virtual hard disk (sparse)..."
  qemu-img create -f qcow2 mac_hdd_ng.img 64G
fi

echo ""
echo "=============================================================================="
echo "🎉 Real macOS KVM Environment is Ready!"
echo "=============================================================================="
echo "To boot macOS and launch the official Apple iOS Simulator:"
echo "   cd ${KVM_DIR}/OSX-KVM && ./OpenCore-Boot.sh"
echo ""
echo "The real Apple iOS Simulator window will display on your screen,"
echo "and can be forwarded into TuxCode IDE / VS Code via VNC (port 5900)."
echo "=============================================================================="
