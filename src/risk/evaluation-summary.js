import {
  detectClientBrowserFamily,
  detectClientPlatform,
  detectServerBrowserFamily,
  detectServerPlatform,
  getClientLanguageInfo,
  getComponentValue,
  getServerLanguageInfo,
  languageBase,
} from './signal-utils.js';

function compactArray(values = [], limit = 6) {
  return values.filter((value) => value != null && String(value).trim() !== '').slice(0, limit);
}

function sortRuleHits(ruleHits = []) {
  return [...ruleHits].sort((a, b) => Math.abs(Number(b?.delta ?? 0)) - Math.abs(Number(a?.delta ?? 0)));
}

function summarizeRuleHits(ruleHits = []) {
  const sorted = sortRuleHits(ruleHits);
  const topPenalties = sorted
    .filter((hit) => Number(hit?.delta ?? 0) < 0)
    .slice(0, 6)
    .map((hit) => ({
      id: hit.id,
      category: hit.category,
      severity: hit.severity,
      delta: hit.delta,
      reason: hit.reason,
      evidence: hit.evidence ?? {},
    }));
  const topBonuses = sorted
    .filter((hit) => Number(hit?.delta ?? 0) > 0)
    .slice(0, 4)
    .map((hit) => ({
      id: hit.id,
      category: hit.category,
      severity: hit.severity,
      delta: hit.delta,
      reason: hit.reason,
      evidence: hit.evidence ?? {},
    }));

  const byCategory = sorted.reduce((acc, hit) => {
    const key = String(hit?.category ?? 'unknown');
    acc[key] = {
      count: (acc[key]?.count ?? 0) + 1,
      negative: (acc[key]?.negative ?? 0) + (Number(hit?.delta ?? 0) < 0 ? 1 : 0),
      positive: (acc[key]?.positive ?? 0) + (Number(hit?.delta ?? 0) > 0 ? 1 : 0),
      totalDelta: Math.round(((acc[key]?.totalDelta ?? 0) + Number(hit?.delta ?? 0)) * 100) / 100,
    };
    return acc;
  }, {});

  return {
    topPenalties,
    topBonuses,
    byCategory,
  };
}

function scoreBand(score) {
  const num = Number(score ?? 0);
  if (num >= 85) return 'strong';
  if (num >= 70) return 'good';
  if (num >= 50) return 'mixed';
  if (num >= 30) return 'weak';
  return 'critical';
}

function safeScreenSummary(screen) {
  if (!screen) return null;
  const width = screen.width ?? null;
  const height = screen.height ?? null;
  const pixelRatio = screen.pixelRatio ?? null;
  if (width == null || height == null) return null;
  return `${width}x${height}${pixelRatio != null ? ` @${pixelRatio}` : ''}`;
}

