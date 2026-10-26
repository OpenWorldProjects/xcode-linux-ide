# TuxCode

Linux and Windows 11/WSL2 tools for iOS development, with a browser IDE,
physical-device tooling, and the native Linux **isim** compatibility simulator.

## Windows work machine: simplest setup

Use **Windows 11, x86_64, Ubuntu 24.04 under WSL2**. The simulator opens through
WSLg as a desktop window. No macOS VM, Apple account, USB phone, or VS Code
extension is needed to try isim.

**1. One time, in Windows PowerShell as administrator:**

```powershell
wsl --install -d Ubuntu-24.04
wsl --update
```

Restart Windows if requested. Open **Ubuntu 24.04** from Start and finish creating
your Linux username/password. If your work machine already has this distribution,
use it. Corporate IT may need to enable WSL/virtualization and approve installation.

**2. In the Ubuntu terminal:**

```bash
sudo apt-get update && sudo apt-get install -y git
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/OpenWorldProjects/xcode-linux-ide.git
cd xcode-linux-ide
./scripts/setup-wsl.sh
./scripts/start-wsl.sh
```

The setup installs Ubuntu dependencies and downloads isim from its upstream
installer. It asks for your Ubuntu password for `sudo`. Keep the checkout in
`~/Projects`, rather than `/mnt/c`, for Linux filesystem performance.

**3. Open http://localhost:3000 in your Windows browser.**

Click the device dropdown beside **RNWixApp**, select the **third option,
isim (Linux Simulator)**, then click **Open isim**. The simulator opens in a
separate desktop window. Leave the Ubuntu terminal running; Ctrl+C stops the IDE.
The macOS/KVM option is a legacy alternative and is not needed for this workflow.

### Every subsequent session

Open Ubuntu and run:

```bash
cd ~/Projects/xcode-linux-ide
./scripts/start-wsl.sh
```

Or launch just the simulator:

```bash
~/Projects/xcode-linux-ide/bin/isim open
```

### Try your first app

In another Ubuntu terminal:

```bash
cd ~/Projects
./xcode-linux-ide/bin/isim new HelloWorld --uikit
cd HelloWorld
../xcode-linux-ide/bin/isim build -project HelloWorld.xcodeproj
../xcode-linux-ide/bin/isim run build/HelloWorld.app
```

This creates a separate sample project; run `new` only once. IDE Build/Run buttons
are disabled for isim because project deployment is not integrated yet. Use these
CLI commands for now. The bundled IDE navigator is a sample layout, not a complete
project-opening workflow; its RNWixApp sample sources are not shipped in this repo.

### Updating

Stop the IDE with Ctrl+C, then:

```bash
cd ~/Projects/xcode-linux-ide
git pull --ff-only
./scripts/start-wsl.sh
```

Reload your browser with **Ctrl+Shift+R**. This is also the fix if you still see the
old two-device selector. Restart the server after updates to enable new API routes.

### If something does not open

- **Port 3000 already in use:** stop the earlier IDE terminal/process, then retry.
- **No simulator window:** run `./bin/isim boot` in Ubuntu to see the error. Check
  `echo "$DISPLAY"` and `echo "$WAYLAND_DISPLAY"`. If both are empty, run
  `wsl --update` and `wsl --shutdown` in PowerShell, then reopen Ubuntu. Shutdown
  stops all your running WSL sessions, so save work first.
- **Missing isim:** rerun `./scripts/setup-wsl.sh`. A custom installation can be
  selected using `TUXCODE_ISIM_BIN=/absolute/path/to/isim`.
- **Blank sample editor:** the RNWixApp demo files are not included. Use the
  HelloWorld commands above; this is independent of simulator startup.

## Optional: Windows VS Code

Install Windows VS Code and Microsoft's WSL extension. From your Ubuntu project
folder run `code .`; check the lower-left indicator says **WSL: Ubuntu-24.04**.
Use its Ubuntu terminal for the same isim commands above.

The TuxCode extension source is in `packages/vscode-tuxcode`. The older 0.1.0 VSIX
has not been rebuilt with these changes; it is not required for the quick start.
For a newly packaged extension, set `tuxcode.toolchainRoot` to your Linux checkout
path, such as `/home/YOUR_USER/Projects/xcode-linux-ide`.

## Optional: physical iPhone over USB

The simulator setup does not install or configure the complete physical-device
pipeline. For USB passthrough, install usbipd-win in Windows PowerShell:

```powershell
winget install --interactive --exact dorssel.usbipd-win
usbipd list
# Substitute your iPhone BUSID. This first bind needs administrator privileges:
usbipd bind --busid 1-4
# With Ubuntu running, subsequent attaches do not normally need elevation:
usbipd attach --wsl --busid 1-4
```

Unlock the phone and accept Trust when prompted. Development installation also
requires valid Apple-issued signing credentials/profiles and Developer Mode where
applicable. Organization policy may restrict these actions. The helper
`scripts/attach-iphone.ps1` provides the same bind/attach steps.

## Current limits and architecture

isim is an iOS-compatible Linux implementation, not Apple's official Simulator.
Do not assume full React Native, TurboModule, Fabric, or Wix Navigation compatibility
until the specific application has passed testing.

The physical build CLI in this checkout has a recursive launcher defect, and the
Ninja generator does not implement the full Xcode/CocoaPods build graph. The WSL
quick start deliberately uses the independent isim toolchain. The legacy `setup.sh`
is not the recommended WSL entry point; it invokes that build CLI.

See [the platform review and implementation roadmap](docs/platform-roadmap.md)
for signing, native compatibility research, WSL improvements, and validation gaps.

| Component | Location |
| --- | --- |
| Web IDE | `packages/tuxcode-ide` |
| Native Linux simulator wrapper | `bin/isim` |
| WSL setup / daily launch | `scripts/setup-wsl.sh`, `scripts/start-wsl.sh` |
| Build and device modules | `packages/tuxcodebuild` |
| VS Code extension | `packages/vscode-tuxcode` |
| USB mirror | `bin/tuxmirror` |

Upstream references: [isim](https://github.com/kolabs-dev/isim),
[WSL installation](https://learn.microsoft.com/en-us/windows/wsl/install),
[WSLg applications](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps),
[WSL USB](https://learn.microsoft.com/en-us/windows/wsl/connect-usb).
