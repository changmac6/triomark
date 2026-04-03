import {
  detectServerBrowserFamily,
  detectServerProfile,
  detectSupportedBrowserPolicy,
  buildRuleHit,
  isAppleLikeProfile,
  isEdgeProfile,
  profileSupportsChromiumHints,
  profileRequiresSecFetch,
  profileExpectsGrease,
} from './signal-utils.js';

function getServerHttp(event) {
  return event?.server?.raw?.http ?? event?.server?.http ?? {};
}

function getServerClientHints(event) {
  return event?.server?.raw?.clientHints ?? event?.server?.clientHints ?? {};
}

function getServerTls(event) {
  return event?.server?.raw?.tls ?? event?.server?.tls ?? {};
}

function hasChromiumStyleHints(clientHints) {
  return Boolean(clientHints?.secChUa || clientHints?.secChUaPlatform || clientHints?.secChUaMobile);
}

function isApiRequest(event) {
  const path = String(event?.server?.raw?.network?.path ?? event?.server?.network?.path ?? '');
  return path.startsWith('/api/');
}

function ruleSupportedProfilePolicy(event) {
  const policy = detectSupportedBrowserPolicy(event);
  if (policy.level === 'supported') return null;
  if (policy.level === 'unsupported') {
    return buildRuleHit('P000', 'protocol', -35, 'Observed HTTP/TLS profile is outside supported browser policy', {
      serverProfile: policy.serverProfile,
      clientProfile: policy.clientProfile,
    }, 'critical');
  }
  return buildRuleHit('P000', 'protocol', -18, 'Observed HTTP/TLS profile is not confidently within supported browser policy', {
    serverProfile: policy.serverProfile,
    clientProfile: policy.clientProfile,
  }, 'high');
}

function ruleSparseHeaderSet(event) {
  const http = getServerHttp(event);
  const headerCount = Number(http.headerCount ?? 0);
  if (headerCount >= 6) return null;
  return buildRuleHit('P001', 'protocol', -18, 'HTTP header set is unusually sparse for a browser-originated request', {
    headerCount,
    headerNamesInOrder: http.headerNamesInOrder ?? [],
  }, 'high');
}

function ruleChromiumFetchHeaders(event) {
  const family = detectServerBrowserFamily(event);
  const http = getServerHttp(event);
  if (!['chrome', 'edge'].includes(family)) return null;
  const profile = detectServerProfile(event);
  if (!profileRequiresSecFetch(profile)) return null;
  if (isApiRequest(event) && http.secFetchMode && http.secFetchSite) return null;
  if (!isApiRequest(event) && http.hasSecFetch) return null;
  return buildRuleHit('P002', 'protocol', -12, 'Chromium-like request is missing expected sec-fetch headers', {
    browserFamily: family,
    secFetchSite: http.secFetchSite,
    secFetchMode: http.secFetchMode,
    secFetchDest: http.secFetchDest,
  });
}

function ruleChromiumClientHints(event) {
  const family = detectServerBrowserFamily(event);
  const clientHints = getServerClientHints(event);
  if (!['chrome', 'edge'].includes(family)) return null;
  const profile = detectServerProfile(event);
  if (!profileSupportsChromiumHints(profile)) return null;

  const missing = [];
  if (!clientHints.secChUa) missing.push('sec-ch-ua');
  if (clientHints.secChUaMobile == null) missing.push('sec-ch-ua-mobile');
  if (!clientHints.secChUaPlatform) missing.push('sec-ch-ua-platform');

  if (missing.length === 0) return null;
  const delta = missing.length === 1 ? -5 : -12;
  return buildRuleHit('P003', 'protocol', delta, 'Chromium-like request has incomplete baseline client hints', {
    browserFamily: family,
    missingClientHints: missing,
  });
}

function ruleContentTypeForApiPost(event) {
  const http = getServerHttp(event);
  const path = String(event?.server?.raw?.network?.path ?? event?.server?.network?.path ?? '');
  if (String(event?.server?.raw?.network?.method ?? event?.server?.network?.method ?? '').toUpperCase() !== 'POST') return null;
  if (!path.startsWith('/api/')) return null;
  const contentType = String(http.contentType ?? '').toLowerCase();
  if (contentType.includes('application/json')) return null;
  return buildRuleHit('P004', 'protocol', -8, 'API POST request is missing expected JSON content-type', {
    path,
    contentType: http.contentType,
  });
}

