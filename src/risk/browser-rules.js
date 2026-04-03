import {
  getComponentValue,
  getGroupedComponents,
  hasSupportedFlag,
  hasUnsupportedFlag,
  detectClientBrowserFamily,
  detectClientProfile,
  detectSupportedBrowserPolicy,
  profileToleratesSparsePermissions,
  profileToleratesEmptyPlugins,
  profileToleratesMissingNetworkApis,
  buildRuleHit,
} from './signal-utils.js';

function getSystem(event) { return getComponentValue(event, 'system'); }
function getPlatform(event) { return getComponentValue(event, 'platform'); }
function getScreen(event) { return getComponentValue(event, 'screen'); }
function getTouchSupport(event) { return getComponentValue(event, 'touchSupport'); }
function getLanguages(event) { return getComponentValue(event, 'languages'); }
function getLocales(event) { return getComponentValue(event, 'locales'); }
function getTimezone(event) { return getComponentValue(event, 'timezone'); }
function getFonts(event) { return getComponentValue(event, 'fonts'); }
function getWebgl(event) { return getComponentValue(event, 'webgl'); }
function getCanvas(event) { return getComponentValue(event, 'canvas'); }
function getLocalStorage(event) { return getComponentValue(event, 'localStorage'); }
function getSessionStorage(event) { return getComponentValue(event, 'sessionStorage'); }
function getIndexedDb(event) { return getComponentValue(event, 'indexedDB'); }
function getCookiesEnabled(event) { return getComponentValue(event, 'cookiesEnabled'); }
function getMedia(event) { return getComponentValue(event, 'media'); }
function getPermissions(event) { return getComponentValue(event, 'permissions'); }
function getPdfViewer(event) { return getComponentValue(event, 'pdfViewerEnabled'); }
function getHardware(event) { return getComponentValue(event, 'hardware'); }
function getHardwareConcurrency(event) { return getComponentValue(event, 'hardwareConcurrency'); }
function getDeviceMemory(event) { return getComponentValue(event, 'deviceMemory'); }
function getPlugins(event) { return getComponentValue(event, 'plugins'); }
function getNetworkInformation(event) { return getComponentValue(event, 'networkInformation'); }
function getWebrtc(event) { return getComponentValue(event, 'webrtc'); }

function detectDeviceClass(event) {
  const system = getSystem(event);
  const screen = getScreen(event);
  const touch = getTouchSupport(event);
  const width = Number(screen?.width ?? 0);
  const mobile = system?.mobile === true;
  const maxTouchPoints = Number(touch?.maxTouchPoints ?? 0);

  if (mobile) return width >= 768 ? 'tablet' : 'mobile';
  if (maxTouchPoints >= 3 && width > 0 && width < 900) return 'mobile';
  if (system?.mobile === false) return 'desktop';
  return 'unknown';
}

function countMissingCore(event) {
  return [
    getSystem(event),
    getScreen(event),
    getCanvas(event),
    getWebgl(event),
    getLocalStorage(event),
    getSessionStorage(event),
    getIndexedDb(event),
    getTimezone(event),
  ].filter((value) => value == null || hasUnsupportedFlag(value)).length;
}

function countMissingStorage(event) {
  let missing = 0;
  if (getCookiesEnabled(event)?.enabled !== true) missing += 1;
  if (!hasSupportedFlag(getLocalStorage(event))) missing += 1;
  if (!hasSupportedFlag(getSessionStorage(event))) missing += 1;
  if (!hasSupportedFlag(getIndexedDb(event))) missing += 1;
  return missing;
}

function fontCount(event) {
  return Number(getFonts(event)?.count ?? 0);
}

function webglAvailable(event) {
  return hasSupportedFlag(getWebgl(event));
}

function canvasAvailable(event) {
  return hasSupportedFlag(getCanvas(event));
}

function ruleSupportedBrowserPolicy(event) {
  const policy = detectSupportedBrowserPolicy(event);
  if (policy.level === 'supported') return null;
  if (policy.level === 'unsupported') {
    return buildRuleHit('B000', 'browser', -40, 'Browser family is outside supported policy for anonymous messaging', {
      clientProfile: policy.clientProfile,
      serverProfile: policy.serverProfile,
    }, 'critical');
  }
  return buildRuleHit('B000', 'browser', -20, 'Browser profile is not confidently within supported policy', {
    clientProfile: policy.clientProfile,
    serverProfile: policy.serverProfile,
  }, 'high');
}

