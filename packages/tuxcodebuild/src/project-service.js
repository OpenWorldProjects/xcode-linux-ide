const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '../../..');

function execute(file, args, { input, cwd = ROOT, env = process.env, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Command timed out')); }, timeout);
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 8 * 1024 * 1024) child.kill(); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-1024 * 1024); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `Command exited with ${code}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function validate(request) {
  if (!request || typeof request.projectPath !== 'string' || !request.projectPath) throw new Error('Choose a project path.');
  for (const field of ['buildEnvironment', 'launchEnvironment', 'buildSettings']) {
    const values = request[field] || {};
    if (typeof values !== 'object' || Array.isArray(values)) throw new Error(`${field} must be a JSON object.`);
    for (const [key, value] of Object.entries(values)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')) throw new Error(`Invalid ${field} entry: ${key}`);
    }
  }
  if (request.launchArguments !== undefined && (!Array.isArray(request.launchArguments) || request.launchArguments.some(v => typeof v !== 'string' || v.includes('\0')))) throw new Error('Launch arguments must be a JSON string array.');
  return { ...request, projectPath: path.resolve(ROOT, request.projectPath) };
}

async function inspect(request) {
  const checked = validate(request);
  const output = await execute('python3', [path.join(__dirname, 'project-inspector.py')], { input: JSON.stringify(checked) });
  return JSON.parse(output);
}

async function build(request) {
  request = validate(request);
  // Require one exact container so workspace and project schemes cannot be mixed.
  if (!/\.(xcworkspace|xcodeproj)$/.test(request.projectPath)) throw new Error('Select a specific workspace or project before building.');
  const plan = await inspect({ ...request, action: 'plan' });
  if (plan.blockers.length) throw new Error(plan.blockers.join('\n'));
  // The backend accepts a scheme name, so ambiguous names cannot safely be forwarded.
  const metadata = await inspect(request);
  if (metadata.schemes.filter(s => s.name === plan.scheme.name).length !== 1) throw new Error('Duplicate scheme names are unsupported by the isim backend.');
  const cwd = path.dirname(request.projectPath);
  const outputDir = path.join(cwd, 'build', 'tuxcode', 'isim', plan.scheme.name, plan.configuration);
  if (!outputDir.startsWith(path.join(cwd, 'build', 'tuxcode', 'isim') + path.sep)) throw new Error('Invalid scheme/configuration output path.');
  const args = ['build', request.projectPath.endsWith('.xcworkspace') ? '-workspace' : '-project', request.projectPath,
    plan.scheme.generated ? '-target' : '-scheme', plan.scheme.name, '-configuration', plan.configuration, '-o', outputDir];
  for (const [key, value] of Object.entries(request.buildSettings || {})) args.push(`${key}=${value}`);
  const output = await execute(path.join(ROOT, 'bin/isim'), args, {
    cwd, env: { ...process.env, ...request.buildEnvironment }, timeout: 20 * 60 * 1000
  });
  return { success: true, output, outputDir, plan };
}

async function run(request) {
  const result = await build(request);
  const runnable = result.plan.scheme.runnable;
  if (!runnable || !runnable.BuildableName.endsWith('.app')) throw new Error('The scheme has no runnable application. Build completed.');
  const app = path.resolve(result.outputDir, runnable.BuildableName);
  if (!app.startsWith(result.outputDir + path.sep) || !fs.existsSync(app)) throw new Error(`Built application not found: ${app}`);
  // isim is an interactive desktop process; report launch request, not successful app startup.
  await new Promise((resolve, reject) => {
    const child = spawn(path.join(ROOT, 'bin/isim'), ['run', app, ...result.plan.launchArguments], {
      cwd: path.dirname(path.resolve(ROOT, request.projectPath)),
      env: { ...process.env, ...result.plan.launchEnvironment }, detached: true, stdio: 'ignore'
    });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { ...result, output: result.output + '\nisim launch requested. Check its desktop window.' };
}
module.exports = { inspect, build, run, execute, validate };