function ruleLanguageHeaders(event) {
  const http = getServerHttp(event);
  const support = detectSupportedBrowserPolicy(event);
  if (!http.acceptLanguage) {
    return buildRuleHit('P005', 'protocol', -10, 'Accept-Language is missing from an otherwise browser-like request', {
      serverProfile: support.serverProfile,
    });
  }
  if (!http.acceptEncoding) {
    return buildRuleHit('P005', 'protocol', -6, 'Accept-Encoding is missing from an otherwise browser-like request', {
      serverProfile: support.serverProfile,
    });
  }
  return null;
}

function ruleTlsSignalSparsity(event) {
  const tls = getServerTls(event);
  const score = [tls.ja3, tls.ja4, tls.alpnProtocol, tls.supportedVersions, tls.extensionIds].filter(Boolean).length;
  if (score >= 4) return null;
  return buildRuleHit('P006', 'protocol', -16, 'TLS profile is unusually sparse for a modern browser session', {
    presentSignalCount: score,
    ja3: tls.ja3,
    ja4: tls.ja4,
    alpnProtocol: tls.alpnProtocol,
  }, 'high');
}

function ruleChromiumGrease(event) {
  const profile = detectServerProfile(event);
  const tls = getServerTls(event);
  if (!profileExpectsGrease(profile)) return null;
  if (tls.hasGrease === true) return null;
  return buildRuleHit('P007', 'protocol', -10, 'Supported Chromium-like TLS profile is missing GREASE behavior', {
    serverProfile: profile,
    hasGrease: tls.hasGrease,
  });
}

function ruleHostSniAlpnConsistency(event) {
  const tls = getServerTls(event);
  const issues = [];
  if (tls.hostVsSniMatch === false) issues.push('hostVsSniMatch');
  if (tls.servernameVsSniMatch === false) issues.push('servernameVsSniMatch');
  if (tls.alpnMismatch === true) issues.push('alpnMismatch');
  if (issues.length === 0) return null;
  const delta = issues.length >= 2 ? -18 : -10;
  return buildRuleHit('P008', 'protocol', delta, 'Host / SNI / ALPN signals are inconsistent', {
    issues,
    hostVsSniMatch: tls.hostVsSniMatch,
    servernameVsSniMatch: tls.servernameVsSniMatch,
    alpnMismatch: tls.alpnMismatch,
  }, issues.length >= 2 ? 'critical' : 'high');
}

function rulePositiveApiBrowserRequest(event) {
  const support = detectSupportedBrowserPolicy(event);
  const http = getServerHttp(event);
  const clientHints = getServerClientHints(event);
  if (support.level !== 'supported') return null;
  if (!isApiRequest(event)) return null;

  const good = [];
  if (http.secFetchMode) good.push('secFetchMode');
  if (http.secFetchSite) good.push('secFetchSite');
  if (http.acceptLanguage) good.push('acceptLanguage');
  if (http.acceptEncoding) good.push('acceptEncoding');
  if (hasChromiumStyleHints(clientHints) || isAppleLikeProfile(support.serverProfile)) good.push('browserHints');

  if (good.length < 4) return null;
  return buildRuleHit('P009', 'protocol', +6, 'HTTP request shape looks plausible for a supported browser-originated API call', {
    serverProfile: support.serverProfile,
    positiveSignals: good,
  });
}

function rulePositiveModernTls(event) {
  const support = detectSupportedBrowserPolicy(event);
  const tls = getServerTls(event);
  if (support.level !== 'supported') return null;

  const positives = [];
  if (tls.ja4) positives.push('ja4');
  if (tls.alpnProtocol) positives.push('alpnProtocol');
  if (Array.isArray(tls.supportedVersions) && tls.supportedVersions.length > 0) positives.push('supportedVersions');
  if (Array.isArray(tls.extensionIds) && tls.extensionIds.length > 5) positives.push('extensionIds');
  if (tls.hasGrease === true || isAppleLikeProfile(support.serverProfile)) positives.push('greaseOrAppleException');

  if (positives.length < 4) return null;
  const delta = isEdgeProfile(support.serverProfile) ? +6 : +5;
  return buildRuleHit('P010', 'protocol', delta, 'TLS profile looks plausible for a supported modern browser', {
    serverProfile: support.serverProfile,
    positiveSignals: positives,
  });
}

export function getProtocolRules() {
  return [
    ruleSupportedProfilePolicy,
    ruleSparseHeaderSet,
    ruleChromiumFetchHeaders,
    ruleChromiumClientHints,
    ruleContentTypeForApiPost,
    ruleLanguageHeaders,
    ruleTlsSignalSparsity,
    ruleChromiumGrease,
    ruleHostSniAlpnConsistency,
    rulePositiveApiBrowserRequest,
    rulePositiveModernTls,
  ];
}
