import {
  SUPPORTED_BASELINE_PROFILES,
  profileToleratesSparsePermissions,
  profileToleratesEmptyPlugins,
  profileToleratesMissingNetworkApis,
  profileSupportsChromiumHints,
  profileRequiresSecFetch,
  profileExpectsGrease,
  getProfilePolicy,
} from './profile-policy.js';

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getRawClientRoot(event) {
  return event?.client?.raw ?? event?.client ?? {};
}

export function getComponent(event, id) {
  return getRawClientRoot(event)?.client?.components?.[id] ?? null;
}

export function parseComponentValue(component) {
  if (!component?.value || typeof component.value !== 'string') return null;
  try {
    return JSON.parse(component.value);
  } catch {
    return null;
  }
}

export function getComponentValue(event, id) {
  return parseComponentValue(getComponent(event, id));
}

export function hasSupportedFlag(value) {
  return value && typeof value === 'object' && value.supported === true;
}

export function hasUnsupportedFlag(value) {
  return value && typeof value === 'object' && value.supported === false;
}

function normalizeUserAgentString(value) {
  return String(value ?? '');
}

function includesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

export function detectClientPlatform(event) {
  const system = getComponentValue(event, 'system');
  const userAgent = getComponentValue(event, 'userAgent');
  const platform = getComponentValue(event, 'platform');
  const ua = normalizeUserAgentString(system?.userAgent ?? userAgent?.userAgent);
  const navPlatform = String(platform?.platform ?? system?.platform ?? '').toLowerCase();

  if (includesAny(ua, [/iPhone/i, /iOS/i])) return 'iphone';
  if (includesAny(ua, [/Android/i])) return 'android';
  if (includesAny(ua, [/Macintosh/i, /Mac OS X/i]) || navPlatform.includes('mac')) return 'macos';
  if (includesAny(ua, [/Windows NT/i]) || navPlatform.includes('win')) return 'windows';
  return 'unknown';
}

