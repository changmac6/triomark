export const SUPPORTED_BASELINE_PROFILES = Object.freeze([
  'windows_chrome',
  'windows_edge',
  'macos_chrome',
  'macos_safari',
  'android_chrome',
  'android_edge',
  'iphone_chrome',
  'iphone_safari',
]);

const PROFILE_POLICY = Object.freeze({
  windows_chrome: {
    browserFamily: 'chrome',
    platform: 'windows',
    deviceClass: 'desktop',
    engineClass: 'chromium',
    requiresChromiumClientHints: true,
    requiresSecFetchForApi: true,
    expectsGrease: true,
    toleratesSparsePermissions: false,
    toleratesEmptyPlugins: false,
    toleratesMissingNetworkApis: true,
  },
  windows_edge: {
    browserFamily: 'edge',
    platform: 'windows',
    deviceClass: 'desktop',
    engineClass: 'chromium',
    requiresChromiumClientHints: true,
    requiresSecFetchForApi: true,
    expectsGrease: true,
    toleratesSparsePermissions: false,
    toleratesEmptyPlugins: false,
    toleratesMissingNetworkApis: true,
  },
  macos_chrome: {
    browserFamily: 'chrome',
    platform: 'macos',
    deviceClass: 'desktop',
    engineClass: 'chromium',
    requiresChromiumClientHints: true,
    requiresSecFetchForApi: true,
    expectsGrease: true,
    toleratesSparsePermissions: false,
    toleratesEmptyPlugins: false,
    toleratesMissingNetworkApis: true,
  },
  macos_safari: {
    browserFamily: 'safari',
    platform: 'macos',
    deviceClass: 'desktop',
    engineClass: 'apple-webkit',
    requiresChromiumClientHints: false,
    requiresSecFetchForApi: false,
    expectsGrease: false,
    toleratesSparsePermissions: true,
    toleratesEmptyPlugins: true,
    toleratesMissingNetworkApis: true,
  },
  android_chrome: {
    browserFamily: 'chrome',
    platform: 'android',
    deviceClass: 'mobile',
    engineClass: 'chromium',
    requiresChromiumClientHints: true,
    requiresSecFetchForApi: true,
    expectsGrease: true,
    toleratesSparsePermissions: false,
    toleratesEmptyPlugins: true,
    toleratesMissingNetworkApis: false,
  },
  android_edge: {
    browserFamily: 'edge',
    platform: 'android',
    deviceClass: 'mobile',
    engineClass: 'chromium',
    requiresChromiumClientHints: true,
    requiresSecFetchForApi: true,
    expectsGrease: true,
    toleratesSparsePermissions: false,
    toleratesEmptyPlugins: true,
    toleratesMissingNetworkApis: false,
  },
  iphone_chrome: {
    browserFamily: 'chrome',
    platform: 'iphone',
    deviceClass: 'mobile',
    engineClass: 'ios-webkit',
    requiresChromiumClientHints: false,
    requiresSecFetchForApi: false,
    expectsGrease: false,
    toleratesSparsePermissions: true,
    toleratesEmptyPlugins: true,
    toleratesMissingNetworkApis: true,
  },
  iphone_safari: {
    browserFamily: 'safari',
    platform: 'iphone',
    deviceClass: 'mobile',
    engineClass: 'ios-webkit',
    requiresChromiumClientHints: false,
    requiresSecFetchForApi: false,
    expectsGrease: false,
    toleratesSparsePermissions: true,
    toleratesEmptyPlugins: true,
    toleratesMissingNetworkApis: true,
  },
});

export function isSupportedBaselineProfile(profile) {
  return SUPPORTED_BASELINE_PROFILES.includes(profile);
}

export function getProfilePolicy(profile) {
  return PROFILE_POLICY[profile] ?? null;
}

export function profileSupportsChromiumHints(profile) {
  return getProfilePolicy(profile)?.requiresChromiumClientHints === true;
}

export function profileRequiresSecFetch(profile) {
  return getProfilePolicy(profile)?.requiresSecFetchForApi === true;
}

export function profileExpectsGrease(profile) {
  return getProfilePolicy(profile)?.expectsGrease === true;
}

export function profileToleratesSparsePermissions(profile) {
  return getProfilePolicy(profile)?.toleratesSparsePermissions === true;
}

export function profileToleratesEmptyPlugins(profile) {
  return getProfilePolicy(profile)?.toleratesEmptyPlugins === true;
}

export function profileToleratesMissingNetworkApis(profile) {
  return getProfilePolicy(profile)?.toleratesMissingNetworkApis === true;
}

export function getSupportedProfileBreakdown() {
  return PROFILE_POLICY;
}
