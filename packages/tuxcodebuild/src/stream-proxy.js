const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_DIR = path.resolve(__dirname, '../../../bin');
const IOS_BIN = path.join(BIN_DIR, 'ios');
const INTERNAL_PORT = 3334;
const PUBLIC_PORT = 3333;

let iosProcess = null;
let clients = new Set();
let lastFrame = null;
let isStopping = false;

function startIosStream() {
  if (isStopping) return;

  console.log('[tuxstream] Spawning internal go-ios stream on port', INTERNAL_PORT);
  iosProcess = spawn(IOS_BIN, ['screenshot', '--stream', `--port=${INTERNAL_PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  iosProcess.stdout.on('data', (d) => {
    // console.log('[go-ios]', d.toString().trim());
  });

  iosProcess.stderr.on('data', (d) => {
    // console.error('[go-ios err]', d.toString().trim());
  });

  iosProcess.on('exit', (code) => {
    console.warn(`[tuxstream] go-ios exited with code ${code}. Restarting in 1s...`);
    iosProcess = null;
    if (!isStopping) {
      setTimeout(startIosStream, 1000);
    }
  });

  // Connect internal consumer after a brief delay for server to bind
  setTimeout(connectToInternalStream, 1500);
}

function connectToInternalStream() {
  if (isStopping) return;

  const req = http.get(`http://127.0.0.1:${INTERNAL_PORT}/`, (res) => {
    console.log('[tuxstream] Connected to internal go-ios stream. Broadcasting...');
    let buffer = Buffer.alloc(0);

    res.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Look for boundary and broadcast complete chunks to all connected public clients
      for (const client of clients) {
        try {
          client.write(chunk);
        } catch {
          clients.delete(client);
        }
      }
    });

    res.on('end', () => {
      console.warn('[tuxstream] Internal stream ended.');
    });

    res.on('error', (err) => {
      console.warn('[tuxstream] Internal stream error:', err.message);
    });
  });

  req.on('error', (err) => {
    // Server might still be booting up
    setTimeout(connectToInternalStream, 1000);
  });
}

// Public HTTP server
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // MJPEG stream endpoint
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=--BoundaryString',
    'Cache-Control': 'no-cache, private',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  clients.add(res);
  console.log(`[tuxstream] New client connected. Total active clients: ${clients.size}`);

  req.on('close', () => {
    clients.delete(res);
    console.log(`[tuxstream] Client disconnected. Total active clients: ${clients.size}`);
  });
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`[tuxstream] TuxStream Proxy listening on http://0.0.0.0:${PUBLIC_PORT}`);
  startIosStream();
});

function cleanup() {
  isStopping = true;
  if (iosProcess) {
    iosProcess.kill();
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
