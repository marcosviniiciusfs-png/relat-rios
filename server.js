#!/usr/bin/env node
/* Servidor local do gerador de relatório semanal. Sem dependências.
   Serve /public e guarda a configuração por cliente em config/clientes.json (versionado no repo). */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5174);
const PUBLIC = path.join(__dirname, 'public');
const CFG_DIR = path.join(__dirname, 'config');
const CFG = path.join(CFG_DIR, 'clientes.json');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const readCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return {}; } };
const writeCfg = o => { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2) + '\n'); };

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(readCfg()));
    }
    const m = /^\/api\/config\/([a-z0-9-]+)$/.exec(url.pathname);
    if (m && req.method === 'PUT') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try {
          const all = readCfg();
          all[m[1]] = Object.assign(JSON.parse(body), { atualizadoEm: new Date().toISOString() });
          writeCfg(all);
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
        } catch (e) { res.writeHead(400); res.end(String(e.message)); }
      });
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('não encontrado'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  start().then(() => {
    console.log(`Relatório semanal Hurtz: http://localhost:${PORT}`);
  }).catch(e => {
    if (e.code === 'EADDRINUSE') console.log(`Já está rodando: http://localhost:${PORT}`);
    else throw e;
  });
}
module.exports = { start };
