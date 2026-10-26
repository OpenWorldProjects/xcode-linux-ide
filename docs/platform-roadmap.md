# Stock-device signing, simulator delivery, and Windows/WSL integration

Review of the local checkout, 2026-10-26. These are architecture recommendations,
not a claim that the complete React Native pipeline has passed device testing.

## Findings in this checkout

- `bin/tuxcodebuild` is an absolute symlink to `packages/tuxcodebuild/src/cli.js`.
  That file is a Bash shim invoking `bin/tuxcodebuild` again. It recurses rather
  than dispatching build commands. Restore the actual Node CLI from a known good
  revision and replace absolute symlinks with relocatable launchers before release.
  Do not infer that the packaged VSIX or previous demonstrations use this source.
- `signer.js` passed `--provisioning-profile`, which the bundled rcodesign 0.29
  does not implement; it also interpolated and logged the P12 password in a shell
  command. This review fixes that low-level invocation, requires explicit
  entitlements, uses argument arrays and a private temporary password file, and
  removes that file on success or failure. It does NOT implement profile issuance
  or prove that rcodesign's output will be accepted by a particular iOS version.
- `ninja-generator.js` always ad-hoc signs and is not wired to `AppSigner`.
  It targets the device SDK/platform, has basename-only object paths, and handles
  only a small subset of an Xcode build. The regex workspace/project parser is
  not an implementation of targets, configurations, dependency build phases,
  CocoaPods xcconfigs, RN codegen, Hermes, resources, Swift, or asset catalogs.
  Validate RN 0.86 and Navigation 8.8.11 with an actual locked sample application;
  the compatibility claim is not demonstrated by these modules.
- The extension previously resolved tools relative to its installed VSIX directory,
  blocked its host with synchronous commands, and hardcoded a browser-local iframe.
  This review adds workspace execution, configurable toolchain location/PATH lookup,
  asynchronous commands, workspace trust gating, and `asExternalUri` forwarding.
- `tuxsim` always attaches Recovery media, checks only process names, discards logs,
  and announces success without checking macOS, Xcode, or a booted simulator.
  `setup-macos-simulator.sh` creates an empty disk; it does not install Xcode.
- The mirror invokes `ios screenshot` repeatedly. FPS and touch availability must
  be measured on the selected OS/device; a timer or working web page proves neither.
  Installation, launch/debug transport, screen capture, and touch automation are
  separate capabilities. Keep separate readiness states for each.

## 1. Physical stock iPhone: provision first, sign second

A self-generated key or self-signed certificate cannot authorize a stock iPhone.
An Apple-issued certificate, its private key, a matching Apple-signed provisioning
profile, correct entitlements, and a supported device installation path are needed.
`zsign` and `rcodesign` consume credentials; they do not create Apple authorization.
`go-ios` provides device transport, not a replacement certificate authority.

### Recommended supported provider: paid development team

Implement a `ProvisioningProvider.ensure({teamId, bundleId, udid, capabilities})`
interface returning credential references, profile bytes, expiry, and resolved
entitlements. Keep credentials outside project files. A paid-team provider can
use Apple's App Store Connect API, subject to the account role and API key permissions:

1. Perform one-time team/API-key onboarding. Generate the private key and CSR
   locally using OpenSSL. Never send the private key to Apple.
2. Reuse a valid matching development certificate, or issue one through
   `POST /v1/certificates` with an appropriate development certificate type and
   `csrContent`. Persist the returned certificate with its original private key.
   Do not create/revoke certificates on every build: quotas and other developers
   sharing the team make that disruptive.
3. Find/register the iPhone via `/v1/devices` and find/register the bundle ID via
   `/v1/bundleIds`. Configure the capabilities permitted by that team's account.
4. Find/reuse or create `/v1/profiles` with type `IOS_APP_DEVELOPMENT` and
   relationships to that bundle ID, certificate, and device. Decode the returned
   `profileContent`. Cache by team, bundle ID, certificate fingerprint, device set,
   and capabilities; renew before expiry and regenerate after capability changes.
5. Build completely, including framework embedding/resources, then stage a copy
   for signing. Do not modify the signed bundle afterward.
6. Validate the profile's Apple signature/chain and expiry, target UDID, bundle ID
   (including wildcard matching), certificate inclusion, private-key match, and
   development distribution type. Validate certificate validity too. Decoding a
   CMS profile using `openssl cms -verify -noverify` is NOT chain validation.