function ruleCoreComponentsPresent(event) {
  const missing = countMissingCore(event);
  if (missing <= 1) return null;
  if (missing <= 3) {
    return buildRuleHit('B001', 'browser', -10, 'Core browser components are partially missing', { missingCoreCount: missing });
  }
  return buildRuleHit('B001', 'browser', -25, 'Core browser components are severely incomplete', { missingCoreCount: missing }, 'high');
}

function ruleStorageCapabilities(event) {
  const family = detectClientBrowserFamily(event);
  const missing = countMissingStorage(event);
  if (missing === 0) return null;

  let delta = missing === 1 ? -4 : missing === 2 ? -8 : -18;
  if (family === 'safari' && missing === 1) delta = -2;

  return buildRuleHit('B002', 'browser', delta, 'Storage capabilities are sparser than expected for a normal browser session', {
    browserFamily: family,
    missingStorageCount: missing,
  });
}

function ruleWebglAvailability(event) {
  const family = detectClientBrowserFamily(event);
  if (family === 'unknown') return null;
  if (!webglAvailable(event)) {
    const delta = canvasAvailable(event) ? -10 : -16;
    return buildRuleHit('B003', 'browser', delta, 'WebGL is unavailable in an otherwise browser-like environment', {
      browserFamily: family,
      canvasSupported: canvasAvailable(event),
    });
  }
  return null;
}

function ruleGraphicsSparsity(event) {
  const fonts = fontCount(event);
  const weakCanvas = !canvasAvailable(event);
  const weakWebgl = !webglAvailable(event);
  if ((weakCanvas && weakWebgl && fonts < 20) || (weakCanvas && fonts < 10)) {
    return buildRuleHit('B004', 'browser', -18, 'Graphics-related signals are unusually sparse', {
      fontsCount: fonts,
      canvasSupported: !weakCanvas,
      webglSupported: !weakWebgl,
    }, 'high');
  }
  return null;
}

function rulePlatformConsistency(event) {
  const system = getSystem(event);
  const platform = getPlatform(event);
  const screen = getScreen(event);
  const touch = getTouchSupport(event);
  const deviceClass = detectDeviceClass(event);
  const uaMobile = platform?.uaMobile;
  const maxTouchPoints = Number(touch?.maxTouchPoints ?? 0);
  const width = Number(screen?.width ?? 0);
  const contradictions = [];

  if (system?.mobile === false && uaMobile === true) contradictions.push('system.mobile=false but uaMobile=true');
  if (system?.mobile === true && uaMobile === false) contradictions.push('system.mobile=true but uaMobile=false');
  if (deviceClass === 'desktop' && maxTouchPoints >= 5 && width > 0 && width < 900) contradictions.push('desktop-like system with strong mobile touch profile');
  if (deviceClass === 'mobile' && width >= 1200) contradictions.push('mobile-like system with desktop-sized width');

  if (contradictions.length === 0) return null;
  if (contradictions.length === 1) {
    return buildRuleHit('B005', 'browser', -8, 'Platform and device signals show partial inconsistency', { contradictions });
  }
  return buildRuleHit('B005', 'browser', -15, 'Platform and device signals show multiple inconsistencies', { contradictions }, 'high');
}

function ruleLocaleTimezonePresence(event) {
  const languages = getLanguages(event);
  const locales = getLocales(event);
  const timezone = getTimezone(event);
  let missing = 0;
  if (!languages?.language) missing += 1;
  if (!Array.isArray(languages?.languages) || languages.languages.length === 0) missing += 1;
  if (!locales?.locale) missing += 1;
  if (!timezone?.timeZone) missing += 1;

  if (missing <= 1) return null;
  if (missing === 2) {
    return buildRuleHit('B006', 'browser', -4, 'Locale and timezone signals are partially missing', { missingLocaleCount: missing });
  }
  return buildRuleHit('B006', 'browser', -10, 'Locale and timezone signals are unusually empty', { missingLocaleCount: missing });
}

function ruleCapabilitiesSparsity(event) {
  const profile = detectClientProfile(event);
  const weak = [];
  if (!hasSupportedFlag(getMedia(event))) weak.push('media');
  if (!hasSupportedFlag(getPermissions(event))) weak.push('permissions');
  if (getPdfViewer(event)?.enabled !== true) weak.push('pdfViewerEnabled');

  if (weak.length < 2) return null;
  if (profileToleratesSparsePermissions(profile)) {
    if (weak.length <= 2 && weak.includes('permissions')) return null;
  }

  return buildRuleHit('B007', 'browser', -10, 'Modern browser capabilities are unusually sparse', {
    clientProfile: profile,
    weakCapabilities: weak,
  });
}

