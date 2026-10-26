const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BIN_DIR = path.resolve(__dirname, '../../../bin');
const RCODESIGN_BIN = path.join(BIN_DIR, 'rcodesign');

class AppSigner {
  static checkBinary() {
    if (!fs.existsSync(RCODESIGN_BIN)) {
      throw new Error(`rcodesign binary not found at ${RCODESIGN_BIN}`);
    }
  }

  static signAdHoc(appPath) {
    this.checkBinary();
    if (!fs.existsSync(appPath)) {
      throw new Error(`App path does not exist: ${appPath}`);
    }

    console.log(`[tuxcodebuild] Performing ad-hoc code sign on ${appPath}...`);
    try {
      const output = execFileSync(RCODESIGN_BIN, ['sign', appPath], { encoding: 'utf-8' });
      console.log('[tuxcodebuild] Ad-hoc signature written.');
      console.log('\x1b[33m%s\x1b[0m', '⚠️  NOTICE: Ad-hoc signatures are only valid for Simulators or Jailbroken devices.');
      console.log('\x1b[33m%s\x1b[0m', '   Physical iPhones (iOS 17/18) require an Apple Developer Profile (.mobileprovision) + .p12 certificate.');
      console.log('\x1b[33m%s\x1b[0m', '   Without this, iOS will report: "This app could not be installed because its integrity could not be verified".');
      return output;
    } catch (err) {
      console.error('[tuxcodebuild] Code signing failed:', err.stderr || err.message);
      throw err;
    }
  }

  static signWithProfile(appPath, { p12Path, p12Password = '', profilePath, entitlementsPath }) {
    this.checkBinary();
    if (!fs.existsSync(appPath)) {
      throw new Error(`App path does not exist: ${appPath}`);
    }
    if (!fs.existsSync(p12Path)) {
      throw new Error(`p12 certificate file not found: ${p12Path}`);
    }
    if (!fs.existsSync(profilePath)) {
      throw new Error(`Provisioning profile not found: ${profilePath}`);
    }

    // rcodesign 0.29 has no --provisioning-profile flag. The caller must
    // resolve entitlements against the profile before invoking this low-level API.
    if (!entitlementsPath || !fs.existsSync(entitlementsPath)) {
      throw new Error('Explicit profile-compatible entitlements are required for device signing.');
    }
    const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxcode-sign-'));
    try {
      const passwordFile = path.join(secretDir, 'password');
      fs.writeFileSync(passwordFile, p12Password, { mode: 0o600 });
      fs.copyFileSync(profilePath, path.join(appPath, 'embedded.mobileprovision'));
      const args = ['sign', '--p12-file', p12Path,
        '--p12-password-file', passwordFile,
        '--entitlements-xml-file', entitlementsPath, appPath];
      console.log('[tuxcodebuild] Signing with supplied developer credentials.');
      return execFileSync(RCODESIGN_BIN, args, { encoding: 'utf-8' });
    } finally {
      fs.rmSync(secretDir, { recursive: true, force: true });
    }
  }

  static verifySignature(appPath) {
    this.checkBinary();
    try {
      const output = execFileSync(RCODESIGN_BIN, ['verify', appPath], { encoding: 'utf-8' });
      return { valid: true, output };
    } catch (err) {
      return { valid: false, error: err.stderr || err.message };
    }
  }
}

module.exports = AppSigner;

