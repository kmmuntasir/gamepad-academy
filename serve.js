// serve.js — zero-dependency local dev server for gamepad-academy.
//
// WHY THIS EXISTS:
//   The browser code uses ES modules (<script type="module"> + import).
//   Browsers BLOCK ES-module fetches on the file:// origin (CORS, origin null),
//   so opening index.html directly makes game.js never run — gamepad AND
//   keyboard both appear dead. Serving over http fixes it. GitHub Pages serves
//   https, so production is unaffected; this is only for local playtesting.
//
// USAGE:
//   node serve.js            # serves on http://localhost:8000
//   node serve.js 5173       # custom port
//   PORT=8080 node serve.js  # via env
//
// No package.json, no node_modules — pure Node built-ins.

const { createServer } = require('node:http');
const { readFile, stat } = require('node:fs/promises');
const { extname, join, normalize } = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8000);

// Correct MIME types are load-bearing: <script type="module"> rejects anything
// that isn't a JavaScript MIME, so .js MUST be text/javascript (not text/plain).
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Resolve under ROOT and block path traversal (../ escapes).
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    let s;
    try {
      s = await stat(filePath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // Directory → serve its index.html (so /games/animal-spawner/ works).
    let resolved = filePath;
    if (s.isDirectory()) {
      resolved = join(filePath, 'index.html');
      try {
        await stat(resolved);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const data = await readFile(resolved);
    const type = MIME[extname(resolved).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is in use. Try another:  node serve.js 8080\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log('');
  console.log('  gamepad-academy — local dev server');
  console.log(`  →  ${url}`);
  console.log('');
  console.log('  Open THAT url in your browser. Do NOT open the .html file');
  console.log('  directly (file:// blocks ES modules → inputs go dead).');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