export function detectClientBrowserFamily(event) {
  const system = getComponentValue(event, 'system');
  const userAgent = getComponentValue(event, 'userAgent');
  const vendor = getComponentValue(event, 'vendor');
  const vendorFlavors = getComponentValue(event, 'vendorFlavors');
  const ua = normalizeUserAgentString(system?.userAgent ?? userAgent?.userAgent);
  const browserName = String(system?.browser?.name ?? '').toLowerCase();
  const vendorName = String(vendor?.vendor ?? '');
  const brands = Array.isArray(userAgent?.uaBrands) ? userAgent.uaBrands : Array.isArray(vendorFlavors?.brands) ? vendorFlavors.brands : [];
  const brandNames = brands.map((entry) => String(entry?.brand ?? ''));

  if (browserName.includes('edge') || /Edg(A|iOS)?\//.test(ua) || brandNames.some((name) => /Edge/i.test(name))) {
    return 'edge';
  }
  if (browserName.includes('chrome') || ((/Chrome\//.test(ua) || /CriOS\//.test(ua)) && !/Edg(A|iOS)?\//.test(ua)) || vendorName.includes('Google')) {
    return 'chrome';
  }
  if (browserName.includes('safari') || (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua) && !/Edg(A|iOS)?\//.test(ua))) {
    return 'safari';
  }
  if (browserName.includes('firefox') || /Firefox\//.test(ua)) {
    return 'firefox';
  }
  return 'unknown';
}

export function detectClientProfile(event) {
  const platform = detectClientPlatform(event);
  const browser = detectClientBrowserFamily(event);

  if (platform === 'windows' && browser === 'chrome') return 'windows_chrome';
  if (platform === 'windows' && browser === 'edge') return 'windows_edge';
  if (platform === 'macos' && browser === 'chrome') return 'macos_chrome';
  if (platform === 'macos' && browser === 'safari') return 'macos_safari';
  if (platform === 'android' && browser === 'chrome') return 'android_chrome';
  if (platform === 'android' && browser === 'edge') return 'android_edge';
  if (platform === 'iphone' && browser === 'chrome') return 'iphone_chrome';
  if (platform === 'iphone' && browser === 'safari') return 'iphone_safari';

  if (platform === 'unknown' && browser === 'unknown') return 'unknown';
  if (browser === 'firefox') return `unsupported_firefox_${platform}`;
  return `unsupported_${platform}_${browser}`;
}

export function detectServerPlatform(event) {
  const http = event?.server?.raw?.http ?? event?.server?.http ?? {};
  const clientHints = event?.server?.raw?.clientHints ?? event?.server?.clientHints ?? {};
  const ua = normalizeUserAgentString(http.userAgent);
  const chPlatform = String(clientHints.secChUaPlatform ?? '').replace(/"/g, '').toLowerCase();

  if (/iphone/i.test(ua) || chPlatform.includes('ios')) return 'iphone';
  if (/android/i.test(ua) || chPlatform.includes('android')) return 'android';
  if (/macintosh|mac os x/i.test(ua) || chPlatform.includes('mac')) return 'macos';
  if (/windows nt/i.test(ua) || chPlatform.includes('windows')) return 'windows';
  return 'unknown';
}

export function detectServerBrowserFamily(event) {
  const http = event?.server?.raw?.http ?? event?.server?.http ?? {};
  const clientHints = event?.server?.raw?.clientHints ?? event?.server?.clientHints ?? {};
  const ua = normalizeUserAgentString(http.userAgent);
  const secChUa = String(clientHints.secChUa ?? '');

  if (/Edg(A|iOS)?\//.test(ua) || /Microsoft Edge/i.test(secChUa)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if ((/Chrome\//.test(ua) || /CriOS\//.test(ua)) && !/Edg(A|iOS)?\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua) && !/Edg(A|iOS)?\//.test(ua)) return 'safari';
  return 'unknown';
}

export function detectServerProfile(event) {
  const platform = detectServerPlatform(event);
  const browser = detectServerBrowserFamily(event);

  if (platform === 'windows' && browser === 'chrome') return 'windows_chrome';
  if (platform === 'windows' && browser === 'edge') return 'windows_edge';
  if (platform === 'macos' && browser === 'chrome') return 'macos_chrome';
  if (platform === 'macos' && browser === 'safari') return 'macos_safari';
  if (platform === 'android' && browser === 'chrome') return 'android_chrome';
  if (platform === 'android' && browser === 'edge') return 'android_edge';
  if (platform === 'iphone' && browser === 'chrome') return 'iphone_chrome';
  if (platform === 'iphone' && browser === 'safari') return 'iphone_safari';

  if (platform === 'unknown' && browser === 'unknown') return 'unknown';
  if (browser === 'firefox') return `unsupported_firefox_${platform}`;
  return `unsupported_${platform}_${browser}`;
}

export function detectSupportedBrowserPolicy(event) {
  const clientProfile = detectClientProfile(event);
  const serverProfile = detectServerProfile(event);
  const profiles = [clientProfile, serverProfile].filter(Boolean);
  const supportedProfiles = profiles.filter((profile) => SUPPORTED_BASELINE_PROFILES.includes(profile));
  const unsupportedProfiles = profiles.filter((profile) => profile.startsWith('unsupported_') || profile.includes('firefox'));

  if (unsupportedProfiles.length > 0) {
    return {
      level: 'unsupported',
      clientProfile,
      serverProfile,
      matchedProfiles: supportedProfiles,
      unsupportedProfiles,
    };
  }

  if (supportedProfiles.length === 0) {
    return {
      level: 'unknown',
      clientProfile,
      serverProfile,
      matchedProfiles: [],
      unsupportedProfiles: [],
    };
  }

  return {
    level: 'supported',
    clientProfile,
    serverProfile,
    matchedProfiles: supportedProfiles,
    unsupportedProfiles: [],
  };
}

export function getGroupedComponents(event) {
  return getRawClientRoot(event)?.groupedComponents ?? event?.client?.groupedComponents ?? {};
}

export function normalizeLanguageTag(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function languageBase(value) {
  const tag = normalizeLanguageTag(value);
  return tag.split('-')[0] ?? tag;
}

export function getClientLanguageInfo(event) {
  const languages = getComponentValue(event, 'languages');
  const locales = getComponentValue(event, 'locales');
  const timezone = getComponentValue(event, 'timezone');

  return {
    language: normalizeLanguageTag(languages?.language ?? locales?.language),
    languages: Array.isArray(languages?.languages) ? languages.languages.map(normalizeLanguageTag).filter(Boolean) : [],
    locale: normalizeLanguageTag(locales?.locale),
    timeZone: String(timezone?.timeZone ?? locales?.timeZone ?? '').trim(),
  };
}

export function getServerLanguageInfo(event) {
  const http = event?.server?.raw?.http ?? event?.server?.http ?? {};
  return {
    primaryLanguage: normalizeLanguageTag(http.primaryLanguage),
    languageTags: Array.isArray(http.languageTags) ? http.languageTags.map(normalizeLanguageTag).filter(Boolean) : [],
    acceptLanguage: normalizeLanguageTag(http.acceptLanguage),
  };
}

export function isAppleLikeProfile(profile) {
  return profile === 'macos_safari' || profile === 'iphone_safari';
}

export function isEdgeProfile(profile) {
  return profile === 'windows_edge' || profile === 'android_edge';
}


export {
  profileToleratesSparsePermissions,
  profileToleratesEmptyPlugins,
  profileToleratesMissingNetworkApis,
  profileSupportsChromiumHints,
  profileRequiresSecFetch,
  profileExpectsGrease,
  getProfilePolicy,
};

export function buildRuleHit(id, category, delta, reason, evidence = {}, severity = 'normal') {
  return {
    id,
    category,
    matched: true,
    delta,
    reason,
    evidence,
    severity,
  };
}

export function topRuleIds(ruleHits = [], limit = 5) {
  return [...ruleHits]
    .sort((a, b) => Math.abs(Number(b?.delta ?? 0)) - Math.abs(Number(a?.delta ?? 0)))
    .slice(0, limit)
    .map((hit) => hit.id);
}
