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

const CHROMIUM_LIKE_UA_PATTERNS = [
  /(?:OPR|Opera|OPiOS)\/[\d.]+/i,
  /SamsungBrowser\/[\d.]+/i,
  /YaBrowser\/[\d.]+/i,
  /Vivaldi\/[\d.]+/i,
  /DuckDuckGo(?:\/[\d.]+)?/i,
  /DDG\/[\d.]+/i,
  /Whale\/[\d.]+/i,
  /CocCoc\/[\d.]+/i,
  /Maxthon\/[\d.]+/i,
  /Avast\/[\d.]+/i,
  /AVG\/[\d.]+/i,
  /Sleipnir\/[\d.]+/i,
  /Quark\/[\d.]+/i,
  /HuaweiBrowser\/[\d.]+/i,
  /MiuiBrowser\/[\d.]+/i,
  /HeyTapBrowser\/[\d.]+/i,
  /Iron\/[\d.]+/i,
  /Arc(?:Search)?\/[\d.]+/i,
];

const CHROMIUM_LIKE_BRAND_PATTERNS = [
  /Opera/i,
  /Brave/i,
  /Vivaldi/i,
  /DuckDuckGo/i,
  /Samsung Internet/i,
  /Yandex/i,
  /Whale/i,
  /Coc Coc/i,
  /Maxthon/i,
  /Arc/i,
];

function isChromiumLikeUserAgent(ua) {
  return includesAny(ua, CHROMIUM_LIKE_UA_PATTERNS);
}

function isChromiumLikeBrand(brandNames) {
  return brandNames.some((name) => includesAny(String(name), CHROMIUM_LIKE_BRAND_PATTERNS));
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
  const hasGoogleChromeBrand = brandNames.some((name) => /google chrome/i.test(name));
  const hasChromiumBrand = brandNames.some((name) => /^chromium$/i.test(name));
  const isChromiumLike = browserName === 'chromium_like' || isChromiumLikeUserAgent(ua) || isChromiumLikeBrand(brandNames);

  if (browserName === 'edge' || /Edg(A|iOS)?\//.test(ua) || brandNames.some((name) => /Edge/i.test(name))) {
    return 'edge';
  }
  if (isChromiumLike) {
    return 'chromium_like';
  }
  if (browserName === 'safari' || (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua) && !/Edg(A|iOS)?\//.test(ua) && !isChromiumLikeUserAgent(ua))) {
    return 'safari';
  }
  if (browserName === 'chrome') {
    return 'chrome';
  }

  const looksLikeChrome = (/Chrome\//.test(ua) || /CriOS\//.test(ua)) && !/Edg(A|iOS)?\//.test(ua);
  const hasStrictChromeSignals = vendorName.includes('Google') || hasGoogleChromeBrand || /CriOS\//.test(ua);
  if (looksLikeChrome && hasStrictChromeSignals && !(hasChromiumBrand && !hasGoogleChromeBrand)) {
    return 'chrome';
  }
  if (looksLikeChrome) {
    return 'chromium_like';
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
  const secChUaBrands = secChUa.split(',').map((part) => part.trim()).filter(Boolean);
  const hasGoogleChromeBrand = /Google Chrome/i.test(secChUa);
  const hasChromiumBrand = /"Chromium"/i.test(secChUa);
  const isChromiumLike = isChromiumLikeUserAgent(ua) || isChromiumLikeBrand(secChUaBrands);

  if (/Edg(A|iOS)?\//.test(ua) || /Microsoft Edge/i.test(secChUa)) return 'edge';
  if (isChromiumLike) return 'chromium_like';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua) && !/Edg(A|iOS)?\//.test(ua) && !isChromiumLikeUserAgent(ua)) return 'safari';

  const looksLikeChrome = (/Chrome\//.test(ua) || /CriOS\//.test(ua)) && !/Edg(A|iOS)?\//.test(ua);
  if (looksLikeChrome && (hasGoogleChromeBrand || /CriOS\//.test(ua) || (hasChromiumBrand && !isChromiumLike))) {
    return 'chrome';
  }
  if (looksLikeChrome) return 'chromium_like';
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
  return `unsupported_${platform}_${browser}`;
}

export function detectSupportedBrowserPolicy(event) {
  const clientProfile = detectClientProfile(event);
  const serverProfile = detectServerProfile(event);
  const profiles = [clientProfile, serverProfile].filter(Boolean);
  const supportedProfiles = profiles.filter((profile) => SUPPORTED_BASELINE_PROFILES.includes(profile));
  const unsupportedProfiles = profiles.filter((profile) => profile.startsWith('unsupported_'));

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
