const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const PORT = 3000;
const ROOT_DIR = path.resolve(__dirname, '../../..');
const TUXCODEBUILD_BIN = path.join(ROOT_DIR, 'bin/tuxcodebuild');
const DEFAULT_PROJECT = path.join(ROOT_DIR, 'test-projects/rn-wix-sample/ios');
const PUBLIC_DIR = path.join(__dirname, '../public');

// Simple static file server
function serveStatic(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Endpoints
  if (req.url === '/api/devices') {
    try {
      const output = execSync(`"${TUXCODEBUILD_BIN}" devices`, { encoding: 'utf-8' });
      const devices = [];
      for (const line of output.trim().split('\n')) {
        if (line.includes('[Device]')) {
          const parts = line.replace('[Device]', '').split('- UDID:');
          devices.push({
            name: parts[0].trim(),
            udid: parts[1] ? parts[1].trim() : 'Unknown'
          });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(devices));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.url === '/api/build' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      const projectPath = data.projectPath || DEFAULT_PROJECT;
      console.log(`[tuxcode-ide] Building ${projectPath}...`);
      try {
        const output = execSync(`"${TUXCODEBUILD_BIN}" build "${projectPath}"`, { encoding: 'utf-8' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, output }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, output: err.stdout || err.stderr || err.message }));
      }
    });
    return;
  }

  if (req.url === '/api/run' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      const projectPath = data.projectPath || DEFAULT_PROJECT;
      console.log(`[tuxcode-ide] Running ${projectPath}...`);
      try {
        const output = execSync(`"${TUXCODEBUILD_BIN}" run "${projectPath}"`, { encoding: 'utf-8' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, output }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, output: err.stdout || err.stderr || err.message }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/files')) {
    function getFileTree(dir) {
      const items = [];
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f === 'build' || f === '.git') continue;
        const full = path.join(dir, f);
        const isDir = fs.statSync(full).isDirectory();
        items.push({
          name: f,
          path: full,
          isDirectory: isDir,
          children: isDir ? getFileTree(full) : []
        });
      }
      return items;
    }

    try {
      const tree = getFileTree(DEFAULT_PROJECT);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tree));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.url.startsWith('/api/file-content')) {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const filePath = urlParams.get('path');
    if (filePath && fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(content);
      return;
    }
    res.writeHead(404);
    res.end();
    return;
  }

  // Fallback to static assets
  if (serveStatic(req, res)) return;

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[tuxcode-ide] 🐧 TuxCode IDE running on http://127.0.0.1:${PORT}`);
});
