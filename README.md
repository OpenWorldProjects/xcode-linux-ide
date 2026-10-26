# 🐧 TuxCode & tuxcodebuild

**Universal Linux & WSL2 Xcode Alternative Suite for Native iOS & React Native Development**

TuxCode is an open-source development suite that enables building, running, debugging, and screen-mirroring native iOS and React Native applications directly on Linux and Windows 11 (WSL2) without macOS hardware.

---

## Architecture Overview

```
                                      [ TuxCode Suite ]
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      │                                      │                                      │
      ▼                                      ▼                                      ▼
[ Standalone IDE ]                 [ VS Code Extension ]                 [ CLI Toolchain ]
  tuxcode (Port 3000)                vscode-tuxcode                        tuxcodebuild
  - Xcode 16 Dark UI                 - Activity Bar Tree                   - Workspace Parser
  - Scheme & Device Selector         - Status Bar Device Info              - Ninja Generator
  - Integrated USB Mirror            - In-Editor Live Mirror Tab           - Clang 21 + ld64.lld
  - Real-time Console                - 1-Click Build & Run                 - rcodesign Code Signer
  - 0.0.0.0 WSL Remote Access        - Packaged VSIX                       - CocoaPods Shims
             │                                      │                                      │
             └──────────────────────────────────────┴──────────────────────────────────────┘
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         ▼                                                     ▼
              [ Physical iPhone Device ]                              [ Linux iOS Simulator ]
              - Direct USB Cable Connection (43+ FPS)                 - isim (SpringBoard & UIKit)
              - Windows 11 WSL2 usbipd Passthrough                    - Zero Code Signing Needed
              - go-ios Automation & Lockdown                          - Keyboard & Mouse Touch
```

---

## Key Components

| Component | Path | Description |
| :--- | :--- | :--- |
| **`setup.sh`** | `./setup.sh` | Turnkey 1-command installer for Linux & WSL2 |
| **`tuxcode`** | `bin/tuxcode` | Standalone Xcode clone IDE (Port 3000, 0.0.0.0 WSL friendly) |
| **`tuxsim`** | `bin/tuxsim` | Real Apple iOS Simulator Suite (macOS KVM + noVNC Web Display) |
| **`tuxmirror`** | `bin/tuxmirror` | High-speed direct USB screen mirror & touch server (Port 8080) |
| **`tuxcodebuild`** | `bin/tuxcodebuild` | CLI compiler replacing `xcodebuild` |
| **VS Code VSIX** | `vscode-tuxcode-0.1.0.vsix` | Ready-to-install VS Code extension package |
| **Compiler** | `toolchain/clang` | LLVM Clang 21 with Darwin iOS arm64 cross-compilation |
| **Mach-O Linker** | `toolchain/ld64.lld` | LLD Mach-O linker with `-platform_version` support |
| **Build Engine** | `toolchain/ninja` | High-speed parallel build graph runner |
| **Apple SDK** | `sdk/iPhoneOS.sdk` | Slim Apple iOS SDK headers and `.tbd` symbols |
| **Code Signer** | `bin/rcodesign` | Pure Rust Apple code signing tool (ad-hoc & p12/profile) |
| **Linux Simulator** | `bin/isim` | Native Linux iOS Simulator (SpringBoard, UIKit, SwiftUI) |
| **Device Daemon** | `bin/ios` | High-speed Apple lockdown & USB communication engine |

---

## ⚡ 1-Minute Quick Start

### Step 1: Run Turnkey Setup
```bash
git clone https://github.com/openworldprojects/xcode-linux-ide.git
cd xcode-linux-ide
./setup.sh
```

### Step 2: Launch TuxCode IDE
```bash
./bin/tuxcode
```
Open **`http://localhost:3000`** in your browser (or `http://<WSL-IP>:3000` from Windows).
- Project Navigator sidebar with file tree
- Syntax-highlighted code editor
- Integrated live iPhone screen mirror panel
- Real-time build & run console
- Keyboard shortcuts: `Ctrl+B` (Build), `Ctrl+R` (Run)

