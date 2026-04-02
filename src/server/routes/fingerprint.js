import { URL } from 'node:url';
import { MAX_BODY_BYTES, PORT, TRUST_PROXY } from '../config.js';
import { writeJson, readBodyBuffer } from '../utils/json.js';
import { getHeader } from '../utils/text.js';
import { parseIpData } from '../parsers/ip.js';
import { parseUrlData } from '../parsers/url.js';
import { parseHttpData } from '../parsers/headers.js';
import { parseClientHints } from '../parsers/client-hints.js';
import { parseTlsData } from '../parsers/tls.js';
import { parseBodyData } from '../parsers/body.js';
import { buildFingerprintPayload } from '../builders/fingerprint-payload.js';

export async function tryHandleFingerprint(req, res) {
  const pathname = new URL(req.url, 'https://localhost').pathname;
  if (pathname === '/hello-raw') {
    const ipData = parseIpData(req, { trustProxy: TRUST_PROXY });
    writeJson(res, 200, {
      clientIp: ipData.clientIp,
      tlsClientHello: req.socket.tlsClientHello || null
    });
    return true;
  }
  const isFingerprint = pathname === '/fingerprint' || pathname === '/fingerprint/debug';
  if (!isFingerprint) {
    return false;
  }
  const debug = pathname === '/fingerprint/debug';
  const startedAtNs = process.hrtime.bigint();
  const bodyBuffer = await readBodyBuffer(req, { maxBytes: MAX_BODY_BYTES });
  const ipData = parseIpData(req, { trustProxy: TRUST_PROXY });
  const urlData = parseUrlData(req);
  const httpData = parseHttpData(req);
  const clientHintsData = parseClientHints(req);
  const tlsData = parseTlsData(req, { debug });
  const bodyData = parseBodyData(bodyBuffer, getHeader(req, 'content-type'));
  const payload = buildFingerprintPayload({
    req,
    res,
    startedAtNs,
    ipData,
    urlData,
    httpData,
    clientHintsData,
    tlsData,
    bodyData
  }, { port: PORT });
  writeJson(res, 200, payload);
  return true;
}
