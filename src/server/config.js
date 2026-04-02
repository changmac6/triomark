import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export const PORT = Number(process.env.PORT || 8443);
export const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
export const CERT_PATH = process.env.TLS_CERT_PATH || path.join(ROOT_DIR, 'certs', 'server.crt');
export const KEY_PATH = process.env.TLS_KEY_PATH || path.join(ROOT_DIR, 'certs', 'server.key');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);
export const ROUTES = [
  '/healthz',
  '/hello-raw',
  '/fingerprint',
  '/fingerprint/debug',
  '/triomark-demo.html',
  '/triomark.js'
];

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${label}: ${filePath}`);
    console.error('Run: npm run gen-cert');
    process.exit(1);
  }
}

export function loadTlsOptions() {
  ensureFile(CERT_PATH, 'certificate');
  ensureFile(KEY_PATH, 'private key');
  return {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH)
  };
}
