import crypto from 'node:crypto';

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashJson(value) {
  return sha256Hex(JSON.stringify(value ?? null));
}
