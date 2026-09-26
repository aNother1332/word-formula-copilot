// 本地静态文件服务：Word 加载项从这里加载页面
// https://localhost:3000 （Office 要求 HTTPS）+ http://localhost:3100 （仅本地调试用）
import https from 'node:https';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function handler(req, res) {
  try { appendFileSync(path.join(ROOT, 'access.log'), new Date().toISOString() + ' ' + req.method + ' ' + req.url + '\n'); } catch {} // ACCESS_LOG
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // 调试上报端点：任务窗格把自检结果写回本地
    if (req.method === 'POST' && p === '/__debug') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try { appendFileSync(path.join(ROOT, 'debug-report.json'), body + '\n'); } catch {}
        res.writeHead(204);
        res.end();
      });
      return;
    }
    if (p === '/') {
      res.writeHead(302, { Location: '/src/taskpane.html' });
      return res.end();
    }
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    readFile(file)
      .then((data) => {
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      })
      .catch(() => {
        res.writeHead(404);
        res.end('Not Found');
      });
  } catch {
    res.writeHead(400);
    res.end();
  }
}

const tls = {
  key: readFileSync(path.join(ROOT, 'certs', 'localhost-key.pem')),
  cert: readFileSync(path.join(ROOT, 'certs', 'localhost-cert.pem')),
};

https.createServer(tls, handler).listen(3000, () => console.log('[公式助手] HTTPS 已启动: https://localhost:3000'));
http.createServer(handler).listen(3100, () => console.log('[公式助手] HTTP 调试已启动: http://localhost:3100'));
