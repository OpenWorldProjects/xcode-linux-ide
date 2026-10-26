const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const source = path.resolve(__dirname, '../src/signer.js');
function fixture(t, fail = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxcode-signer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'App $(not-a-command).app');
  fs.mkdirSync(app);
  const options = {
    p12Path: path.join(root, 'certificate.p12'),
    profilePath: path.join(root, 'profile.mobileprovision'),
    entitlementsPath: path.join(root, 'entitlements.plist'),
    p12Password: 'secret " $() `command`'
  };
  for (const key of ['p12Path', 'profilePath', 'entitlementsPath']) {
    fs.writeFileSync(options[key], key);
  }
  const calls = [], logs = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module, __dirname: path.dirname(source),
    console: { log: (...args) => logs.push(args.join(' ')), error: () => {} },
    require: name => name === 'child_process' ? {
      execFileSync(binary, args) {
        const passwordFile = args[args.indexOf('--p12-password-file') + 1];
        calls.push({ binary, args: Array.from(args), passwordFile });
        assert.equal(fs.statSync(passwordFile).mode & 0o777, 0o600);
        assert.equal(fs.readFileSync(passwordFile, 'utf8'), options.p12Password);
        assert.ok(!args.includes(options.p12Password));
        assert.ok(!args.includes('--provisioning-profile'));
        assert.equal(args.at(-1), app);
        if (fail) throw new Error('signing failed');
        return 'signed';
      }
    } : require(name)
  });
  // These tests isolate invocation and secret handling, not bundled binary presence.
  module.exports.checkBinary = () => {};
  return { signer: module.exports, options, app, calls, logs };
}

test('profile signing passes literal paths and removes the private password file', t => {
  const f = fixture(t);
  assert.equal(f.signer.signWithProfile(f.app, f.options), 'signed');
  assert.equal(fs.readFileSync(path.join(f.app, 'embedded.mobileprovision'), 'utf8'), 'profilePath');
  assert.equal(fs.existsSync(f.calls[0].passwordFile), false);
  assert.equal(f.logs.join('\n').includes(f.options.p12Password), false);
});

test('signing failure also removes the private password file', t => {
  const f = fixture(t, true);
  assert.throws(() => f.signer.signWithProfile(f.app, f.options), /signing failed/);
  assert.equal(fs.existsSync(f.calls[0].passwordFile), false);
});

test('missing entitlements fails before mutation or subprocess execution', t => {
  const f = fixture(t);
  delete f.options.entitlementsPath;
  assert.throws(() => f.signer.signWithProfile(f.app, f.options), /entitlements are required/);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(path.join(f.app, 'embedded.mobileprovision')), false);
});
