const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const BIN_DIR = path.resolve(__dirname, '../../../bin');
const IOS_BIN = path.join(BIN_DIR, 'ios');
const FRAME_TMP = '/dev/shm/iphone_frame.png.tmp';
const FRAME_PATH = '/dev/shm/iphone_frame.png';
const PORT = 8080;

let isCapturing = true;
let frameCount = 0;

// Continuously capture screen over USB into RAM disk
function captureLoop() {
  if (!isCapturing) return;

  const child = spawn(IOS_BIN, ['screenshot', `--output=${FRAME_TMP}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.on('exit', (code) => {
    if (code === 0 && fs.existsSync(FRAME_TMP)) {
      try {
        fs.renameSync(FRAME_TMP, FRAME_PATH);
        frameCount++;
      } catch (err) {}
    }
    setImmediate(captureLoop);
  });

  child.on('error', () => {
    setTimeout(captureLoop, 1000);
  });
}

function handleTouchTap(x, y, res) {
  console.log(`[tuxmirror-touch] Tap at (${x}, ${y})`);
  exec(`"${IOS_BIN}" ui tap --x=${Math.round(x)} --y=${Math.round(y)}`, (err, stdout, stderr) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: !err, error: err ? stderr || err.message : null }));
  });
}

function handleTouchSwipe(fromX, fromY, toX, toY, res) {
  console.log(`[tuxmirror-touch] Swipe from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
  exec(`"${IOS_BIN}" ui swipe --from-x=${Math.round(fromX)} --from-y=${Math.round(fromY)} --to-x=${Math.round(toX)} --to-y=${Math.round(toY)}`, (err, stdout, stderr) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: !err, error: err ? stderr || err.message : null }));
  });
}

function handleButton(btn, res) {
  console.log(`[tuxmirror-touch] Hardware Button: ${btn}`);
  exec(`"${IOS_BIN}" ui button ${btn}`, (err, stdout, stderr) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: !err, error: err ? stderr || err.message : null }));
  });
}

// HTTP Server
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle Touch Inputs
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (req.url === '/api/tap') {
          handleTouchTap(data.x, data.y, res);
        } else if (req.url === '/api/swipe') {
          handleTouchSwipe(data.fromX, data.fromY, data.toX, data.toY, res);
        } else if (req.url === '/api/button') {
          handleButton(data.button || 'home', res);
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (err) {
        res.writeHead(400);
        res.end(err.message);
      }
    });
    return;
  }

  // Live Screen Frame
  if (req.url.startsWith('/frame')) {
    if (fs.existsSync(FRAME_PATH)) {
      try {
        const data = fs.readFileSync(FRAME_PATH);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Length': data.length
        });
        res.end(data);
        return;
      } catch {}
    }
    res.writeHead(404);
    res.end();
    return;
  }

  // HTML Viewer
  const htmlPath = path.join(__dirname, 'usb-viewer.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TuxMirror USB Server Active. Frames: ' + frameCount);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[tuxmirror-usb] 🚀 USB Screen & Touch Server running on http://0.0.0.0:${PORT}`);
  captureLoop();
});

function cleanup() {
  isCapturing = false;
  try { if (fs.existsSync(FRAME_TMP)) fs.unlinkSync(FRAME_TMP); } catch {}
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
