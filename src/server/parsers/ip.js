import net from 'node:net';
import { getHeader } from '../utils/text.js';
import { hashJson } from '../utils/hash.js';

function normalizeIp(ip) {
  if (!ip) return '';
  return String(ip).replace(/^::ffff:/, '').trim();
}

function parseForwardedForChain(req) {
  const xff = getHeader(req, 'x-forwarded-for');
  if (!xff) return [];
  return xff.split(',').map((entry) => normalizeIp(entry)).filter(Boolean);
}

function getSocketClientIp(req) {
  return normalizeIp(req.socket.remoteAddress ?? '');
}

function getClientIp(req, trustProxy) {
  if (trustProxy) {
    const chain = parseForwardedForChain(req);
    if (chain[0]) return chain[0];
  }
  return getSocketClientIp(req);
}

function parseIpv4ToInt(ip) {
  const parts = ip.split('.').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

function isIpv4InRange(ip, start, end) {
  const numeric = parseIpv4ToInt(ip);
  const startNumeric = parseIpv4ToInt(start);
  const endNumeric = parseIpv4ToInt(end);
  if (numeric === null || startNumeric === null || endNumeric === null) return false;
  return numeric >= startNumeric && numeric <= endNumeric;
}

function classifyIpv4(ip) {
  return {
    isPrivateIp:
      isIpv4InRange(ip, '10.0.0.0', '10.255.255.255') ||
      isIpv4InRange(ip, '172.16.0.0', '172.31.255.255') ||
      isIpv4InRange(ip, '192.168.0.0', '192.168.255.255'),
    isLoopbackIp: isIpv4InRange(ip, '127.0.0.0', '127.255.255.255'),
    isReservedIp:
      isIpv4InRange(ip, '0.0.0.0', '0.255.255.255') ||
      isIpv4InRange(ip, '169.254.0.0', '169.254.255.255') ||
      isIpv4InRange(ip, '224.0.0.0', '255.255.255.255')
  };
}

function classifyIpv6(ip) {
  const normalized = ip.toLowerCase();
  return {
    isPrivateIp: normalized.startsWith('fc') || normalized.startsWith('fd'),
    isLoopbackIp: normalized === '::1',
    isReservedIp:
      normalized === '::' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('ff')
  };
}

export function parseIpData(req, options = {}) {
  const forwardedForChain = parseForwardedForChain(req);
  const clientIp = getClientIp(req, options.trustProxy === true);
  const ipVersion = net.isIP(clientIp);
  const classification = ipVersion === 4 ? classifyIpv4(clientIp) : ipVersion === 6 ? classifyIpv6(clientIp) : {
    isPrivateIp: false,
    isLoopbackIp: false,
    isReservedIp: false
  };
  return {
    clientIp,
    ipVersion: ipVersion || null,
    isPrivateIp: classification.isPrivateIp,
    isLoopbackIp: classification.isLoopbackIp,
    isReservedIp: classification.isReservedIp,
    forwardedForChain,
    forwardedChainHash: hashJson(forwardedForChain),
    proxyHopCount: forwardedForChain.length
  };
}