7. Resolve entitlements: concrete `application-identifier`, correct App ID prefix,
   team identifier, keychain groups, and requested capabilities must be authorized
   by the profile. App ID prefixes are not always identical to Team IDs. Do not
   blindly copy all profile entitlements or grant `get-task-allow` without checking
   the profile. Reject missing capabilities with an actionable diagnostic.
8. Sign embedded executable code inside-out, then the application. Each `.appex`
   needs its own bundle ID/profile/entitlements; frameworks need signatures but
   do not receive a copy of the application's provisioning profile/entitlements.
9. Verify locally, install to the explicit UDID, launch, and confirm a running
   process. Local signature verification is necessary but not equivalent to
   installd/AMFI acceptance. Return separate signing/install/launch errors.

Use short-lived JWTs generated locally from the API private key. Store secrets via
VS Code SecretStorage or an OS credential service; the standalone CLI needs its own
credential-store adapter. Do not put account passwords, API keys, or P12 passwords
in command lines, logs, Git, or workspace settings. Add per-team locking to prevent
parallel renewal jobs from creating duplicate profiles/certificates.

A Linux CSR example (run in a private credential directory, never in the repository):

```sh
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out development.key
openssl req -new -key development.key -out development.csr -subj '/CN=TuxCode Development'
```

A signing backend can use zsign with separate PEM key and certificate files,
avoiding a P12 password in argv. After provisioning/preflight, the command shape is:

```sh
zsign -k /private/development.key -c /private/development.pem \
  -m /private/development.mobileprovision -e /private/resolved-entitlements.plist \
  -o /build/App.ipa /build/staged/Payload/App.app
```

Pin a tested zsign revision and validate modern iOS entitlements/signatures on
hardware. Its current upstream supports multiple profiles for extensions; do not
assume an older packaged executable does. Keep the existing rcodesign backend
experimental until it passes the same device tests.

### Free Personal Team provider: explicitly experimental

Apple documents Personal Team provisioning through Xcode, including seven-day
profiles, limited App IDs/devices, and up to three installed apps per device. There
is no documented equivalent Personal Team App Store Connect provisioning API.
An optional provider can integrate a maintained AltServer-compatible Linux client
and locally hosted Anisette/authentication support, but this relies on unofficial
protocols. Anisette headers alone do not issue certificates or profiles.

The provider must handle interactive login/2FA, persistent authentication state,
team selection, certificate quotas, device and App ID registration, profile
retrieval and weekly renewal. Do not silently revoke existing certificates to
make room. Authentication can break after Apple changes its services; make that
an explicit unsupported/reauthentication state. An app-specific password is not
an assumed substitute for the developer-service authentication flow.

The honest promise is "guided initial setup, cached credentials, automated renewal
when the provider permits it", not "any free Apple ID, no prompts, forever".

### Stock and corporate device boundaries

The user must unlock/pair/trust the host and enable Developer Mode where required
(iOS 16+ development workflows), including the device-side restart/confirmation.
Managed devices may prohibit the required actions; return a policy-blocked error
and direct the developer to the organization administrator. A certificate cannot
bypass management policy. TestFlight/managed distribution may be alternatives
when authorized, but are different workflows with distribution/review requirements.
An iPhone X is an iOS 16 test device, not an iOS 17/18 test device.

On newer iOS releases, developer services can require compatible developer disk
images and a Remote Service Discovery tunnel. Detect and set these up using the
pinned go-ios/pymobiledevice3 version. Treat "installed" separately from "debugger
and UI automation ready". Test the touch backend independently on stock devices.

## 2. Simulator direction: native Linux compatibility

Updated requirement: no full macOS VM. The guest-image proposal below is retained
as a historical alternative, not the selected implementation direction.

Use isim as the native prototype and keep physical iPhone validation for behavior
it does not implement. Darling is a potential source of Darwin compatibility,
not an established drop-in host for Apple's Simulator.app/CoreSimulator stack.
Darwin's open-source components alone do not supply the proprietary frameworks
and services that the simulator depends on.

Two different research targets must be kept separate:

- Running Apple's simulator stack: inventory Mach-O dependencies for a fixed
  Xcode/runtime pair, then implement missing Mach IPC, launchd/XPC services,
  loader/runtime behavior, graphics/windowing and private framework interfaces.
  A working CLI or basic AppKit window is not evidence that CoreSimulator boots.