function summarizeClientSignals(event) {
  const system = getComponentValue(event, 'system');
  const platform = getComponentValue(event, 'platform');
  const screen = getComponentValue(event, 'screen');
  const touch = getComponentValue(event, 'touchSupport');
  const vendor = getComponentValue(event, 'vendor');
  const fonts = getComponentValue(event, 'fonts');
  const canvas = getComponentValue(event, 'canvas');
  const webgl = getComponentValue(event, 'webgl');
  const cookiesEnabled = getComponentValue(event, 'cookiesEnabled');
  const localStorage = getComponentValue(event, 'localStorage');
  const sessionStorage = getComponentValue(event, 'sessionStorage');
  const indexedDB = getComponentValue(event, 'indexedDB');
  const permissions = getComponentValue(event, 'permissions');
  const media = getComponentValue(event, 'media');
  const pdfViewerEnabled = getComponentValue(event, 'pdfViewerEnabled');
  const webrtc = getComponentValue(event, 'webrtc');
  const networkInformation = getComponentValue(event, 'networkInformation');
  const hardwareConcurrency = getComponentValue(event, 'hardwareConcurrency');
  const deviceMemory = getComponentValue(event, 'deviceMemory');
  const languages = getClientLanguageInfo(event);

  return {
    browserFamily: detectClientBrowserFamily(event),
    platformFamily: detectClientPlatform(event),
    userAgent: system?.userAgent ?? null,
    browserName: system?.browser?.name ?? null,
    browserVersion: system?.browser?.version ?? null,
    vendor: vendor?.vendor ?? null,
    uaPlatform: platform?.uaPlatform ?? null,
    uaMobile: platform?.uaMobile ?? null,
    language: languages.language || null,
    languages: compactArray(languages.languages, 5),
    locale: languages.locale || null,
    timeZone: languages.timeZone || null,
    screen: screen ? {
      width: screen.width ?? null,
      height: screen.height ?? null,
      pixelRatio: screen.pixelRatio ?? null,
      colorDepth: screen.colorDepth ?? null,
      maxTouchPoints: screen.maxTouchPoints ?? null,
    } : null,
    touch: {
      maxTouchPoints: touch?.maxTouchPoints ?? null,
      ontouchstart: touch?.ontouchstart ?? null,
    },
    runtime: {
      hardwareConcurrency: hardwareConcurrency?.hardwareConcurrency ?? null,
      deviceMemory: deviceMemory?.deviceMemory ?? null,
    },
    graphics: {
      canvasSupported: canvas?.supported ?? null,
      webglSupported: webgl?.supported ?? null,
      webglRenderer: webgl?.basics?.rendererUnmasked || webgl?.basics?.renderer || null,
      webglVendor: webgl?.basics?.vendorUnmasked || webgl?.basics?.vendor || null,
      fontsCount: fonts?.count ?? null,
    },
    storage: {
      cookiesEnabled: cookiesEnabled?.enabled ?? null,
      localStorage: localStorage?.supported ?? null,
      sessionStorage: sessionStorage?.supported ?? null,
      indexedDB: indexedDB?.supported ?? null,
    },
    capabilities: {
      permissionsSupported: permissions?.supported ?? null,
      mediaSupported: media?.supported ?? null,
      pdfViewerEnabled: pdfViewerEnabled?.enabled ?? null,
      webrtcSupported: webrtc?.supported ?? null,
      networkInformationSupported: networkInformation?.supported ?? null,
    },
  };
}

function summarizeServerSignals(event) {
  const server = event?.server?.raw ?? event?.server ?? {};
  const http = server.http ?? {};
  const clientHints = server.clientHints ?? {};
  const tls = server.tls ?? {};
  const languages = getServerLanguageInfo(event);

  return {
    browserFamily: detectServerBrowserFamily(event),
    platformFamily: detectServerPlatform(event),
    userAgent: http.userAgent ?? null,
    headerCount: http.headerCount ?? null,
    hasSecFetch: http.hasSecFetch ?? null,
    hasClientHints: http.hasClientHints ?? null,
    primaryLanguage: languages.primaryLanguage || null,
    languageTags: compactArray(languages.languageTags, 5),
    acceptLanguage: http.acceptLanguage ?? null,
    acceptEncoding: http.acceptEncoding ?? null,
    secFetch: {
      site: http.secFetchSite ?? null,
      mode: http.secFetchMode ?? null,
      dest: http.secFetchDest ?? null,
      user: http.secFetchUser ?? null,
    },
    clientHints: {
      secChUa: clientHints.secChUa ?? null,
      secChUaMobile: clientHints.secChUaMobile ?? null,
      secChUaPlatform: clientHints.secChUaPlatform ?? null,
    },
    tls: {
      ja3: tls.ja3 ?? null,
      ja4: tls.ja4 ?? null,
      alpnProtocol: tls.alpnProtocol ?? null,
      offeredH2: tls.offeredH2 ?? null,
      negotiatedH2: tls.negotiatedH2 ?? null,
      hasGrease: tls.hasGrease ?? null,
      hostVsSniMatch: tls.hostVsSniMatch ?? null,
      servername: tls.servername ?? null,
      sniFromExtension: tls.sniFromExtension ?? null,
      extensionCount: tls.extensionCount ?? null,
      cipherSuitesCount: tls.cipherSuitesCount ?? null,
    },
  };
}

