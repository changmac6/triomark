import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import os from 'node:os';
import { URL, fileURLToPath } from 'node:url';
import { trackClientHellos } from 'read-tls-client-hello';
import {
  normalizeEvaluateRequest,
  buildRiskEvent,
  buildEvaluateResponse,
  buildErrorResponse,
  createEventId,
} from './src/risk/schema.js';
import { appendRiskEvent } from './src/risk/storage.js';
import { evaluateRisk } from './src/risk/scoring-engine.js';
import { buildActionPolicy } from './src/risk/action-policy.js';
import { buildEvaluationSummary } from './src/risk/evaluation-summary.js';
import { appendRiskLabel, loadRiskLabels } from './src/risk/label-store.js';
import { listRecentRiskEvents, findRiskEventById } from './src/risk/review-store.js';
import { buildReviewMetrics } from './src/risk/review-metrics.js';
import { seedDemoDataset } from './src/risk/demo-seed.js';
import { compareStoredEvents } from './src/risk/rule-compare.js';
import { listScoringVariants } from './src/risk/scoring-variants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8443);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const CERT_PATH = process.env.TLS_CERT_PATH || './certs/server.crt';
const KEY_PATH = process.env.TLS_KEY_PATH || './certs/server.key';

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${label}: ${filePath}`);
    console.error('Run: npm run gen-cert');
    process.exit(1);
  }
}

ensureFile(CERT_PATH, 'certificate');
ensureFile(KEY_PATH, 'private key');

function writeJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

function writeText(res, statusCode, contentType, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', contentType);
  res.end(body);
}

const MAX_JSON_BODY_BYTES = 1024 * 1024 * 3;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_JSON_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), {
          code: 'PAYLOAD_TOO_LARGE',
          status: 413,
        }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          reject(Object.assign(new Error('Request body must not be empty'), {
            code: 'INVALID_JSON',
            status: 400,
          }));
          return;
        }
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), {
          code: 'INVALID_JSON',
          status: 400,
        }));
      }
    });

    req.on('error', (error) => reject(error));
  });
}

function readOptionalJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_JSON_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), {
          code: 'PAYLOAD_TOO_LARGE',
          status: 413,
        }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), {
          code: 'INVALID_JSON',
          status: 400,
        }));
      }
    });

    req.on('error', (error) => reject(error));
  });
}

function getHeader(req, name) {
  const value = req.headers[name];
  if (Array.isArray(value)) return value.join(', ');
  return value ?? null;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashJson(value) {
  return sha256Hex(JSON.stringify(value ?? null));
}

function getClientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff && typeof xff === 'string') {
      return xff.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress ?? '';
}

function getForwardedForChain(req) {
  const xff = req.headers['x-forwarded-for'];
  if (!xff || typeof xff !== 'string') return [];
  return xff.split(',').map(v => v.trim()).filter(Boolean);
}

function getHeaderNamesInOrder(req) {
  return Object.keys(req.headers);
}

function parseCookieNames(cookieRaw) {
  if (!cookieRaw) return [];
  return cookieRaw
    .split(';')
    .map(v => v.split('=')[0]?.trim())
    .filter(Boolean);
}

function parseHost(host) {
  if (!host) {
    return {
      raw: null,
      hostnameOnly: null,
      port: null,
      isLocalhost: false,
      isIpLiteral: false,
    };
  }

  const hasScheme = host.includes('://');
  const url = new URL(hasScheme ? host : `https://${host}`);
  const hostnameOnly = url.hostname;
  const port = url.port || null;

  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameOnly);
  const isIpv6 = hostnameOnly.includes(':');
  const isIpLiteral = isIpv4 || isIpv6;
  const isLocalhost =
    hostnameOnly === 'localhost' ||
    hostnameOnly === '127.0.0.1' ||
    hostnameOnly === '::1';

  return {
    raw: host,
    hostnameOnly,
    port,
    isLocalhost,
    isIpLiteral,
  };
}

function getExtensionIds(hello) {
  if (!hello?.extensions || !Array.isArray(hello.extensions)) return [];
  return hello.extensions.map(ext => ext?.id).filter(v => typeof v === 'number');
}

