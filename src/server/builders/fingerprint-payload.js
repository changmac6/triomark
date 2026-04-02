import os from 'node:os';
import crypto from 'node:crypto';

export function buildFingerprintPayload(context, options = {}) {
  const { req, res, startedAtNs, ipData, urlData, httpData, clientHintsData, tlsData, bodyData } = context;
  const now = new Date();
  const responseTimeMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
  const hostVsSniMatch = typeof urlData.hostParsed.hostnameOnly === 'string' && typeof tlsData.sniFromExtension === 'string'
    ? urlData.hostParsed.hostnameOnly === tlsData.sniFromExtension
    : null;
  const hostVsServernameMatch = typeof urlData.hostParsed.hostnameOnly === 'string' && typeof tlsData.servername === 'string'
    ? urlData.hostParsed.hostnameOnly === tlsData.servername
    : null;
  const servernameVsSniMatch = typeof tlsData.servername === 'string' && typeof tlsData.sniFromExtension === 'string'
    ? tlsData.servername === tlsData.sniFromExtension
    : null;
  return {
    requestId: crypto.randomUUID(),
    timestamp: now.toISOString(),
    timestampMs: now.getTime(),
    hourOfDay: now.getHours(),
    weekday: now.getDay(),
    process: {
      pid: process.pid,
      hostname: os.hostname(),
      serverPort: options.port,
      requestStartHrtime: startedAtNs.toString()
    },
    network: {
      ...ipData,
      ...urlData
    },
    socket: {
      remoteAddress: req.socket.remoteAddress ?? null,
      remoteFamily: req.socket.remoteFamily ?? null,
      remotePort: req.socket.remotePort ?? null,
      localAddress: req.socket.localAddress ?? null,
      localPort: req.socket.localPort ?? null,
      encrypted: !!req.socket.encrypted,
      authorized: req.socket.authorized ?? null,
      authorizationError: req.socket.authorizationError ?? null
    },
    http: httpData,
    clientHints: clientHintsData,
    tls: {
      ...tlsData,
      hostVsSniMatch,
      hostVsServernameMatch,
      servernameVsSniMatch
    },
    body: bodyData,
    response: {
      statusCode: res.statusCode || 200,
      responseTimeMs,
      responseContentType: res.getHeader('content-type') || 'application/json; charset=utf-8',
      responseHeaderNames: res.getHeaderNames()
    }
  };
}
