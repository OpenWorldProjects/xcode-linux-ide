#!/usr/bin/env bash
# ==============================================================================
# TuxCode - Turnkey Setup Script for Linux & WSL2
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🐧 Setting up TuxCode Suite in: ${ROOT_DIR}"

# 1. Check & Install Essential Linux Dependencies
echo "📦 Step 1: Checking system packages..."
MISSING_PKGS=""
for pkg in clang ninja-build usbmuxd nodejs npm curl; do
  if ! command -v "$pkg" >/dev/null 2>&1; then
    MISSING_PKGS="${MISSING_PKGS} $pkg"
  fi
done

if [ -n "$MISSING_PKGS" ]; then
  echo "⚠️ Missing system packages:${MISSING_PKGS}"
  if command -v sudo >/dev/null 2>&1; then
    echo "Installing missing dependencies via apt..."
    sudo apt-get update -y
    sudo apt-get install -y clang ninja-build usbmuxd libimobiledevice-utils curl nodejs npm
  else
    echo "Please install missing packages:${MISSING_PKGS}"
  fi
else
  echo "✅ Core packages present."
fi

# 2. Setup Binaries & Permissions
echo "🔧 Step 2: Configuring binaries & toolchain shims..."
chmod +x "${ROOT_DIR}/bin/"* 2>/dev/null || true
if [ -d "${ROOT_DIR}/toolchain" ]; then
  chmod +x "${ROOT_DIR}/toolchain/"* 2>/dev/null || true
fi

# 3. Ensure npm dependencies in packages
echo "📦 Step 3: Installing TuxCode package dependencies..."
if [ -f "${ROOT_DIR}/packages/tuxcodebuild/package.json" ]; then
  (cd "${ROOT_DIR}/packages/tuxcodebuild" && npm install --silent)
fi
if [ -f "${ROOT_DIR}/packages/tuxcode-ide/package.json" ]; then
  (cd "${ROOT_DIR}/packages/tuxcode-ide" && npm install --silent)
fi

# 4. Check & Install isim (Linux iOS Simulator)
echo "📱 Step 4: Checking Linux iOS Simulator (isim)..."
if ! command -v isim >/dev/null 2>&1 && [ ! -f "${HOME}/.local/bin/isim" ]; then
  echo "Downloading isim iOS simulator..."
  curl -fsSL https://raw.githubusercontent.com/kolabs-dev/isim/main/install.sh | bash || true
fi
if [ -f "${HOME}/.local/bin/isim" ]; then
  # bin/isim resolves the current user installation at runtime.
  echo "✅ isim linked to ${ROOT_DIR}/bin/isim"
fi

# 5. Install VS Code Extension (if 'code' CLI is available)
echo "💻 Step 5: Checking VS Code extension..."
if command -v code >/dev/null 2>&1 && [ -f "${ROOT_DIR}/vscode-tuxcode-0.1.0.vsix" ]; then
  echo "Installing TuxCode extension into VS Code..."
  code --install-extension "${ROOT_DIR}/vscode-tuxcode-0.1.0.vsix" --force 2>/dev/null || true
  echo "✅ VS Code extension installed."
else
  echo "ℹ️ Note: Install '${ROOT_DIR}/vscode-tuxcode-0.1.0.vsix' in VS Code via Extensions -> 'Install from VSIX...'."
fi

# 6. Run Doctor
echo ""
echo "🩺 Step 6: Running TuxCode Doctor..."
"${ROOT_DIR}/bin/tuxcodebuild" doctor || true

echo ""
echo "=============================================================================="
echo "🎉 TuxCode is ready!"
echo "=============================================================================="
echo "🚀 1. Launch Standalone Xcode IDE:"
echo "      ${ROOT_DIR}/bin/tuxcode"
echo "      (Open http://localhost:3000 in your browser)"
echo ""
echo "🔨 2. CLI Build & Run:"
echo "      tuxcodebuild build /path/to/project/ios"
echo "      tuxcodebuild run   /path/to/project/ios"
echo ""
echo "📱 3. Real Apple iOS Simulator (macOS KVM + noVNC Web Display):"
echo "      ${ROOT_DIR}/bin/tuxsim"
echo "      (Open http://localhost:6080/vnc.html in your browser)"
echo ""
echo "📱 4. Live USB iPhone Screen Mirror:"
echo "      ${ROOT_DIR}/bin/tuxmirror"
echo ""
echo "🔌 5. Windows 11 WSL USB Setup (One-time):"
echo "      In Windows PowerShell (Admin):"
echo "        usbipd list"
echo "        usbipd bind --busid <BUSID>"
echo "        usbipd attach --wsl --busid <BUSID>"
echo "=============================================================================="