function summarizeConsistency(evaluation, event) {
  const clientSignals = summarizeClientSignals(event);
  const serverSignals = summarizeServerSignals(event);
  const clientLanguageBase = languageBase(clientSignals.language);
  const serverLanguageBase = languageBase(serverSignals.primaryLanguage || serverSignals.languageTags?.[0]);

  const profileMatch = evaluation?.clientProfile && evaluation?.serverProfile ? evaluation.clientProfile === evaluation.serverProfile : null;
  const familyMatch = clientSignals.browserFamily && serverSignals.browserFamily ? clientSignals.browserFamily === serverSignals.browserFamily : null;
  const platformMatch = clientSignals.platformFamily && serverSignals.platformFamily ? clientSignals.platformFamily === serverSignals.platformFamily : null;
  const languageBaseMatch = clientLanguageBase && serverLanguageBase ? clientLanguageBase === serverLanguageBase : null;
  const hostVsSniMatch = serverSignals.tls?.hostVsSniMatch ?? null;
  const hasSecFetch = serverSignals.hasSecFetch ?? null;
  const hasClientHints = serverSignals.hasClientHints ?? null;
  const hasGrease = serverSignals.tls?.hasGrease ?? null;

  const aligned = [];
  const mismatches = [];
  const pushCheck = (ok, label) => {
    if (ok === true) aligned.push(label);
    else if (ok === false) mismatches.push(label);
  };

  pushCheck(profileMatch, 'client/server profile');
  pushCheck(familyMatch, 'browser family');
  pushCheck(platformMatch, 'platform family');
  pushCheck(languageBaseMatch, 'language base');
  pushCheck(hostVsSniMatch, 'host vs SNI');

  return {
    profileMatch,
    familyMatch,
    platformMatch,
    languageBaseMatch,
    hostVsSniMatch,
    hasSecFetch,
    hasClientHints,
    hasGrease,
    aligned,
    mismatches,
  };
}

function buildHeadline(evaluation, consistencyChecks) {
  const support = evaluation?.browserSupportLevel ?? 'unknown';
  const level = evaluation?.level ?? 'unscored';
  if (support === 'unsupported') return '不在白名單支援範圍，系統已直接偏高風險處理';
  if (level === 'high_risk') return '高風險：至少一層訊號或跨層一致性明顯異常';
  if (level === 'review') return '中度可疑：建議對照關鍵扣分與一致性衝突';
  if (level === 'normal') return '大致正常，但仍有部分異常訊號';
  if (level === 'trusted') {
    return consistencyChecks?.mismatches?.length
      ? '整體高可信，但仍存在少數可追蹤差異'
      : '高可信：白名單環境且主要訊號大致一致';
  }
  return '尚未完成評分';
}

function buildComparisonRows(clientSignals, serverSignals, consistencyChecks) {
  return [
    {
      label: 'Browser family',
      client: clientSignals.browserFamily,
      server: serverSignals.browserFamily,
      match: consistencyChecks.familyMatch,
    },
    {
      label: 'Platform family',
      client: clientSignals.platformFamily,
      server: serverSignals.platformFamily,
      match: consistencyChecks.platformMatch,
    },
    {
      label: 'Language base',
      client: languageBase(clientSignals.language),
      server: languageBase(serverSignals.primaryLanguage || serverSignals.languageTags?.[0]),
      match: consistencyChecks.languageBaseMatch,
    },
    {
      label: 'UA / hints mobile',
      client: clientSignals.uaMobile,
      server: serverSignals.clientHints?.secChUaMobile,
      match: null,
    },
    {
      label: 'Platform hint',
      client: clientSignals.uaPlatform,
      server: serverSignals.clientHints?.secChUaPlatform,
      match: null,
    },
    {
      label: 'Host vs SNI',
      client: '-',
      server: consistencyChecks.hostVsSniMatch,
      match: consistencyChecks.hostVsSniMatch,
    },
  ];
}

