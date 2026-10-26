const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_DIR = path.resolve(__dirname, '../../../bin');
const IOS_BIN = path.join(BIN_DIR, 'ios');
const TUXMIRROR_BIN = path.join(BIN_DIR, 'tuxmirror');

class DeviceManager {
  static checkBinary() {
    if (!fs.existsSync(IOS_BIN)) {
      throw new Error(`go-ios binary not found at ${IOS_BIN}`);
    }
  }

  static listDevices() {
    this.checkBinary();
    try {
      const output = execSync(`"${IOS_BIN}" list`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      // go-ios prints JSON lines, look for { "deviceList": [...] }
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.deviceList) {
            return parsed.deviceList;
          }
        } catch {
          // ignore non-json log lines
        }
      }
      return [];
    } catch (err) {
      console.error('Failed to list devices:', err.message);
      return [];
    }
  }

  static getDeviceInfo(udid) {
    this.checkBinary();
    try {
      const cmd = udid ? `"${IOS_BIN}" info --udid=${udid}` : `"${IOS_BIN}" info`;
      const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.DeviceName || parsed.ProductName) {
            return parsed;
          }
        } catch {
          // ignore
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  static isDeveloperModeEnabled(udid) {
    this.checkBinary();
    try {
      const cmd = udid ? `"${IOS_BIN}" devmode get --udid=${udid}` : `"${IOS_BIN}" devmode get`;
      const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (typeof parsed.DeveloperModeEnabled === 'boolean') {
            return parsed.DeveloperModeEnabled;
          }
        } catch {
          // ignore
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  static installApp(appPath, udid) {
    this.checkBinary();
    console.log(`[tuxcodebuild] Installing app bundle: ${appPath}...`);
    const udidArg = udid ? `--udid=${udid}` : '';
    const output = execSync(`"${IOS_BIN}" install --path="${appPath}" ${udidArg}`, {
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    return output;
  }

  static launchApp(bundleId, udid) {
    this.checkBinary();
    console.log(`[tuxcodebuild] Launching bundle: ${bundleId}...`);
    const udidArg = udid ? `--udid=${udid}` : '';
    const output = execSync(`"${IOS_BIN}" launch ${bundleId} ${udidArg}`, {
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    return output;
  }

  static launchMirror() {
    if (!fs.existsSync(TUXMIRROR_BIN)) {
      throw new Error(`tuxmirror binary not found at ${TUXMIRROR_BIN}`);
    }
    console.log('[tuxcodebuild] Launching tuxmirror screen viewer on desktop...');
    const child = spawn(TUXMIRROR_BIN, [], {
      detached: true,
      stdio: 'inherit'
    });
    child.unref();
    return child.pid;
  }
}

module.exports = DeviceManager;
