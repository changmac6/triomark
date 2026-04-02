import { URL } from 'node:url';
import { hashJson, sha256Hex } from '../utils/hash.js';
import { getHeader } from '../utils/text.js';

export function parseHost(host) {
  if (!host) {
    return {
      raw: null,
      hostnameOnly: null,
      port: null,
      isLocalhost: false,
      isIpLiteral: false
    };
  }
  const url = new URL(host.includes('://') ? host : `https://${host}`);
  const hostnameOnly = url.hostname;
  const port = url.port || null;
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameOnly);
  const isIpv6 = hostnameOnly.includes(':');
  const isIpLiteral = isIpv4 || isIpv6;
  const isLocalhost = hostnameOnly === 'localhost' || hostnameOnly === '127.0.0.1' || hostnameOnly === '::1';
  return {
    raw: host,
    hostnameOnly,
    port,
    isLocalhost,
    isIpLiteral
  };
}

export function parseUrlData(req) {
  const hostRaw = getHeader(req, 'host');
  const queryUrl = new URL(req.url, `https://${hostRaw || 'localhost'}`);
  const queryParamEntries = [];
  for (const [key, value] of queryUrl.searchParams.entries()) {
    queryParamEntries.push([key, value]);
  }
  const queryParamKeys = queryParamEntries.map(([key]) => key);
  const sortedQueryParamKeys = [...queryParamKeys].sort();
  const pathSegments = queryUrl.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
  return {
    host: hostRaw,
    hostParsed: parseHost(hostRaw),
    method: req.method,
    url: req.url,
    path: queryUrl.pathname,
    pathHash: sha256Hex(queryUrl.pathname),
    pathSegments,
    pathDepth: pathSegments.length,
    queryStringRaw: queryUrl.search,
    queryStringHash: sha256Hex(queryUrl.search),
    queryParamKeys,
    sortedQueryParamKeys,
    sortedQueryParamKeysHash: hashJson(sortedQueryParamKeys),
    queryParamEntries,
    queryParamCount: queryParamEntries.length,
    referer: getHeader(req, 'referer'),
    origin: getHeader(req, 'origin'),
    forwardedFor: getHeader(req, 'x-forwarded-for'),
    xForwardedProto: getHeader(req, 'x-forwarded-proto'),
    xForwardedHost: getHeader(req, 'x-forwarded-host'),
    forwarded: getHeader(req, 'forwarded'),
    via: getHeader(req, 'via')
  };
}
