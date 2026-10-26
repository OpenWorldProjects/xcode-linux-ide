const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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
    const cmd = `"${RCODESIGN_BIN}" sign "${appPath}"`;
    try {
      const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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

    // Embed provisioning profile into .app bundle
    const embeddedProfileDest = path.join(appPath, 'embedded.mobileprovision');
    fs.copyFileSync(profilePath, embeddedProfileDest);
    console.log(`[tuxcodebuild] Embedded mobileprovision -> ${embeddedProfileDest}`);

    let cmd = `"${RCODESIGN_BIN}" sign --p12-file "${p12Path}"`;
    if (p12Password) {
      cmd += ` --p12-password "${p12Password}"`;
    }
    cmd += ` --provisioning-profile "${profilePath}"`;
    if (entitlementsPath && fs.existsSync(entitlementsPath)) {
      cmd += ` --entitlements-xml-file "${entitlementsPath}"`;
    }
    cmd += ` "${appPath}"`;

    console.log(`[tuxcodebuild] Signing with developer profile: ${cmd}`);
    try {
      const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[tuxcodebuild] Developer certificate signature successful!');
      return output;
    } catch (err) {
      console.error('[tuxcodebuild] Developer signing failed:', err.stderr || err.message);
      throw err;
    }
  }

  static verifySignature(appPath) {
    this.checkBinary();
    const cmd = `"${RCODESIGN_BIN}" verify "${appPath}"`;
    try {
      const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      return { valid: true, output };
    } catch (err) {
      return { valid: false, error: err.stderr || err.message };
    }
  }
}

module.exports = AppSigner;

