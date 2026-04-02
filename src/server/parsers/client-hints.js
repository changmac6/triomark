import { getHeader, getStringLength } from '../utils/text.js';

function parseBrandVersionList(headerValue) {
  if (!headerValue) return [];
  const results = [];
  const regex = /"([^"]+)"\s*;\s*v="([^"]*)"/g;
  let match;
  while ((match = regex.exec(headerValue)) !== null) {
    results.push({ brand: match[1], version: match[2] });
  }
  return results;
}

function normalizeBrands(brands) {
  return [...brands]
    .map((entry) => ({ brand: entry.brand.trim().toLowerCase(), version: entry.version }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.version.localeCompare(b.version));
}

export function parseClientHints(req) {
  const secChUa = getHeader(req, 'sec-ch-ua');
  const secChUaFullVersionList = getHeader(req, 'sec-ch-ua-full-version-list');
  const secChUaParsed = parseBrandVersionList(secChUa);
  const secChUaFullVersionListParsed = parseBrandVersionList(secChUaFullVersionList);
  return {
    secChUa,
    secChUaLength: getStringLength(secChUa),
    secChUaParsed,
    secChUaMobile: getHeader(req, 'sec-ch-ua-mobile'),
    secChUaPlatform: getHeader(req, 'sec-ch-ua-platform'),
    secChUaPlatformVersion: getHeader(req, 'sec-ch-ua-platform-version'),
    secChUaArch: getHeader(req, 'sec-ch-ua-arch'),
    secChUaBitness: getHeader(req, 'sec-ch-ua-bitness'),
    secChUaModel: getHeader(req, 'sec-ch-ua-model'),
    secChUaFullVersion: getHeader(req, 'sec-ch-ua-full-version'),
    secChUaFullVersionList,
    secChUaFullVersionListParsed,
    brandsNormalized: normalizeBrands(secChUaFullVersionListParsed.length ? secChUaFullVersionListParsed : secChUaParsed),
    platformNormalized: (getHeader(req, 'sec-ch-ua-platform') || '').replace(/^"|"$/g, '').trim().toLowerCase() || null,
    secChPrefersColorScheme: getHeader(req, 'sec-ch-prefers-color-scheme')
  };
}
