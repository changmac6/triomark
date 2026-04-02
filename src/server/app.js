import https from 'node:https';
import { trackClientHellos } from 'read-tls-client-hello';
import { ROUTES, TRUST_PROXY, loadTlsOptions } from './config.js';
import { tryServeStatic } from './routes/static.js';
import { tryHandleHealth } from './routes/health.js';
import { tryHandleFingerprint } from './routes/fingerprint.js';
import { writeJson } from './utils/json.js';

export function createAppServer() {
  const server = https.createServer(loadTlsOptions());
  trackClientHellos(server);
  server.on('request', (req, res) => {
    void handleRequest(req, res);
  });
  return server;
}

async function handleRequest(req, res) {
  try {
    if (tryServeStatic(req, res)) {
      return;
    }
    if (tryHandleHealth(req, res)) {
      return;
    }
    if (await tryHandleFingerprint(req, res)) {
      return;
    }
    return writeJson(res, 200, {
      message: 'triomark is running',
      trustProxy: TRUST_PROXY,
      routes: ROUTES
    });
  } catch (error) {
    return writeJson(res, 500, {
      error: 'internal_error',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
