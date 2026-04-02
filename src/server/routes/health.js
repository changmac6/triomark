import { URL } from 'node:url';
import { writeJson } from '../utils/json.js';

export function tryHandleHealth(req, res) {
  const pathname = new URL(req.url, 'https://localhost').pathname;
  if (pathname !== '/healthz') {
    return false;
  }
  writeJson(res, 200, { ok: true });
  return true;
}
