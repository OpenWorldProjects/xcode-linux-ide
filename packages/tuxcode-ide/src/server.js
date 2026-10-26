const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const projects = require('../../tuxcodebuild/src/project-service');
const ROOT = path.resolve(__dirname, '../../..');
const PUBLIC = path.join(__dirname, '../public');
const PORT = Number(process.env.TUXCODE_PORT || 3000);

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 1024 * 1024) throw new Error('Request is too large');
  }
  return JSON.parse(text || '{}');
}
function filesUnder(root, depth = 0) {
  if (depth > 5) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter(f => !f.isSymbolicLink() && !['.git', 'Pods', 'node_modules', 'build', '.env', '.env.local'].includes(f.name)).flatMap(f => {
    const file = path.join(root, f.name);
    return f.isDirectory() ? filesUnder(file, depth + 1) : [{ name: f.name, path: file }];
  }).slice(0, 1000);
}
const server = http.createServer(async (req, res) => {
  try {
    // Local IDE: reject cross-origin writes and DNS-rebinding hostnames.
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return json(res, 403, { error: 'Use localhost to access this IDE.' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Cross-origin requests are not allowed.' });
    const url = new URL(req.url, `http://${host}`);
    if (req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Expected application/json' });
      const data = await body(req);
      if (url.pathname === '/api/project') return json(res, 200, await projects.inspect(data));
      if (url.pathname === '/api/plan') return json(res, 200, await projects.inspect({ ...data, action: 'plan' }));
      if (['/api/build', '/api/run'].includes(url.pathname)) {
        const result = await projects[url.pathname.slice(5)](data);
        // Do not echo build/launch environment values back into build logs.
        return json(res, 200, { success: true, output: result.output });
      }
      if (url.pathname === '/api/isim/open') {
        const child = spawn(path.join(ROOT, 'bin/isim'), ['open'], { cwd: ROOT, detached: true, stdio: 'ignore' });
        child.once('error', error => json(res, 500, { error: error.message }));
        child.once('spawn', () => { child.unref(); json(res, 202, { message: 'Launch requested. Check the isim desktop window.' }); });
        return;
      }
      if (url.pathname === '/api/files') {
        const container = path.resolve(ROOT, data.projectPath);
        const root = /\.(xcworkspace|xcodeproj)$/.test(container) ? path.dirname(container) : container;
        return json(res, 200, filesUnder(root));
      }
      if (url.pathname === '/api/file-content') {
        const container = fs.realpathSync(path.resolve(ROOT, data.projectPath));
        const root = /\.(xcworkspace|xcodeproj)$/.test(container) ? path.dirname(container) : container;
        const file = fs.realpathSync(data.filePath);
        if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error('File is outside the selected project');
        if (fs.statSync(file).size > 1024 * 1024) throw new Error('File is too large for the editor');
        return json(res, 200, { content: fs.readFileSync(file, 'utf8') });
      }
      return json(res, 404, { error: 'Unknown endpoint' });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const file = path.resolve(PUBLIC, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'Not found' });
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    json(res, 400, { success: false, error: error.message, output: error.message });
  }
});
if (require.main === module) server.listen(PORT, '127.0.0.1', () => console.log(`TuxCode: http://localhost:${PORT}`));
module.exports = server;