function ruleHardwareSignals(event) {
  const hardware = getHardware(event);
  const hardwareConcurrency = getHardwareConcurrency(event);
  const deviceMemory = getDeviceMemory(event);
  const issues = [];

  if (!Number.isFinite(Number(hardwareConcurrency?.hardwareConcurrency ?? NaN)) || Number(hardwareConcurrency?.hardwareConcurrency ?? 0) <= 0) issues.push('hardwareConcurrency');
  if (deviceMemory?.deviceMemory == null) issues.push('deviceMemory');
  if (hardware?.videoCard == null) issues.push('videoCard');

  if (issues.length === 0) return null;
  if (issues.length === 1) {
    return buildRuleHit('B008', 'browser', -6, 'Hardware signals are partially missing', { issues });
  }
  return buildRuleHit('B008', 'browser', -12, 'Hardware signals are unusually incomplete', { issues });
}

function rulePluginSparsity(event) {
  const profile = detectClientProfile(event);
  const plugins = getPlugins(event);
  const pluginCount = Array.isArray(plugins?.plugins) ? plugins.plugins.length : 0;
  const mimeCount = Array.isArray(plugins?.mimeTypes) ? plugins.mimeTypes.length : 0;

  if (profileToleratesEmptyPlugins(profile)) return null;
  if (pluginCount > 0 || mimeCount > 0) return null;
  return buildRuleHit('B009', 'browser', -4, 'Plugin and MIME type signals are completely empty', {
    clientProfile: profile,
    pluginCount,
    mimeCount,
  });
}

function rulePrivacyModeDoNotOverPenalize(event) {
  const conditions = [];
  if (!getNetworkInformation(event) || hasUnsupportedFlag(getNetworkInformation(event))) conditions.push('networkInformation');
  if (!getWebrtc(event) || hasUnsupportedFlag(getWebrtc(event))) conditions.push('webrtc');
  if (conditions.length === 2 && profileToleratesMissingNetworkApis(detectClientProfile(event))) {
    return buildRuleHit('B010', 'browser', 0, 'Network-like APIs are sparse, but this is not heavily penalized by design', {
      note: 'privacy-protective neutral rule',
      conditions,
    });
  }
  return null;
}

function rulePositiveBrowserFamilyFit(event) {
  const profile = detectClientProfile(event);
  const storageMissing = countMissingStorage(event);
  if (['windows_chrome', 'windows_edge', 'macos_chrome', 'android_chrome', 'android_edge'].includes(profile) && storageMissing === 0) {
    return buildRuleHit('B011', 'browser', +6, 'Browser family signals look plausible for a supported Chromium-like environment', { clientProfile: profile });
  }
  if (['macos_safari', 'iphone_safari', 'iphone_chrome'].includes(profile)) {
    return buildRuleHit('B011', 'browser', +5, 'Browser family signals look plausible for a supported Apple/iPhone environment', { clientProfile: profile });
  }
  return null;
}

function rulePositiveEnvironmentCompleteness(event) {
  const grouped = getGroupedComponents(event);
  const groups = [grouped.environment, grouped.locale, grouped.display, grouped.graphics, grouped.storage, grouped.capability];
  const present = groups.filter((group) => group && typeof group === 'object' && Object.keys(group).length >= 2).length;
  const keyChecks = [
    getScreen(event),
    getTimezone(event),
    getLanguages(event),
    getCanvas(event),
    getWebgl(event),
    getFonts(event),
    getLocalStorage(event),
    getSessionStorage(event),
    getIndexedDb(event),
    getMedia(event),
  ];
  const availableCount = keyChecks.filter((value) => value != null && !hasUnsupportedFlag(value)).length;

  if (present >= 5 && availableCount >= 8) {
    return buildRuleHit('B012', 'browser', +6, 'Browser environment completeness looks strong', {
      populatedGroups: present,
      availableSignals: availableCount,
    });
  }
  return null;
}

export function getBrowserRules() {
  return [
    ruleSupportedBrowserPolicy,
    ruleCoreComponentsPresent,
    ruleStorageCapabilities,
    ruleWebglAvailability,
    ruleGraphicsSparsity,
    rulePlatformConsistency,
    ruleLocaleTimezonePresence,
    ruleCapabilitiesSparsity,
    ruleHardwareSignals,
    rulePluginSparsity,
    rulePrivacyModeDoNotOverPenalize,
    rulePositiveBrowserFamilyFit,
    rulePositiveEnvironmentCompleteness,
  ];
}
