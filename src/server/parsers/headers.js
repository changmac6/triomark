import { hashJson } from '../utils/hash.js';
import {
  getHeader,
  getStringLength,
  parseAcceptLanguage,
  parseContentType,
  parseCookieNames,
  parseCsvHeader,
  parseWeightedHeader
} from '../utils/text.js';

function getHeaderNamesInOrder(req) {
  return Object.keys(req.headers);
}

function getDuplicateHeaderNames(req) {
  const counts = new Map();
  const rawHeaders = req.rawHeaders || [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const rawName = rawHeaders[index];
    if (!rawName) continue;
    const normalized = rawName.toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function getHeaderCasingSummary(req) {
  const groups = new Map();
  const rawHeaders = req.rawHeaders || [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const rawName = rawHeaders[index];
    if (!rawName) continue;
    const normalized = rawName.toLowerCase();
    if (!groups.has(normalized)) {
      groups.set(normalized, new Set());
    }
    groups.get(normalized).add(rawName);
  }
  return [...groups.entries()].map(([normalized, rawVariants]) => ({
    normalized,
    rawVariants: [...rawVariants]
  }));
}

export function parseHttpData(req) {
  const headerNamesInOrder = getHeaderNamesInOrder(req);
  const rawHeaders = req.rawHeaders || [];
  const rawTrailers = req.rawTrailers || [];
  const accept = getHeader(req, 'accept');
  const acceptEncoding = getHeader(req, 'accept-encoding');
  const acceptLanguage = getHeader(req, 'accept-language');
  const cookieRaw = getHeader(req, 'cookie');
  const contentType = getHeader(req, 'content-type');
  const contentLength = getHeader(req, 'content-length');
  const contentLengthNumeric = contentLength ? Number(contentLength) : null;
  const transferEncoding = getHeader(req, 'transfer-encoding');
  const acceptParsed = parseWeightedHeader(accept);
  const acceptEncodingParsed = parseWeightedHeader(acceptEncoding);
  const acceptLanguageParsed = parseAcceptLanguage(acceptLanguage);
  const cookieNames = parseCookieNames(cookieRaw);
  const methodUpper = String(req.method || '').toUpperCase();
  const hasBodyByMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(methodUpper);
  const hasBodyByHeaders = (Number.isFinite(contentLengthNumeric) && contentLengthNumeric > 0) || !!transferEncoding;
  return {
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
    headersDistinct: req.headersDistinct || null,
    headerOrderHash: hashJson(headerNamesInOrder),
    headerNameSetHash: hashJson([...headerNamesInOrder].sort()),
    rawHeaderPairsHash: hashJson(rawHeaders),
    rawHeadersLengthTotal: rawHeaders.reduce((sum, value) => sum + String(value).length, 0),
    duplicateHeaderNames: getDuplicateHeaderNames(req),
    headerCasingSummary: getHeaderCasingSummary(req),
    userAgent: getHeader(req, 'user-agent'),
    userAgentLength: getStringLength(getHeader(req, 'user-agent')),
    accept,
    acceptLength: getStringLength(accept),
    acceptItems: parseCsvHeader(accept),
    acceptItemCount: parseCsvHeader(accept).length,
    acceptParsed,
    acceptEncoding,
    acceptEncodingItems: parseCsvHeader(acceptEncoding),
    acceptEncodingCount: parseCsvHeader(acceptEncoding).length,
    acceptEncodingParsed,
    acceptLanguage,
    acceptLanguageLength: getStringLength(acceptLanguage),
    acceptLanguageParsed,
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
    hasSecFetch: headerNamesInOrder.some((name) => name.startsWith('sec-fetch-')),
    hasClientHints: headerNamesInOrder.some((name) => name.startsWith('sec-ch-')),
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
    contentType,
    contentTypeParsed: parseContentType(contentType),
    contentLength,
    contentLengthNumeric: Number.isFinite(contentLengthNumeric) ? contentLengthNumeric : null,
    contentEncoding: getHeader(req, 'content-encoding'),
    transferEncoding,
    hasChunkedEncoding: typeof transferEncoding === 'string' && transferEncoding.toLowerCase().includes('chunked'),
    hasBodyByMethod,
    hasBodyByHeaders,
    bodyHeaderMismatch: hasBodyByMethod ? !hasBodyByHeaders : hasBodyByHeaders
  };
}
