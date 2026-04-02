import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { PUBLIC_DIR } from '../config.js';
import { writeJson } from '../utils/json.js';

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export function tryServeStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }
  const requestUrl = new URL(req.url, 'https://localhost');
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') {
    pathname = '/triomark-demo.html';
  }
  const normalizedPath = path.normalize(pathname).replace(/^([.][.][\/])+/, '');
  const filePath = path.join(PUBLIC_DIR, normalizedPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    writeJson(res, 403, { error: 'forbidden' });
    return true;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const body = fs.readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader('content-type', getContentType(filePath));
  res.end(req.method === 'HEAD' ? '' : body);
  return true;
}
