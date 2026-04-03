import {
  detectClientProfile,
  detectServerProfile,
  detectSupportedBrowserPolicy,
  getClientLanguageInfo,
  getServerLanguageInfo,
  languageBase,
  getComponentValue,
  buildRuleHit,
  profileExpectsGrease,
  getProfilePolicy,
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

function normalizeMobileHint(value) {
  if (typeof value !== 'string') return null;
  if (value.includes('?1') || value === '1' || value.toLowerCase() === 'true') return true;
  if (value.includes('?0') || value === '0' || value.toLowerCase() === 'false') return false;
  return null;
}

function isAppleSafariProfile(profile) {
  return profile === 'macos_safari' || profile === 'iphone_safari';
}

function isChromiumProfile(profile) {
  return ['windows_chrome','windows_edge','macos_chrome','android_chrome','android_edge','iphone_chrome'].includes(profile);
}

function ruleCriticalWhitelistMismatch(event) {
  const clientProfile = detectClientProfile(event);
  const serverProfile = detectServerProfile(event);
  const policy = detectSupportedBrowserPolicy(event);
  if (policy.level === 'supported' && clientProfile === serverProfile) return null;
  if (policy.level === 'unsupported') {
    return buildRuleHit('C000', 'consistency', -45, 'Client and server layers fall outside the supported browser policy', {
      clientProfile,
      serverProfile,
      browserSupportLevel: policy.level,
    }, 'critical');
  }
  if (clientProfile !== 'unknown' && serverProfile !== 'unknown' && clientProfile !== serverProfile) {
    return buildRuleHit('C000', 'consistency', -35, 'Client-claimed browser profile conflicts with server-observed browser profile', {
      clientProfile,
      serverProfile,
    }, 'critical');
  }
  return null;
}

function rulePlatformAndMobileConsistency(event) {
  const clientProfile = detectClientProfile(event);
  const serverProfile = detectServerProfile(event);
  const platform = getComponentValue(event, 'platform');
  const system = getComponentValue(event, 'system');
  const clientHints = getServerClientHints(event);
  const issues = [];
  const mobileHint = normalizeMobileHint(clientHints.secChUaMobile);

  if (platform?.uaMobile === true && mobileHint === false) issues.push('uaMobile true vs sec-ch-ua-mobile false');
  if (platform?.uaMobile === false && mobileHint === true) issues.push('uaMobile false vs sec-ch-ua-mobile true');
  if (system?.mobile === true && clientProfile.startsWith('windows_')) issues.push('client mobile vs windows profile');
  if (clientProfile.includes('iphone') && serverProfile.includes('android')) issues.push('iphone client vs android server');
  if (clientProfile.includes('android') && serverProfile.includes('iphone')) issues.push('android client vs iphone server');

  if (issues.length === 0) return null;
  return buildRuleHit('C001', 'consistency', issues.length >= 2 ? -18 : -10, 'Platform or mobility signals are inconsistent across layers', {
    clientProfile,
    serverProfile,
    issues,
  }, issues.length >= 2 ? 'high' : 'normal');
}

function ruleLanguageConsistency(event) {
  const clientLang = getClientLanguageInfo(event);
  const serverLang = getServerLanguageInfo(event);
  if (!clientLang.language || !serverLang.primaryLanguage) return null;
  if (languageBase(clientLang.language) === languageBase(serverLang.primaryLanguage)) return null;
  return buildRuleHit('C002', 'consistency', -8, 'Client language and Accept-Language primary tag do not match', {
    clientLanguage: clientLang.language,
    serverPrimaryLanguage: serverLang.primaryLanguage,
  });
}

function ruleTimezoneLanguageTension(event) {
  const clientProfile = detectClientProfile(event);
  const policy = getProfilePolicy(clientProfile);
  if (policy?.deviceClass === 'mobile') return null;

  const clientLang = getClientLanguageInfo(event);
  if (!clientLang.timeZone || !clientLang.language) return null;
  const tz = clientLang.timeZone;
  const base = languageBase(clientLang.language);
  const suspicious = [];
  if (tz.startsWith('Asia/Taipei') && !['zh', 'en'].includes(base)) suspicious.push('taipei-timezone-with-unexpected-language');
  if (tz.startsWith('America/') && ['zh', 'ja', 'ko'].includes(base)) suspicious.push('american-timezone-with-east-asian-language');
  if (suspicious.length === 0) return null;
  return buildRuleHit('C003', 'consistency', -4, 'Timezone and language combination looks atypical', {
    clientProfile,
    timeZone: tz,
    language: clientLang.language,
    suspicious,
  });
}

function ruleSafariVsChromiumHints(event) {
  const clientProfile = detectClientProfile(event);
  const serverProfile = detectServerProfile(event);
  const clientHints = getServerClientHints(event);
  if (!isAppleSafariProfile(clientProfile)) return null;
  if (!String(clientHints.secChUa ?? '').trim()) return null;
  if (serverProfile === 'iphone_safari' || serverProfile === 'macos_safari') return null;
  return buildRuleHit('C004', 'consistency', -20, 'Safari-like client signals conflict with Chromium-style server hints', {
    clientProfile,
    serverProfile,
    secChUa: clientHints.secChUa,
  }, 'high');
}

function ruleChromiumVsSafariTls(event) {
  const clientProfile = detectClientProfile(event);
  const tls = getServerTls(event);
  if (!isChromiumProfile(clientProfile)) return null;
  if (!profileExpectsGrease(clientProfile)) return null;
  if (tls.hasGrease === true || tls.ja4) return null;
  return buildRuleHit('C005', 'consistency', -12, 'Chromium-like client profile conflicts with a sparse or non-Chromium TLS shape', {
    clientProfile,
    ja4: tls.ja4,
    hasGrease: tls.hasGrease,
  }, 'high');
}

function ruleWebglPlatformTension(event) {
  const clientProfile = detectClientProfile(event);
  const webglBasics = getComponentValue(event, 'webGlBasics');
  const renderer = String(webglBasics?.rendererUnmasked ?? webglBasics?.renderer ?? '').toLowerCase();
  if (!renderer) return null;
  const issues = [];
  if (clientProfile.startsWith('windows_') && renderer.includes('apple')) issues.push('windows-profile-with-apple-renderer');
  if (clientProfile.startsWith('macos_') && renderer.includes('adreno')) issues.push('macos-profile-with-mobile-adreno-renderer');
  if (clientProfile.startsWith('iphone_') && renderer.includes('nvidia')) issues.push('iphone-profile-with-desktop-nvidia-renderer');
  if (clientProfile.startsWith('android_') && renderer.includes('metal')) issues.push('android-profile-with-apple-metal-renderer');
  if (issues.length === 0) return null;
  return buildRuleHit('C006', 'consistency', -14, 'WebGL renderer looks inconsistent with the claimed platform profile', {
    clientProfile,
    renderer,
    issues,
  }, 'high');
}

function rulePositiveProfileAlignment(event) {
  const clientProfile = detectClientProfile(event);
  const serverProfile = detectServerProfile(event);
  if (clientProfile === 'unknown' || serverProfile === 'unknown') return null;
  if (clientProfile !== serverProfile) return null;
  return buildRuleHit('C007', 'consistency', +8, 'Client and server browser profiles align', {
    clientProfile,
    serverProfile,
  });
}

function rulePositiveLocaleAlignment(event) {
  const clientLang = getClientLanguageInfo(event);
  const serverLang = getServerLanguageInfo(event);
  if (!clientLang.language || !serverLang.primaryLanguage) return null;
  if (languageBase(clientLang.language) !== languageBase(serverLang.primaryLanguage)) return null;
  return buildRuleHit('C008', 'consistency', +4, 'Client locale and Accept-Language align', {
    clientLanguage: clientLang.language,
    serverPrimaryLanguage: serverLang.primaryLanguage,
  });
}

export function getConsistencyRules() {
  return [
    ruleCriticalWhitelistMismatch,
    rulePlatformAndMobileConsistency,
    ruleLanguageConsistency,
    ruleTimezoneLanguageTension,
    ruleSafariVsChromiumHints,
    ruleChromiumVsSafariTls,
    ruleWebglPlatformTension,
    rulePositiveProfileAlignment,
    rulePositiveLocaleAlignment,
  ];
}