function buildKeySnapshot(evaluation, clientSignals, serverSignals, consistencyChecks) {
  return {
    support: evaluation?.browserSupportLevel ?? 'unknown',
    clientProfile: evaluation?.clientProfile ?? 'unknown',
    serverProfile: evaluation?.serverProfile ?? 'unknown',
    clientFamily: clientSignals.browserFamily,
    serverFamily: serverSignals.browserFamily,
    clientPlatform: clientSignals.platformFamily,
    serverPlatform: serverSignals.platformFamily,
    clientLanguage: clientSignals.language,
    serverPrimaryLanguage: serverSignals.primaryLanguage,
    clientTimeZone: clientSignals.timeZone,
    clientScreen: safeScreenSummary(clientSignals.screen),
    clientWebglRenderer: clientSignals.graphics?.webglRenderer ?? null,
    clientFontsCount: clientSignals.graphics?.fontsCount ?? null,
    serverJa3: serverSignals.tls?.ja3 ?? null,
    serverJa4: serverSignals.tls?.ja4 ?? null,
    serverAlpn: serverSignals.tls?.alpnProtocol ?? null,
    serverHasGrease: serverSignals.tls?.hasGrease ?? null,
    consistencyMismatches: consistencyChecks.mismatches,
    consistencyAligned: consistencyChecks.aligned,
  };
}

export function buildEvaluationSummary(input, maybeEvent = null) {
  const evaluation = input?.evaluation ?? input ?? {};
  const event = input?.event ?? maybeEvent ?? {};
  const ruleSummary = summarizeRuleHits(evaluation?.ruleHits ?? []);
  const clientSignals = summarizeClientSignals(event);
  const serverSignals = summarizeServerSignals(event);
  const consistencyChecks = summarizeConsistency(evaluation, event);
  const comparisonRows = buildComparisonRows(clientSignals, serverSignals, consistencyChecks);

  return {
    headline: buildHeadline(evaluation, consistencyChecks),
    browserSupportLevel: evaluation?.browserSupportLevel ?? 'unknown',
    clientProfile: evaluation?.clientProfile ?? 'unknown',
    serverProfile: evaluation?.serverProfile ?? 'unknown',
    clientBrowserFamily: clientSignals.browserFamily,
    serverBrowserFamily: serverSignals.browserFamily,
    clientPlatformFamily: clientSignals.platformFamily,
    serverPlatformFamily: serverSignals.platformFamily,
    totalRiskScore: evaluation?.totalRiskScore ?? 0,
    scoreBands: {
      browser: scoreBand(evaluation?.browserScore ?? 0),
      protocol: scoreBand(evaluation?.protocolScore ?? 0),
      consistency: scoreBand(evaluation?.consistencyScore ?? 0),
      total: scoreBand(evaluation?.totalRiskScore ?? 0),
    },
    scoringVariant: evaluation?.scoringVariant ?? 'stable_v1',
    rawTotalRiskScore: evaluation?.meta?.rawTotalRiskScore ?? 0,
    level: evaluation?.level ?? 'unscored',
    guardrails: Array.isArray(evaluation?.meta?.guardrails) ? evaluation.meta.guardrails : [],
    ruleHitCounts: evaluation?.meta?.ruleHitCounts ?? { browser: 0, protocol: 0, consistency: 0 },
    topRuleIds: Array.isArray(evaluation?.meta?.topRuleIds) ? evaluation.meta.topRuleIds : [],
    ruleSummary,
    clientSignals,
    serverSignals,
    consistencyChecks,
    comparisonRows,
    keySnapshot: buildKeySnapshot(evaluation, clientSignals, serverSignals, consistencyChecks),
  };
}