const TLS_EXTENSION_NAMES = {
  0: 'server_name',
  5: 'status_request',
  10: 'supported_groups',
  11: 'ec_point_formats',
  13: 'signature_algorithms',
  16: 'alpn',
  18: 'signed_certificate_timestamp',
  21: 'padding',
  23: 'extended_master_secret',
  27: 'compress_certificate',
  35: 'session_ticket',
  41: 'pre_shared_key',
  43: 'supported_versions',
  45: 'psk_key_exchange_modes',
  51: 'key_share',
  65281: 'renegotiation_info',
};

function getExtensionNames(extensionIds) {
  return extensionIds.map(id => ({
    id,
    name: TLS_EXTENSION_NAMES[id] || 'unknown',
  }));
}

function getExtensionMap(hello) {
  const result = {};
  if (!hello?.extensions || !Array.isArray(hello.extensions)) return result;

  for (const ext of hello.extensions) {
    if (!ext || typeof ext.id !== 'number') continue;
    result[String(ext.id)] = ext.data ?? null;
  }
  return result;
}

function isGreaseValue(value) {
  if (typeof value !== 'number') return false;
  const high = (value >> 8) & 0xff;
  const low = value & 0xff;
  return high === low && (low & 0x0f) === 0x0a;
}

function filterGrease(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(v => !isGreaseValue(v));
}

function splitJa4(ja4) {
  if (!ja4 || typeof ja4 !== 'string') {
    return {
      ja4Prefix: null,
      ja4CipherHash: null,
      ja4ExtensionHash: null,
    };
  }

  const parts = ja4.split('_');
  return {
    ja4Prefix: parts[0] || null,
    ja4CipherHash: parts[1] || null,
    ja4ExtensionHash: parts[2] || null,
  };
}

function buildRequestId() {
  return crypto.randomUUID();
}

function buildTimestampInfo(now = new Date()) {
  return {
    iso: now.toISOString(),
    timestampMs: now.getTime(),
    hourOfDay: now.getHours(),
    weekday: now.getDay(),
  };
}

function getArrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function getFirst(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function getLast(value) {
  return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : null;
}

function getStringLength(value) {
  return typeof value === 'string' ? value.length : 0;
}

function parseAcceptLanguage(header) {
  if (!header) {
    return {
      primaryLanguage: null,
      languageTags: [],
      languageTagCount: 0,
      languageWeights: [],
    };
  }

  const items = header
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const parsed = items.map(item => {
    const [tagPart, ...params] = item.split(';').map(v => v.trim());
    let q = 1;
    for (const param of params) {
      if (param.startsWith('q=')) {
        const num = Number(param.slice(2));
        if (!Number.isNaN(num)) q = num;
      }
    }
    return { tag: tagPart, q };
  });

  return {
    primaryLanguage: parsed[0]?.tag || null,
    languageTags: parsed.map(v => v.tag),
    languageTagCount: parsed.length,
    languageWeights: parsed.map(v => ({ tag: v.tag, q: v.q })),
  };
}

function parseCsvHeader(header) {
  if (!header) return [];
  return header.split(',').map(v => v.trim()).filter(Boolean);
}

function safePeerCertificate(socket) {
  try {
    const cert = socket.getPeerCertificate?.(true);
    if (!cert || Object.keys(cert).length === 0) {
      return {
        presented: false,
        subject: null,
        issuer: null,
        validFrom: null,
        validTo: null,
        fingerprint256: null,
      };
    }

    return {
      presented: true,
      subject: cert.subject ?? null,
      issuer: cert.issuer ?? null,
      validFrom: cert.valid_from ?? null,
      validTo: cert.valid_to ?? null,
      fingerprint256: cert.fingerprint256 ?? null,
    };
  } catch {
    return {
      presented: false,
      subject: null,
      issuer: null,
      validFrom: null,
      validTo: null,
      fingerprint256: null,
    };
  }
}

function serveStaticFile(res, filePath, contentType) {
  try {
    const body = fs.readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

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

function tryServeStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const publicDir = path.join(__dirname, 'public');
  const requestUrl = new URL(req.url, 'https://localhost');
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/') {
    pathname = '/triomark-demo.html';
  }

  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    writeJson(res, 403, { error: 'forbidden' });
    return true;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const contentType = getContentType(filePath);
  const body = fs.readFileSync(filePath);

  res.statusCode = 200;
  res.setHeader('content-type', contentType);
  res.end(req.method === 'HEAD' ? '' : body);
  return true;
}

function buildFingerprintPayload(req, res, { debug = false } = {}) {
  const hello = req.socket.tlsClientHello || null;
  const clientIp = getClientIp(req);
  const forwardedForChain = getForwardedForChain(req);
  const headerNamesInOrder = getHeaderNamesInOrder(req);
  const requestId = buildRequestId();
  const nowInfo = buildTimestampInfo(new Date());
  const hostRaw = getHeader(req, 'host');
  const hostParsed = parseHost(hostRaw);
  const requestStartHrtime = process.hrtime.bigint();

  const extensionMap = getExtensionMap(hello);
  const extensionIds = getExtensionIds(hello);
  const extensionNames = getExtensionNames(extensionIds);

  const knownExtensionIds = extensionIds.filter(id => TLS_EXTENSION_NAMES[id]);
  const unknownExtensionIds = extensionIds.filter(id => !TLS_EXTENSION_NAMES[id]);

  const alpnFromExtension = extensionMap['16']?.protocols ?? null;
  const sniFromExtension = extensionMap['0']?.serverName ?? null;
  const supportedVersions = extensionMap['43']?.versions ?? null;
  const supportedGroups = extensionMap['10']?.groups ?? null;
  const signatureAlgorithms = extensionMap['13']?.algorithms ?? null;
  const ecPointFormats = extensionMap['11']?.formats ?? null;
  const pskModes = extensionMap['45']?.modes ?? null;
  const keyShare = extensionMap['51']?.entries ?? null;
  const paddingLength = extensionMap['21']?.paddingLength ?? null;

  const keyShareGroupIds = (keyShare || [])
    .map(v => v?.group)
    .filter(v => typeof v === 'number');

  const greaseCipherSuites = (hello?.cipherSuites || []).filter(isGreaseValue);
  const greaseExtensionIds = extensionIds.filter(isGreaseValue);
  const greaseGroupIds = (supportedGroups || []).filter(isGreaseValue);
  const greaseSupportedVersions = (supportedVersions || []).filter(isGreaseValue);
  const greaseKeyShareGroups = keyShareGroupIds.filter(isGreaseValue);

  const normalizedCipherSuites = filterGrease(hello?.cipherSuites || []);
  const normalizedExtensionIds = filterGrease(extensionIds);
  const normalizedSupportedGroups = filterGrease(supportedGroups || []);
  const normalizedSupportedVersions = filterGrease(supportedVersions || []);
  const normalizedKeyShareGroupIds = filterGrease(keyShareGroupIds);

  const hasGrease =
    greaseCipherSuites.length > 0 ||
    greaseExtensionIds.length > 0 ||
    greaseGroupIds.length > 0 ||
    greaseSupportedVersions.length > 0 ||
    greaseKeyShareGroups.length > 0;

  const ja4 = hello?.ja4 ?? null;
  const { ja4Prefix, ja4CipherHash, ja4ExtensionHash } = splitJa4(ja4);

  const negotiatedProtocol = req.socket.getProtocol?.() || null;
  const negotiatedAlpn = req.socket.alpnProtocol || null;
  const negotiatedCipher = req.socket.getCipher?.() || null;
  const ephemeralKeyInfo = req.socket.getEphemeralKeyInfo?.() || null;
  const peerCertificate = safePeerCertificate(req.socket);

  const offeredProtocols = Array.isArray(alpnFromExtension) ? alpnFromExtension : [];
  const offeredH2 = offeredProtocols.includes('h2');
  const negotiatedH2 = negotiatedAlpn === 'h2';
  const alpnMismatch =
    offeredProtocols.length > 0 &&
    negotiatedAlpn !== null &&
    !offeredProtocols.includes(negotiatedAlpn);

  const cookieRaw = getHeader(req, 'cookie');
  const cookieNames = parseCookieNames(cookieRaw);

  const queryUrl = new URL(req.url, `https://${hostRaw || 'localhost'}`);
  const queryParamKeys = [...queryUrl.searchParams.keys()];

  const rawHeaders = req.rawHeaders || [];
  const rawTrailers = req.rawTrailers || [];
  const headersDistinct = req.headersDistinct || null;

  const contentLengthRaw = getHeader(req, 'content-length');
  const contentLengthNumeric = contentLengthRaw ? Number(contentLengthRaw) : null;
  const transferEncoding = getHeader(req, 'transfer-encoding');

  const acceptItems = parseCsvHeader(getHeader(req, 'accept'));
  const acceptEncodingItems = parseCsvHeader(getHeader(req, 'accept-encoding'));
  const acceptLanguageParsed = parseAcceptLanguage(getHeader(req, 'accept-language'));

  const hostVsSniMatch =
    typeof hostParsed.hostnameOnly === 'string' &&
    typeof sniFromExtension === 'string'
      ? hostParsed.hostnameOnly === sniFromExtension
      : null;

  const hostVsServernameMatch =
    typeof hostParsed.hostnameOnly === 'string' &&
    typeof req.socket.servername === 'string'
      ? hostParsed.hostnameOnly === req.socket.servername
      : null;

  const servernameVsSniMatch =
    typeof req.socket.servername === 'string' &&
    typeof sniFromExtension === 'string'
      ? req.socket.servername === sniFromExtension
      : null;

  const methodUpper = (req.method || '').toUpperCase();
  const methodUsuallyHasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(methodUpper);
  const hasBodyByHeaders =
    (Number.isFinite(contentLengthNumeric) && contentLengthNumeric > 0) ||
    !!transferEncoding;
  const bodyHeaderMismatch = methodUsuallyHasBody ? !hasBodyByHeaders : hasBodyByHeaders;

  const responseStartNs = requestStartHrtime;
  const responseNowNs = process.hrtime.bigint();
  const responseTimeMs = Number(responseNowNs - responseStartNs) / 1_000_000;

  const payload = {
    requestId,
    timestamp: nowInfo.iso,
    timestampMs: nowInfo.timestampMs,
    hourOfDay: nowInfo.hourOfDay,
    weekday: nowInfo.weekday,

    process: {
      pid: process.pid,
      hostname: os.hostname(),
      serverPort: PORT,
      requestStartHrtime: responseStartNs.toString(),
    },

    network: {
      clientIp,
      forwardedForChain,
      proxyHopCount: forwardedForChain.length,
      host: hostRaw,
      hostParsed,
      method: req.method,
      url: req.url,
      path: queryUrl.pathname,
      pathHash: sha256Hex(queryUrl.pathname),
      queryStringRaw: queryUrl.search,
      queryStringHash: sha256Hex(queryUrl.search),
      queryParamKeys,
      queryParamKeysHash: hashJson(queryParamKeys),
      queryParamCount: queryParamKeys.length,
      referer: getHeader(req, 'referer'),
      origin: getHeader(req, 'origin'),
      forwardedFor: getHeader(req, 'x-forwarded-for'),
      xForwardedProto: getHeader(req, 'x-forwarded-proto'),
      xForwardedHost: getHeader(req, 'x-forwarded-host'),
      forwarded: getHeader(req, 'forwarded'),
      via: getHeader(req, 'via'),
    },

    socket: {
      remoteAddress: req.socket.remoteAddress ?? null,
      remoteFamily: req.socket.remoteFamily ?? null,
      remotePort: req.socket.remotePort ?? null,
      localAddress: req.socket.localAddress ?? null,
      localPort: req.socket.localPort ?? null,
      encrypted: !!req.socket.encrypted,
      authorized: req.socket.authorized ?? null,
      authorizationError: req.socket.authorizationError ?? null,
    },

    http: {
      httpVersion: req.httpVersion,
      httpVersionMajor: req.httpVersionMajor,
      httpVersionMinor: req.httpVersionMinor,
      complete: req.complete,
      aborted: req.aborted,
      upgrade: req.headers.upgrade ?? null,

      headerNamesInOrder,
      headerCount: headerNamesInOrder.length,
      rawHeaders,
      rawTrailers,
      trailers: req.trailers || null,
      headersDistinct,

      headerOrderHash: hashJson(headerNamesInOrder),
      headerNameSetHash: hashJson([...headerNamesInOrder].sort()),
      rawHeaderPairsHash: hashJson(rawHeaders),
      rawHeadersLengthTotal: rawHeaders.reduce((sum, v) => sum + String(v).length, 0),

      userAgent: getHeader(req, 'user-agent'),
      userAgentLength: getStringLength(getHeader(req, 'user-agent')),
      accept: getHeader(req, 'accept'),
      acceptLength: getStringLength(getHeader(req, 'accept')),
      acceptItems,
      acceptItemCount: acceptItems.length,
      acceptEncoding: getHeader(req, 'accept-encoding'),
      acceptEncodingItems,
      acceptEncodingCount: acceptEncodingItems.length,
      acceptLanguage: getHeader(req, 'accept-language'),
      acceptLanguageLength: getStringLength(getHeader(req, 'accept-language')),
      primaryLanguage: acceptLanguageParsed.primaryLanguage,
      languageTags: acceptLanguageParsed.languageTags,
      languageTagCount: acceptLanguageParsed.languageTagCount,
      languageWeights: acceptLanguageParsed.languageWeights,

      cacheControl: getHeader(req, 'cache-control'),
      pragma: getHeader(req, 'pragma'),
      upgradeInsecureRequests: getHeader(req, 'upgrade-insecure-requests'),
      secFetchSite: getHeader(req, 'sec-fetch-site'),
      secFetchMode: getHeader(req, 'sec-fetch-mode'),
      secFetchDest: getHeader(req, 'sec-fetch-dest'),
      secFetchUser: getHeader(req, 'sec-fetch-user'),
      dnt: getHeader(req, 'dnt'),
      secGpc: getHeader(req, 'sec-gpc'),
      priority: getHeader(req, 'priority'),
      authorization: getHeader(req, 'authorization'),

      hasSecFetch: headerNamesInOrder.some(h => h.startsWith('sec-fetch-')),
      hasClientHints: headerNamesInOrder.some(h => h.startsWith('sec-ch-')),
      hasReferer: !!getHeader(req, 'referer'),
      hasOrigin: !!getHeader(req, 'origin'),
      hasAuthorization: !!getHeader(req, 'authorization'),

      cookieRaw,
      cookieRawLength: getStringLength(cookieRaw),
      cookieNames,
      cookieCount: cookieNames.length,
      cookieNameOrder: cookieNames,
      cookieNameHash: hashJson(cookieNames),
      hasCookie: cookieNames.length > 0,

      contentType: getHeader(req, 'content-type'),
      contentLength: contentLengthRaw,
      contentLengthNumeric: Number.isFinite(contentLengthNumeric) ? contentLengthNumeric : null,
      contentEncoding: getHeader(req, 'content-encoding'),
      transferEncoding,
      hasChunkedEncoding:
        typeof transferEncoding === 'string' &&
        transferEncoding.toLowerCase().includes('chunked'),
      hasBodyByMethod: methodUsuallyHasBody,
      hasBodyByHeaders,
      bodyHeaderMismatch,
    },

    clientHints: {
      secChUa: getHeader(req, 'sec-ch-ua'),
      secChUaLength: getStringLength(getHeader(req, 'sec-ch-ua')),
      secChUaMobile: getHeader(req, 'sec-ch-ua-mobile'),
      secChUaPlatform: getHeader(req, 'sec-ch-ua-platform'),
      secChUaPlatformVersion: getHeader(req, 'sec-ch-ua-platform-version'),
      secChUaArch: getHeader(req, 'sec-ch-ua-arch'),
      secChUaBitness: getHeader(req, 'sec-ch-ua-bitness'),
      secChUaModel: getHeader(req, 'sec-ch-ua-model'),
      secChUaFullVersion: getHeader(req, 'sec-ch-ua-full-version'),
      secChUaFullVersionList: getHeader(req, 'sec-ch-ua-full-version-list'),
      secChPrefersColorScheme: getHeader(req, 'sec-ch-prefers-color-scheme'),
    },

    tls: {
      negotiatedProtocol,
      negotiatedCipher,
      ephemeralKeyInfo,
      peerCertificate,
      servername: req.socket.servername || null,
      alpnProtocol: negotiatedAlpn,

      ja3: hello?.ja3 ?? null,
      ja4,
      ja4Prefix,
      ja4CipherHash,
      ja4ExtensionHash,

      clientHelloVersion: hello?.version ?? null,
      cipherSuites: hello?.cipherSuites ?? null,
      cipherSuitesCount: getArrayCount(hello?.cipherSuites),
      cipherSuitesFirst: getFirst(hello?.cipherSuites),
      cipherSuitesLast: getLast(hello?.cipherSuites),
      compressionMethods: hello?.compressionMethods ?? null,

      extensionIds,
      extensionNames,
      extensionCount: getArrayCount(hello?.extensions),
      extensionsFirst: getFirst(extensionIds),
      extensionsLast: getLast(extensionIds),
      knownExtensionIds,
      knownExtensionCount: knownExtensionIds.length,
      knownExtensionRatio: extensionIds.length ? knownExtensionIds.length / extensionIds.length : null,
      unknownExtensionIds,
      unknownExtensionCount: unknownExtensionIds.length,
      unknownExtensionRatio: extensionIds.length ? unknownExtensionIds.length / extensionIds.length : null,

      sniFromExtension,
      sniLength: typeof sniFromExtension === 'string' ? sniFromExtension.length : 0,
      isSniLocalhost: sniFromExtension === 'localhost',
      hostVsSniMatch,
      hostVsServernameMatch,
      servernameVsSniMatch,

      alpnFromExtension,
      alpnCount: offeredProtocols.length,
      alpnHash: hashJson(offeredProtocols),
      offeredH2,
      negotiatedH2,
      alpnMismatch,

      supportedVersions,
      supportedVersionsCount: getArrayCount(supportedVersions),
      supportedGroups,
      supportedGroupsCount: getArrayCount(supportedGroups),
      supportedGroupsFirst: getFirst(supportedGroups),
      supportedGroupsLast: getLast(supportedGroups),
      signatureAlgorithms,
      signatureAlgorithmsCount: getArrayCount(signatureAlgorithms),
      signatureAlgorithmsFirst: getFirst(signatureAlgorithms),
      signatureAlgorithmsLast: getLast(signatureAlgorithms),
      ecPointFormats,
      ecPointFormatsCount: getArrayCount(ecPointFormats),
      pskModes,
      keyShare,
      keyShareCount: getArrayCount(keyShare),
      keyShareGroupIds,
      keyShareGroupIdsHash: hashJson(keyShareGroupIds),
      paddingLength,

      hasGrease,
      greaseCipherSuites,
      greaseExtensionIds,
      greaseGroupIds,
      greaseSupportedVersions,
      greaseKeyShareGroups,

      normalizedCipherSuites,
      normalizedExtensionIds,
      normalizedSupportedGroups,
      normalizedSupportedVersions,
      normalizedKeyShareGroupIds,

      cipherSuitesHash: hashJson(hello?.cipherSuites || []),
      extensionIdsHash: hashJson(extensionIds),
      supportedVersionsHash: hashJson(supportedVersions || []),
      supportedGroupsHash: hashJson(supportedGroups || []),
      signatureAlgorithmsHash: hashJson(signatureAlgorithms || []),
      ecPointFormatsHash: hashJson(ecPointFormats || []),
      normalizedCipherSuitesHash: hashJson(normalizedCipherSuites),
      normalizedExtensionIdsHash: hashJson(normalizedExtensionIds),
      normalizedSupportedGroupsHash: hashJson(normalizedSupportedGroups),
      normalizedSupportedVersionsHash: hashJson(normalizedSupportedVersions),
    },

    response: {
      statusCode: res.statusCode || 200,
      responseTimeMs,
      responseContentType: res.getHeader('content-type') || 'application/json; charset=utf-8',
      responseHeaderNames: res.getHeaderNames(),
    },
  };

  if (debug) {
    payload.tls.rawClientHello = hello;
  }

  return payload;
}


const server = https.createServer({
  cert: fs.readFileSync(CERT_PATH),
  key: fs.readFileSync(KEY_PATH),
});

trackClientHellos(server);

server.on('request', async (req, res) => {
  try {
    if (tryServeStatic(req, res)) {
      return;
    }

    if (req.url === '/healthz') {
      return writeJson(res, 200, { ok: true });
    }

    if (req.url === '/hello-raw') {
      return writeJson(res, 200, {
        clientIp: getClientIp(req),
        tlsClientHello: req.socket.tlsClientHello || null,
      });
    }

    if (req.url === '/fingerprint') {
      return writeJson(res, 200, buildFingerprintPayload(req, res, { debug: false }));
    }

    if (req.url === '/fingerprint/debug') {
      return writeJson(res, 200, buildFingerprintPayload(req, res, { debug: true }));
    }

    const requestUrl = new URL(req.url, 'https://localhost');

    if (requestUrl.pathname === '/api/evaluate' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const normalized = normalizeEvaluateRequest(body);
      const debugMode = requestUrl.searchParams.get('debug') === '1';
      const serverSnapshot = buildFingerprintPayload(req, res, { debug: debugMode });
      const receivedAt = new Date().toISOString();
      const eventId = createEventId(new Date(receivedAt));

      const evaluation = evaluateRisk({
        provider: normalized.provider,
        conversation: normalized.conversation,
        page: normalized.page,
        context: normalized.context,
        client: normalized.client,
        server: serverSnapshot,
      });
      const action = buildActionPolicy(evaluation.level, { browserSupportLevel: evaluation.browserSupportLevel });

      const event = buildRiskEvent({
        normalizedRequest: normalized,
        serverSnapshot,
        evaluation,
        action,
        eventId,
        receivedAt,
      });

      const storage = await appendRiskEvent(event);
      const diagnostics = {
        storage: {
          eventBytes: storage.eventBytes,
          bytesWritten: storage.bytesWritten,
        },
        evaluationSummary: buildEvaluationSummary({ evaluation, event }),
      };

      if (debugMode) {
        diagnostics.normalizedRequest = normalized;
        diagnostics.rawEvent = event;
      }

      return writeJson(
        res,
        200,
        buildEvaluateResponse({
          eventId,
          receivedAt,
          evaluation,
          action,
          warnings: normalized.warnings,
          diagnostics,
        })
      );
    }


    if (requestUrl.pathname === '/api/review/variants' && req.method === 'GET') {
      return writeJson(res, 200, {
        ok: true,
        variants: listScoringVariants(),
      });
    }

    if (requestUrl.pathname === '/api/review/compare-rules' && req.method === 'GET') {
      const labels = loadRiskLabels();
      const comparison = await compareStoredEvents({
        baseVariant: requestUrl.searchParams.get('base') || 'stable_v1',
        candidateVariant: requestUrl.searchParams.get('candidate') || 'candidate_consistency_v2',
        labels,
        filters: {
          providerId: requestUrl.searchParams.get('providerId'),
          level: requestUrl.searchParams.get('level'),
          browserSupportLevel: requestUrl.searchParams.get('browserSupportLevel'),
          clientProfile: requestUrl.searchParams.get('clientProfile'),
          serverProfile: requestUrl.searchParams.get('serverProfile'),
          label: requestUrl.searchParams.get('label'),
          action: requestUrl.searchParams.get('action'),
        },
      });
      return writeJson(res, 200, {
        ok: true,
        comparison,
      });
    }

    if (requestUrl.pathname === '/api/review/metrics' && req.method === 'GET') {
      const labels = loadRiskLabels();
      const filters = {
        providerId: requestUrl.searchParams.get('providerId'),
        level: requestUrl.searchParams.get('level'),
        browserSupportLevel: requestUrl.searchParams.get('browserSupportLevel'),
        clientProfile: requestUrl.searchParams.get('clientProfile'),
        serverProfile: requestUrl.searchParams.get('serverProfile'),
        label: requestUrl.searchParams.get('label'),
        action: requestUrl.searchParams.get('action'),
      };

      const metrics = await buildReviewMetrics({
        labelsByEventId: labels.byEventId,
        filters,
        recentLimit: requestUrl.searchParams.get('recentLimit') ?? 20,
      });

      return writeJson(res, 200, {
        ok: true,
        labelsFile: labels.filePath,
        ...metrics,
      });
    }

    if (requestUrl.pathname === '/api/review/events' && req.method === 'GET') {
      const labels = loadRiskLabels();
      const result = await listRecentRiskEvents({
        limit: requestUrl.searchParams.get('limit') ?? 50,
        providerId: requestUrl.searchParams.get('providerId'),
        level: requestUrl.searchParams.get('level'),
        browserSupportLevel: requestUrl.searchParams.get('browserSupportLevel'),
        clientProfile: requestUrl.searchParams.get('clientProfile'),
        serverProfile: requestUrl.searchParams.get('serverProfile'),
        label: requestUrl.searchParams.get('label'),
        action: requestUrl.searchParams.get('action'),
        labelsByEventId: labels.byEventId,
      });

      return writeJson(res, 200, {
        ok: true,
        rootDir: result.rootDir,
        labelsFile: labels.filePath,
        scannedFiles: result.scannedFiles,
        scannedEvents: result.scannedEvents,
        count: result.items.length,
        items: result.items,
      });
    }

    if (requestUrl.pathname.startsWith('/api/review/events/') && req.method === 'GET') {
      const eventId = decodeURIComponent(requestUrl.pathname.slice('/api/review/events/'.length));
      const labels = loadRiskLabels();
      const found = await findRiskEventById(eventId, { labelsByEventId: labels.byEventId });
      if (!found) {
        return writeJson(res, 404, {
          ok: false,
          error: {
            code: 'EVENT_NOT_FOUND',
            message: `Risk event not found: ${eventId}`,
            field: 'eventId',
          },
        });
      }

      const includeRaw = requestUrl.searchParams.get('raw') === '1';
      return writeJson(res, 200, {
        ok: true,
        labelsFile: labels.filePath,
        filePath: found.filePath,
        lineNumber: found.lineNumber,
        summary: found.summary,
        label: found.labelRecord,
        event: includeRaw ? found.event : undefined,
      });
    }

    if (requestUrl.pathname === '/api/review/seed-demo' && req.method === 'POST') {
      const body = await readOptionalJsonBody(req);
      const result = await seedDemoDataset({
        reset: body?.reset === true,
        reviewer: body?.reviewer ? String(body.reviewer).trim() : 'demo_seed',
      });

      return writeJson(res, 200, result);
    }

    if (requestUrl.pathname === '/api/review/labels' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const eventId = String(body?.eventId ?? '').trim();
      const label = String(body?.label ?? '').trim();
      const reviewer = body?.reviewer ?? null;
      const notes = body?.notes ?? null;

      if (!eventId) {
        throw Object.assign(new Error('Missing required field: eventId'), {
          code: 'INVALID_REQUEST',
          field: 'eventId',
          status: 400,
        });
      }

      const labels = loadRiskLabels();
      const found = await findRiskEventById(eventId, { labelsByEventId: labels.byEventId });
      if (!found) {
        return writeJson(res, 404, {
          ok: false,
          error: {
            code: 'EVENT_NOT_FOUND',
            message: `Risk event not found: ${eventId}`,
            field: 'eventId',
          },
        });
      }

      const appended = appendRiskLabel({
        eventId,
        label,
        reviewer,
        notes,
        sourceFile: found.filePath,
        metadata: {
          providerId: found.event?.provider?.providerId ?? null,
          conversationId: found.event?.conversation?.conversationId ?? null,
          level: found.event?.derived?.level ?? null,
          totalRiskScore: found.event?.derived?.totalRiskScore ?? null,
          browserSupportLevel: found.event?.derived?.browserSupportLevel ?? null,
          clientProfile: found.event?.derived?.clientProfile ?? null,
          serverProfile: found.event?.derived?.serverProfile ?? null,
        },
      });

      return writeJson(res, 200, {
        ok: true,
        labelsFile: appended.filePath,
        record: appended.record,
        summary: found.summary,
      });
    }

    return writeJson(res, 200, {
      message: 'clientmark is running',
      routes: [
        '/healthz',
        '/hello-raw',
        '/fingerprint',
        '/fingerprint/debug',
        '/api/evaluate',
        '/api/review/events',
        '/api/review/metrics',
        '/api/review/variants',
        '/api/review/compare-rules',
        '/api/review/events/:eventId',
        '/api/review/labels',
        '/api/review/seed-demo',
        '/triomark-demo.html',
        '/risk-review.html',
        '/risk-metrics.html',
        '/triomark.js',
      ],
    });
  } catch (error) {
    const response = buildErrorResponse({
      code: error?.code || 'INTERNAL_ERROR',
      message: error?.message || 'Internal error',
      field: error?.field || null,
      details: error?.details || null,
      status: error?.status || 500,
    });
    return writeJson(res, response.status, response.body);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTPS server listening on https://0.0.0.0:${PORT}`);
  console.log(`TRUST_PROXY=${TRUST_PROXY}`);
});