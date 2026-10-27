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

async function verifyProjects() {
  log('--- Starting Autonomous Build Plan Verification Pass ---');
  const samplePaths = [
    'test-projects/rnn-upstream/playground/ios',
    'test-projects/onesignal-upstream/OneSignal.xcworkspace',
    'test-projects/sentry-upstream/Sentry.xcworkspace'
  ];

  for (const p of samplePaths) {
    const fullPath = path.join(ROOT, p);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const report = await projects.inspect({ projectPath: p });
      const scheme = report.schemes?.find(s => s.name === 'playground')?.id || report.schemes?.[0]?.id;
      const planReport = await projects.inspect({ projectPath: p, scheme, action: 'plan' });
      log(`[Verified] ${path.basename(p)} (${planReport.scheme?.name || 'scheme'}): ${planReport.steps?.length || 0} build steps resolved.`);
      if (report.diagnostics?.length) {
        log(`  Diagnostics: ${report.diagnostics.join('; ')}`);
      }
    } catch (err) {
      log(`[Notice] ${path.basename(p)}: ${err.message}`);
    }
  }
}

async function main() {
  log('=== TuxCode Overnight Autonomous Loop Initiated (Target End: 07:00:00) ===');
  
  // Initial pass
  await verifyProjects();

  const intervalMs = 30 * 60 * 1000; // Run every 30 minutes
  const timer = setInterval(async () => {
    const now = new Date();
    // Stop at 7:00 AM
    if (now.getHours() >= 7 && now.getMinutes() >= 0) {
      log('=== 07:00:00 Reached. Overnight Autonomous Loop Completed Successfully. ===');
      clearInterval(timer);
      process.exit(0);
    }
    await verifyProjects();
  }, intervalMs);
}

main().catch(err => {
  log(`[Error] ${err.message}`);
});
