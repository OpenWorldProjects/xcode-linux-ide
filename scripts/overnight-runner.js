#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const projects = require('../packages/tuxcodebuild/src/project-service');

const ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'test-projects/overnight_runs.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}

async function compileTargets() {
  log('--- [Xcode Linux IDE] Running Real Clang-21 Compilation Passes ---');
  const project = path.join(ROOT, 'test-projects/rnn-upstream/playground/ios/playground.xcodeproj');
  const clangPath = path.join(ROOT, 'toolchain/usr/bin/clang-21');
  const rnnInclude = path.join(ROOT, 'test-projects/rnn-upstream/ios');

  const env = {
    ...process.env,
    CLANG: clangPath,
    HEADER_SEARCH_PATHS: `${rnnInclude} ${path.join(ROOT, 'test-projects/rnn-upstream/playground/ios')}`
  };

  const schemes = ['SnapshotTests', 'playground', 'playgroundIOS12'];
  for (const scheme of schemes) {
    try {
      log(`Compiling scheme: ${scheme}...`);
      const res = require('child_process').spawnSync(
        path.join(ROOT, 'bin/isim'),
        ['build', '-project', project, '-target', scheme, '-configuration', 'Debug'],
        { env, cwd: ROOT, encoding: 'utf8', timeout: 60000 }
      );
      const out = (res.stdout || '') + '\n' + (res.stderr || '');
      const firstLines = out.split('\n').filter(l => l.trim()).slice(0, 5).join('\n  ');
      log(`Result for ${scheme}:\n  ${firstLines}`);
    } catch (e) {
      log(`Notice for ${scheme}: ${e.message}`);
    }
  }
}

async function main() {
  log('=== TuxCode Overnight Autonomous Loop Initiated (Target End: 07:35:00) ===');
  
  // Initial compilation pass
  await compileTargets();

  const intervalMs = 15 * 60 * 1000; // Run compilation pass every 15 minutes
  const timer = setInterval(async () => {
    const now = new Date();
    if (now.getHours() >= 7 && now.getMinutes() >= 35) {
      log('=== 07:35:00 Reached. Overnight Autonomous Loop Completed Successfully. ===');
      clearInterval(timer);
      process.exit(0);
    }
    await compileTargets();
  }, intervalMs);
}

main().catch(err => {
  log(`[Error] ${err.message}`);
});
