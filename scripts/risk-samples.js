import { evaluateRisk } from '../src/risk/scoring-engine.js';
import { buildActionPolicy } from '../src/risk/action-policy.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function component(value, unstable = false) {
  return { value: JSON.stringify(value), unstable, hash: 'sample' };
}

function buildClientComponents(profile) {
  const map = {
    windows_chrome: {
      system: { supported: true, browser: { name: 'Chrome' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', mobile: false, platform: 'Win32' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', uaBrands: [{ brand: 'Google Chrome', version: '145' }], uaMobile: false },
      vendor: { supported: true, vendor: 'Google Inc.' },
      vendorFlavors: { supported: true, brands: [{ brand: 'Google Chrome', version: '145' }] },
      platform: { supported: true, platform: 'Win32', uaPlatform: 'Windows', uaMobile: false },
      screen: { supported: true, width: 1920, height: 1080, pixelRatio: 1, maxTouchPoints: 0 },
      touchSupport: { supported: true, maxTouchPoints: 0 },
      languages: { supported: true, language: 'en-US', languages: ['en-US', 'en'] },
      locales: { supported: true, language: 'en-US', languages: ['en-US', 'en'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
      timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
      canvas: { supported: true },
      webgl: { supported: true },
      webGlBasics: { supported: true, renderer: 'ANGLE (NVIDIA)' },
      fonts: { supported: true, count: 80 },
      localStorage: { supported: true },
      sessionStorage: { supported: true },
      indexedDB: { supported: true },
      cookiesEnabled: { supported: true, enabled: true },
      media: { supported: true },
      permissions: { supported: true },
      pdfViewerEnabled: { supported: true, enabled: true },
      hardware: { supported: true, videoCard: { renderer: 'ANGLE (NVIDIA)' } },
      hardwareConcurrency: { supported: true, hardwareConcurrency: 8 },
      deviceMemory: { supported: true, deviceMemory: 8 },
      plugins: { supported: true, plugins: ['PDF'], mimeTypes: ['application/pdf'] },
      networkInformation: { supported: false, reason: 'privacy' },
      webrtc: { supported: false, reason: 'privacy' },
    },
    windows_edge: {
      system: { supported: true, browser: { name: 'Edge' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0', mobile: false, platform: 'Win32' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0', uaBrands: [{ brand: 'Microsoft Edge', version: '145' }], uaMobile: false },
      vendor: { supported: true, vendor: 'Google Inc.' },
      vendorFlavors: { supported: true, brands: [{ brand: 'Microsoft Edge', version: '145' }] },
      platform: { supported: true, platform: 'Win32', uaPlatform: 'Windows', uaMobile: false },
    },
    macos_chrome: {
      system: { supported: true, browser: { name: 'Chrome' }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', mobile: false, platform: 'MacIntel' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', uaBrands: [{ brand: 'Google Chrome', version: '145' }], uaMobile: false },
      vendor: { supported: true, vendor: 'Google Inc.' },
      vendorFlavors: { supported: true, brands: [{ brand: 'Google Chrome', version: '145' }] },
      platform: { supported: true, platform: 'MacIntel', uaPlatform: 'macOS', uaMobile: false },
      screen: { supported: true, width: 1512, height: 982, pixelRatio: 2, maxTouchPoints: 0 },
      touchSupport: { supported: true, maxTouchPoints: 0 },
      languages: { supported: true, language: 'en-US', languages: ['en-US', 'en'] },
      locales: { supported: true, language: 'en-US', languages: ['en-US', 'en'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
      timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
      canvas: { supported: true },
      webgl: { supported: true },
      webGlBasics: { supported: true, renderer: 'Apple M4' },
      fonts: { supported: true, count: 72 },
      localStorage: { supported: true },
      sessionStorage: { supported: true },
      indexedDB: { supported: true },
      cookiesEnabled: { supported: true, enabled: true },
      media: { supported: true },
      permissions: { supported: true },
      pdfViewerEnabled: { supported: true, enabled: true },
      hardware: { supported: true, videoCard: { renderer: 'Apple M4' } },
      hardwareConcurrency: { supported: true, hardwareConcurrency: 8 },
      deviceMemory: { supported: true, deviceMemory: 8 },
      plugins: { supported: true, plugins: ['PDF'], mimeTypes: ['application/pdf'] },
      networkInformation: { supported: false },
      webrtc: { supported: false },
    },
    macos_safari: {
      system: { supported: true, browser: { name: 'Safari' }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', mobile: false, platform: 'MacIntel' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', uaBrands: null, uaMobile: false },
      vendor: { supported: true, vendor: 'Apple Computer, Inc.' },
      vendorFlavors: { supported: true, brands: null },
      platform: { supported: true, platform: 'MacIntel', uaPlatform: null, uaMobile: null },
      screen: { supported: true, width: 1512, height: 982, pixelRatio: 2, maxTouchPoints: 0 },
      touchSupport: { supported: true, maxTouchPoints: 0 },
      languages: { supported: true, language: 'en-US', languages: ['en-US'] },
      locales: { supported: true, language: 'en-US', languages: ['en-US'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
      timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
      canvas: { supported: true },
      webgl: { supported: true },
      webGlBasics: { supported: true, renderer: 'Apple GPU' },
      fonts: { supported: true, count: 55 },
      localStorage: { supported: true },
      sessionStorage: { supported: true },
      indexedDB: { supported: true },
      cookiesEnabled: { supported: true, enabled: true },
      media: { supported: true },
      permissions: { supported: false },
      pdfViewerEnabled: { supported: true, enabled: true },
      hardware: { supported: true, videoCard: { renderer: 'Apple GPU' } },
      hardwareConcurrency: { supported: true, hardwareConcurrency: 8 },
      deviceMemory: { supported: true, deviceMemory: 8 },
      plugins: { supported: true, plugins: [], mimeTypes: [] },
      networkInformation: { supported: false },
      webrtc: { supported: false },
    },
    android_chrome: {
      system: { supported: true, browser: { name: 'Chrome' }, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36', mobile: true, platform: 'Linux armv8l' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36', uaBrands: [{ brand: 'Google Chrome', version: '145' }], uaMobile: true },
      vendor: { supported: true, vendor: 'Google Inc.' },
      vendorFlavors: { supported: true, brands: [{ brand: 'Google Chrome', version: '145' }] },
      platform: { supported: true, platform: 'Linux armv8l', uaPlatform: 'Android', uaMobile: true },
      screen: { supported: true, width: 412, height: 915, pixelRatio: 2.625, maxTouchPoints: 5 },
      touchSupport: { supported: true, maxTouchPoints: 5 },
      languages: { supported: true, language: 'en-US', languages: ['en-US', 'en'] },
      locales: { supported: true, language: 'en-US', languages: ['en-US', 'en'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
      timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
      canvas: { supported: true },
      webgl: { supported: true },
      webGlBasics: { supported: true, renderer: 'Adreno (TM) 740' },
      fonts: { supported: true, count: 38 },
      localStorage: { supported: true },
      sessionStorage: { supported: true },
      indexedDB: { supported: true },
      cookiesEnabled: { supported: true, enabled: true },
      media: { supported: true },
      permissions: { supported: true },
      pdfViewerEnabled: { supported: true, enabled: true },
      hardware: { supported: true, videoCard: { renderer: 'Adreno (TM) 740' } },
      hardwareConcurrency: { supported: true, hardwareConcurrency: 8 },
      deviceMemory: { supported: true, deviceMemory: 8 },
      plugins: { supported: true, plugins: [], mimeTypes: ['application/pdf'] },
      networkInformation: { supported: true },
      webrtc: { supported: true },
    },
    android_edge: {
      system: { supported: true, browser: { name: 'Edge' }, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36 EdgA/145.0.0.0', mobile: true, platform: 'Linux armv8l' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36 EdgA/145.0.0.0', uaBrands: [{ brand: 'Microsoft Edge', version: '145' }], uaMobile: true },
      vendor: { supported: true, vendor: 'Google Inc.' },
      vendorFlavors: { supported: true, brands: [{ brand: 'Microsoft Edge', version: '145' }] },
      platform: { supported: true, platform: 'Linux armv8l', uaPlatform: 'Android', uaMobile: true },
    },
    iphone_chrome: {
      system: { supported: true, browser: { name: 'Chrome' }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.0.0 Mobile/15E148 Safari/604.1', mobile: true, platform: 'iPhone' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.0.0 Mobile/15E148 Safari/604.1', uaBrands: null, uaMobile: true },
      vendor: { supported: true, vendor: 'Apple Computer, Inc.' },
      vendorFlavors: { supported: true, brands: null },
      platform: { supported: true, platform: 'iPhone', uaPlatform: null, uaMobile: true },
      screen: { supported: true, width: 390, height: 844, pixelRatio: 3, maxTouchPoints: 5 },
      touchSupport: { supported: true, maxTouchPoints: 5 },
      languages: { supported: true, language: 'en-US', languages: ['en-US'] },
      locales: { supported: true, language: 'en-US', languages: ['en-US'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
      timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
      canvas: { supported: true },
      webgl: { supported: true },
      webGlBasics: { supported: true, renderer: 'Apple GPU' },
      fonts: { supported: true, count: 34 },
      localStorage: { supported: true },
      sessionStorage: { supported: true },
      indexedDB: { supported: true },
      cookiesEnabled: { supported: true, enabled: true },
      media: { supported: true },
      permissions: { supported: false },
      pdfViewerEnabled: { supported: true, enabled: true },
      hardware: { supported: true, videoCard: { renderer: 'Apple GPU' } },
      hardwareConcurrency: { supported: true, hardwareConcurrency: 6 },
      deviceMemory: { supported: true, deviceMemory: 6 },
      plugins: { supported: true, plugins: [], mimeTypes: [] },
      networkInformation: { supported: false },
      webrtc: { supported: true },
    },
    iphone_safari: {
      system: { supported: true, browser: { name: 'Safari' }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', mobile: true, platform: 'iPhone' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', uaBrands: null, uaMobile: true },
      vendor: { supported: true, vendor: 'Apple Computer, Inc.' },
      vendorFlavors: { supported: true, brands: null },
      platform: { supported: true, platform: 'iPhone', uaPlatform: null, uaMobile: true },
    },
  };

  const baseGraphics = {
    screen: { supported: true, width: 390, height: 844, pixelRatio: 3, maxTouchPoints: 5 },
    touchSupport: { supported: true, maxTouchPoints: 5 },
    languages: { supported: true, language: 'en-US', languages: ['en-US'] },
    locales: { supported: true, language: 'en-US', languages: ['en-US'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
    timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
    canvas: { supported: true },
    webgl: { supported: true },
    webGlBasics: { supported: true, renderer: 'Apple GPU' },
    fonts: { supported: true, count: 34 },
    localStorage: { supported: true },
    sessionStorage: { supported: true },
    indexedDB: { supported: true },
    cookiesEnabled: { supported: true, enabled: true },
    media: { supported: true },
    permissions: { supported: false },
    pdfViewerEnabled: { supported: true, enabled: true },
    hardware: { supported: true, videoCard: { renderer: 'Apple GPU' } },
    hardwareConcurrency: { supported: true, hardwareConcurrency: 6 },
    deviceMemory: { supported: true, deviceMemory: 6 },
    plugins: { supported: true, plugins: [], mimeTypes: [] },
    networkInformation: { supported: false },
    webrtc: { supported: true },
  };

  const desktopBase = {
    screen: { supported: true, width: 1920, height: 1080, pixelRatio: 1, maxTouchPoints: 0 },
    touchSupport: { supported: true, maxTouchPoints: 0 },
    languages: { supported: true, language: 'en-US', languages: ['en-US', 'en'] },
    locales: { supported: true, language: 'en-US', languages: ['en-US', 'en'], locale: 'en-US', timeZone: 'America/Los_Angeles' },
    timezone: { supported: true, timeZone: 'America/Los_Angeles', offsetMinutes: 420 },
    canvas: { supported: true },
    webgl: { supported: true },
    webGlBasics: { supported: true, renderer: 'ANGLE (NVIDIA)' },
    fonts: { supported: true, count: 72 },
    localStorage: { supported: true },
    sessionStorage: { supported: true },
    indexedDB: { supported: true },
    cookiesEnabled: { supported: true, enabled: true },
    media: { supported: true },
    permissions: { supported: true },
    pdfViewerEnabled: { supported: true, enabled: true },
    hardware: { supported: true, videoCard: { renderer: 'ANGLE (NVIDIA)' } },
    hardwareConcurrency: { supported: true, hardwareConcurrency: 8 },
    deviceMemory: { supported: true, deviceMemory: 8 },
    plugins: { supported: true, plugins: ['PDF'], mimeTypes: ['application/pdf'] },
    networkInformation: { supported: false },
    webrtc: { supported: false },
  };

  if (profile === 'windows_edge') return { ...desktopBase, ...map.windows_edge };
  if (profile === 'windows_chrome') return { ...desktopBase, ...map.windows_chrome };
  if (profile === 'macos_chrome') return { ...desktopBase, ...map.macos_chrome };
  if (profile === 'macos_safari') return { ...desktopBase, ...map.macos_safari };
  if (profile === 'android_chrome') return { ...baseGraphics, ...map.android_chrome };
  if (profile === 'android_edge') return { ...baseGraphics, ...map.android_edge };
  if (profile === 'iphone_chrome') return { ...baseGraphics, ...map.iphone_chrome };
  if (profile === 'iphone_safari') return { ...baseGraphics, ...map.iphone_safari };
  if (profile === 'unsupported_firefox_windows') {
    return { ...desktopBase,
      system: { supported: true, browser: { name: 'Firefox' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0', mobile: false, platform: 'Win32' },
      userAgent: { supported: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0', uaBrands: null, uaMobile: false },
      vendor: { supported: true, vendor: '' },
      vendorFlavors: { supported: true, brands: null },
      platform: { supported: true, platform: 'Win32', uaPlatform: null, uaMobile: false },
    };
  }
  throw new Error(`Unsupported sample profile: ${profile}`);
}

function buildServerRaw(profile, options = {}) {
  const common = {
    network: { path: '/api/evaluate', method: 'POST' },
    http: {
      headerCount: 9,
      headerNamesInOrder: ['host','connection','content-type','accept','accept-language','accept-encoding','user-agent','sec-fetch-site','sec-fetch-mode'],
      accept: 'application/json, text/plain, */*',
      acceptEncoding: 'gzip, deflate, br',
      acceptLanguage: 'en-US,en;q=0.9',
      primaryLanguage: 'en-US',
      languageTags: ['en-US','en'],
      secFetchSite: 'same-origin',
      secFetchMode: 'cors',
      secFetchDest: 'empty',
      contentType: 'application/json',
      hasSecFetch: true,
      hasClientHints: true,
    },
    clientHints: {
      secChUa: '"Chromium";v="145"',
      secChUaMobile: '?0',
      secChUaPlatform: '"Windows"',
    },
    tls: {
      ja3: 'sample-ja3',
      ja4: 't13d1516h2_sample',
      alpnProtocol: 'h2',
      hasGrease: true,
      hostVsSniMatch: true,
      servernameVsSniMatch: true,
      alpnMismatch: false,
      supportedVersions: [772, 771],
      extensionIds: [0, 10, 11, 13, 16, 43, 45, 51],
    },
  };

  const byProfile = {
    windows_chrome: {
      http: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' },
      clientHints: { secChUa: '"Google Chrome";v="145", "Chromium";v="145"', secChUaMobile: '?0', secChUaPlatform: '"Windows"' },
    },
    windows_edge: {
      http: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0' },
      clientHints: { secChUa: '"Microsoft Edge";v="145", "Chromium";v="145"', secChUaMobile: '?0', secChUaPlatform: '"Windows"' },
    },
    macos_chrome: {
      http: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' },
      clientHints: { secChUa: '"Google Chrome";v="145", "Chromium";v="145"', secChUaMobile: '?0', secChUaPlatform: '"macOS"' },
    },
    macos_safari: {
      http: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', hasClientHints: false },
      clientHints: { secChUa: null, secChUaMobile: null, secChUaPlatform: null },
      tls: { hasGrease: false, ja4: 'safari-ja4' },
    },
    android_chrome: {
      http: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36' },
      clientHints: { secChUa: '"Google Chrome";v="145", "Chromium";v="145"', secChUaMobile: '?1', secChUaPlatform: '"Android"' },
    },
    android_edge: {
      http: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36 EdgA/145.0.0.0' },
      clientHints: { secChUa: '"Microsoft Edge";v="145", "Chromium";v="145"', secChUaMobile: '?1', secChUaPlatform: '"Android"' },
    },
    iphone_chrome: {
      http: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.0.0 Mobile/15E148 Safari/604.1', hasClientHints: false },
      clientHints: { secChUa: null, secChUaMobile: null, secChUaPlatform: null },
      tls: { hasGrease: false, ja4: 'ios-chrome-ja4' },
    },
    iphone_safari: {
      http: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', hasClientHints: false },
      clientHints: { secChUa: null, secChUaMobile: null, secChUaPlatform: null },
      tls: { hasGrease: false, ja4: 'ios-safari-ja4' },
    },
    unsupported_firefox_windows: {
      http: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0', hasClientHints: false, secFetchSite: null, secFetchMode: null },
      clientHints: { secChUa: null, secChUaMobile: null, secChUaPlatform: null },
      tls: { hasGrease: false, ja4: 'firefox-ja4', alpnProtocol: 'h2' },
    },
  };

  const data = structuredClone(common);
  const patch = byProfile[profile];
  if (!patch) throw new Error(`Unsupported server profile: ${profile}`);
  Object.assign(data.http, patch.http ?? {});
  Object.assign(data.clientHints, patch.clientHints ?? {});
  Object.assign(data.tls, patch.tls ?? {});

  if (profile.startsWith('iphone_')) data.clientHints.secChUaMobile = '?1';
  if (options.serverProfileOverride && byProfile[options.serverProfileOverride]) {
    const override = byProfile[options.serverProfileOverride];
    Object.assign(data.http, override.http ?? {});
    Object.assign(data.clientHints, override.clientHints ?? {});
    Object.assign(data.tls, override.tls ?? {});
  }

  if (options.dropTlsSignals) {
    data.tls.ja4 = null;
    data.tls.ja3 = null;
    data.tls.extensionIds = [];
    data.tls.supportedVersions = [];
    data.tls.alpnProtocol = null;
  }

  if (options.removeHints) {
    data.clientHints.secChUa = null;
    data.clientHints.secChUaPlatform = null;
    data.clientHints.secChUaMobile = null;
    data.http.hasClientHints = false;
  }

  return data;
}

function buildEvent({ clientProfile, serverProfile = clientProfile, options = {} }) {
  const components = buildClientComponents(clientProfile);
  const compMap = Object.fromEntries(Object.entries(components).map(([k, v]) => [k, component(v)]));
  return {
    client: {
      raw: {
        client: {
          components: compMap,
        },
        groupedComponents: {
          environment: { system: true, userAgent: true, platform: true },
          locale: { languages: true, locales: true, timezone: true },
          display: { screen: true, touchSupport: true },
          graphics: { canvas: true, webgl: true, fonts: true },
          storage: { localStorage: true, sessionStorage: true, indexedDB: true },
          capability: { media: true, permissions: true, pdfViewerEnabled: true },
        },
      },
    },
    server: {
      raw: buildServerRaw(clientProfile, { ...options, serverProfileOverride: serverProfile }),
    },
  };
}

const cases = [
  { name: 'windows chrome baseline', event: buildEvent({ clientProfile: 'windows_chrome' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'windows edge baseline', event: buildEvent({ clientProfile: 'windows_edge' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'macos chrome baseline', event: buildEvent({ clientProfile: 'macos_chrome' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'macos safari baseline', event: buildEvent({ clientProfile: 'macos_safari' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'android chrome baseline', event: buildEvent({ clientProfile: 'android_chrome' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'android edge baseline', event: buildEvent({ clientProfile: 'android_edge' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'iphone chrome baseline', event: buildEvent({ clientProfile: 'iphone_chrome' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'iphone safari baseline', event: buildEvent({ clientProfile: 'iphone_safari' }), expect: { minScore: 80, support: 'supported' } },
  { name: 'unsupported firefox policy', event: buildEvent({ clientProfile: 'unsupported_firefox_windows', serverProfile: 'unsupported_firefox_windows' }), expect: { maxScore: 39, support: 'unsupported', action: 'restrict' } },
  { name: 'client safari but server chrome mismatch', event: buildEvent({ clientProfile: 'iphone_safari', serverProfile: 'iphone_chrome' }), expect: { maxScore: 59, support: 'supported' } },
];

for (const entry of cases) {
  const result = evaluateRisk(entry.event);
  const action = buildActionPolicy(result.level, { browserSupportLevel: result.browserSupportLevel });
  console.log(`\n=== ${entry.name} ===`);
  console.log(JSON.stringify({
    totalRiskScore: result.totalRiskScore,
    browserScore: result.browserScore,
    protocolScore: result.protocolScore,
    consistencyScore: result.consistencyScore,
    level: result.level,
    browserSupportLevel: result.browserSupportLevel,
    clientProfile: result.clientProfile,
    serverProfile: result.serverProfile,
    guardrails: result.meta.guardrails,
    topRuleIds: result.meta.topRuleIds,
    action: action.action,
  }, null, 2));

  if (entry.expect.minScore != null) {
    assert(result.totalRiskScore >= entry.expect.minScore, `${entry.name} expected score >= ${entry.expect.minScore}, got ${result.totalRiskScore}`);
  }
  if (entry.expect.maxScore != null) {
    assert(result.totalRiskScore <= entry.expect.maxScore, `${entry.name} expected score <= ${entry.expect.maxScore}, got ${result.totalRiskScore}`);
  }
  if (entry.expect.support) {
    assert(result.browserSupportLevel === entry.expect.support, `${entry.name} expected support ${entry.expect.support}, got ${result.browserSupportLevel}`);
  }
  if (entry.expect.action) {
    assert(action.action === entry.expect.action, `${entry.name} expected action ${entry.expect.action}, got ${action.action}`);
  }
}

console.log('\nAll synthetic risk sample assertions passed.');