---

## 🪟 Windows 11 + WSL2 Setup Guide

To connect your physical iPhone to WSL2 Ubuntu over USB:

### 1. Install `usbipd-win` on Windows
Open Windows PowerShell (as Administrator):
```powershell
winget install usbipd
```

### 2. Share & Attach your iPhone to WSL2
Plug in your iPhone via USB, unlock it, and run in PowerShell (Admin):
```powershell
# 1. List connected USB devices
usbipd list

# Look for: Apple Mobile Device (e.g. BUSID 1-4)

# 2. Bind the device (one-time)
usbipd bind --busid 1-4

# 3. Attach to WSL2
usbipd attach --wsl --busid 1-4
```

### 3. Verify Inside WSL2 Ubuntu
Inside your WSL terminal:
```bash
tuxcodebuild doctor
```
Your iPhone (e.g. `Connected iPhone (iPhone17,2)`) will be recognized immediately over USB!

---

## 💻 VS Code Extension

TuxCode includes a packaged extension: **`vscode-tuxcode-0.1.0.vsix`**.

### Installation (Windows 11 or Linux)
1. **If using Windows 11**: Open your project in VS Code connected to WSL:
   - In your WSL terminal, run: `code .` (or in Windows VS Code, click the green `><` button in the bottom-left and choose **"Connect to WSL"**).
2. In VS Code, press `Ctrl+Shift+X` (Extensions).
3. Click the `...` menu in the top-right of the Extensions panel.
4. Select **"Install from VSIX..."** and choose `vscode-tuxcode-0.1.0.vsix`.

### Features
- **Activity Bar View**: Browse connected iOS devices and trigger 1-click actions.
- **Status Bar**: Real-time connected device and USB status (`📱 Connected iPhone`).
- **Command Palette (`Ctrl+Shift+P`)**:
  - `TuxCode: Build iOS Project`
  - `TuxCode: Run on Connected iPhone`
  - `TuxCode: Open Live iPhone Screen Mirror` (opens a live device tab beside your code!)
  - `TuxCode: Run Toolchain Doctor`

---

## 📱 Code Signing & Physical iPhone Running

### Why does physical iOS show "Integrity could not be verified"?
Non-jailbroken physical iPhones enforce **AMFI (Apple Mobile File Integrity)**. Ad-hoc/self-signed apps are rejected unless signed with an Apple Developer Certificate and an `embedded.mobileprovision` listing your device's UDID.

### How to Sign for Physical Devices:
When building for your real iPhone with a certificate:
```bash
# Provide your .p12 and .mobileprovision:
tuxcodebuild build /path/to/project/ios \
  --p12=developer.p12 \
  --p12-password=secret \
  --profile=development.mobileprovision

# Run directly on device:
tuxcodebuild run /path/to/project/ios
```

### On First Launch on iOS 16/17/18:
1. Open **Settings** on your iPhone.
2. Go to **General** ➔ **VPN & Device Management**.
3. Under *Developer App*, tap your certificate and choose **Trust**.

---

## 🧪 Linux iOS Simulator (`isim`)

For fast local UI testing without code signing restrictions:
```bash
# Boot the iOS Simulator with SpringBoard
./bin/isim boot

# Build and run an app in the simulator
./bin/isim run build/Payload/YourApp.app
```
- Click to touch, drag to swipe
- Swipe up from the bottom edge (or `Ctrl+Shift+H`) to go Home
- Supports iOS 17 & 18 layouts

---

## 📦 React Native 0.86 & CocoaPods Compatibility

TuxCode handles:
- React Native 0.86+ New Architecture TurboModules & Fabric
- Wix Navigation (`react-native-navigation` 8.8.11)
- CocoaPods dependencies via Linux compatibility shims (`xcrun`, `xcodebuild`, `xcode-select`)
- `.xcworkspace` and `.xcodeproj` project structure parsing