- Running iOS-compatible apps directly: use isim's SDK/runtime and incrementally
  implement the APIs required by a locked sample. This avoids requiring the
  complete Apple simulator service stack but will have compatibility gaps.

Start with an Objective-C UIKit sample built with isim, then a minimal RN Fabric/
Hermes app, then one TurboModule, then Wix Navigation. Record missing symbols,
crashes and observable behavior at each stage; do not hide missing functionality
behind success-returning stubs. Build a distinct isim product rather than feeding
it the existing arm64 device product. Embed its rendered output and route input
only after standalone build/run is verified. Its displayed OS version is not
proof of a complete implementation of that iOS release.

References: [Darling architecture](https://github.com/darlinghq/darling) and
[isim's native Linux toolchain](https://github.com/kolabs-dev/isim).

### Previous alternative: provisioned macOS guest (not selected)

Apple's macOS license restricts installation and virtualization to specified
Apple-branded hardware uses. Redistributing macOS/Xcode/runtime images is not
made permissible by Docker or an open-source launcher. Obtain appropriate rights
before distributing any image. A generally licensed, official Apple simulator
running on arbitrary non-Apple Linux/WSL hardware is not a product promise this
architecture can support. An optional user-controlled Mac backend changes the
zero-Mac requirement and should be described honestly.

Technically, the fastest repeatable boot is from a previously installed disk with
macOS, a compatible pinned Xcode, and a downloaded simulator runtime. Docker-OSX
still runs QEMU/KVM; it does not turn CoreSimulator into a Linux process or remove
installation, CPU/GPU compatibility, nested virtualization, or licensing issues.

For an environment where the operator has the necessary rights:

1. Build the base once. Automate supported installer steps, but treat initial OS
   setup, software acquisition, and license acceptance as provisioning, not boot.
   Install Xcode, complete first-launch setup, install the selected runtime, create
   the simulator, and verify `xcrun simctl bootstatus <UDID> -b` succeeds.
2. Record macOS build, Xcode build, runtime identifier, CPU architecture, QEMU/
   firmware versions and disk checksum in an image manifest. Use a clean shutdown
   for a reusable base. Remove accounts, pairing records, signing credentials,
   provisioning profiles, SSH host keys and user secrets from distributable bases.
3. Keep the base read-only and create a per-user qcow2 overlay. For example:

   ```sh
   qemu-img create -f qcow2 -F qcow2 \
     -b /absolute/path/provisioned-base.qcow2 /absolute/path/session.qcow2
   ```

   This creates an overlay only; it does not install macOS. The backing image must
   remain at that path. Never replace a backing image beneath existing overlays.
4. Add distinct `tuxsim prepare`, `start`, `status`, `reset` and `stop` operations.
   Normal `start` must omit the Recovery `InstallMedia` drive and use the overlay.
   If no provisioned base exists, report "setup required" instead of booting
   Recovery while claiming that the simulator is ready.
5. Use a per-instance PID/lock, logs, QMP control, private writable NVRAM and health
   checks: QEMU alive -> SSH responding -> Xcode selected -> runtime present ->
   simulator boot completed -> GUI available. Set timeouts and show the failed step.
6. Run `scripts/boot-simulator-guest.sh` inside the logged-in macOS desktop session
   with `TUXCODE_SIMULATOR_UDID` set. An SSH daemon alone does not establish a GUI
   session. A LaunchAgent can invoke the script after login.
7. Bind SSH/VNC/noVNC to loopback, forward the UI through VS Code, and measure cold
   and warm boots. A saved RAM snapshot may be faster but is more sensitive to CPU,
   QEMU, firmware, and device-model changes than a clean disk snapshot.

WSL preflight must open `/dev/kvm` successfully, not just find its name. Check host
architecture, nested virtualization, available RAM/disk, and guest compatibility.
Do not silently fall back to hours of software CPU emulation.

Device arm64 Mach-O builds cannot be installed into CoreSimulator. Build a separate
simulator target with the iPhoneSimulator SDK, simulator platform metadata, and the
architecture required by the guest (normally x86_64 for this x86_64 VM). Every native
RN dependency must provide or build that simulator slice. Recent runtime/Xcode
combinations may no longer fit the x86_64 guest: pin and test an explicit matrix.
A VNC window showing macOS Recovery is not a working iOS Simulator.

## 3. Native Windows VS Code, Linux extension host

Use Windows VS Code + Remote WSL and install TuxCode into the WSL extension host.
Run `code .` from the WSL project directory. Windows `code .` alone opens a local
Windows workspace; it does not guarantee WSL execution. Prefer projects in the
WSL filesystem for dependency/build performance.

The extension now declares `extensionKind: ["workspace"]`, rejects local Windows
execution with a WSL instruction, supports a machine-scoped `tuxcode.toolchainRoot`,
and uses argument arrays and asynchronous child execution. The iframe URI is
resolved with `vscode.env.asExternalUri`; there is no hardcoded WSL IP. The current
patch still expects an already running mirror daemon and the repaired build CLI.
It is source only: the existing VSIX has not been rebuilt.

For USB, install usbipd-win, keep WSL running, select the phone's BUSID with
`usbipd list`, then use the supplied Windows helper:

```powershell
# Once, elevated (or performed by corporate IT):
.\scripts\attach-iphone.ps1 -BusId 1-4 -Bind
# Later, ordinary PowerShell:
.\scripts\attach-iphone.ps1 -BusId 1-4
```

Binding requires administrator privileges; attaching an already shared device
usually does not. A device attached to WSL is unavailable to Windows until detached.
Do not auto-bind every Apple USB device or silently change corporate firewall policy.

Next extension increment:

- Add an onboarding command that records the selected device, checks usbipd state,
  and invokes `usbipd.exe` via WSL interop with separate arguments. Use the selected
  serial/device identity, not only a BUSID, because USB ports and IDs can change.
- Offer explicit per-user auto-attach. Use the pinned usbipd version's auto-attach
  facility or a bounded reconnect supervisor; rediscover identity on hotplug and
  stop on extension disposal. Surface the one-time elevated bind separately.
- Run builds as cancellable VS Code Tasks/ProcessExecution with streamed logs;
  the current async patch buffers output and has a five-minute timeout. Add device
  selection and JSON CLI output instead of parsing human-oriented `[Device]` lines.
- Start a single owned mirror service only after pairing/developer-service checks.
  Add a health/identity endpoint before reusing port 8080; a listening port alone
  could belong to another application. Wait for readiness before opening the tab,
  show device errors, and clean up only processes started by this extension.
- Bind the mirror to loopback and authenticate touch commands; it currently binds
  all interfaces and accepts control requests. Forward HTTP plus the actual frame
  transport through VS Code and test the webview CSP on Windows/WSL.
- Separate statuses: USB attached, trusted, Developer Mode, signing ready, installed,
  launch services ready, mirror ready. Do not turn a failed probe into "no device".

## Release gates

First restore the real CLI and relocatable tool paths. Then test a minimal native
app on an iPhone X/iOS 16 and a newer iPhone/iOS 17 or 18: valid signing, expired
profile, wrong UDID, wrong bundle ID, wrong certificate, denied entitlement,
Developer Mode off, and managed-device restriction. Repeat with an app extension
and a locked RN/New Architecture sample exercising Navigation and a TurboModule.

Test Windows VSIX installation into WSL, tool paths containing spaces, first bind,
reconnect, multiple phones, cancelled builds, remote iframe loading, and extension
shutdown. For the VM, verify fresh provisioning, cached boot, unavailable KVM,
missing runtime, incompatible architecture, and corrupt image diagnostics.

Local checks for this patch cover JS/Bash syntax and mocked signer argument/secret
handling. They do not constitute stock-iPhone, Windows, Apple account, or macOS
simulator validation. No provisioning service or ready-made VM image was deployed.

## Primary references

- [Apple account and Personal Teams](https://developer.apple.com/help/account/basics/about-your-developer-account/)
- [Apple certificates API](https://developer.apple.com/documentation/appstoreconnectapi/certificates)
- [Apple profiles API](https://developer.apple.com/documentation/appstoreconnectapi/profiles)
- [Apple Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
- [zsign upstream and signing options](https://github.com/zhlynn/zsign)
- [Provision/Anisette project and scope](https://github.com/Dadoum/Provision)
- [go-ios device transport](https://github.com/danielpaulus/go-ios)
- [macOS Sequoia license](https://www.apple.com/legal/sla/docs/macOSSequoia.pdf)
- [Docker-OSX architecture and image modes](https://github.com/sickcodes/Docker-OSX)
- [Microsoft WSL USB setup](https://learn.microsoft.com/en-us/windows/wsl/connect-usb)
- [VS Code remote extension architecture and webviews](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
