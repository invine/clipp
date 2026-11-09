// Throwaway local study server; serves only the prototype files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'management.js':'text/javascript', 'connections.js':'text/javascript', 'style.css': 'text/css' };
http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed[name]) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': allowed[name] + '; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(__dirname, name)).pipe(res);
}).listen(4195, '127.0.0.1', () => console.log('Clipp layout prototype: http://127.0.0.1:4195/'));
