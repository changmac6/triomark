export function getAutomationSignalsFingerprint() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { supported: false, reason: "environment-unavailable" };
  return {
    supported: true,
    webdriver: navigator.webdriver ?? null,
    chromeObjectPresent: typeof window.chrome !== "undefined",
    permissionsApiPresent: typeof navigator.permissions !== "undefined",
    pluginsLength: navigator.plugins?.length ?? 0,
    languagesLength: navigator.languages?.length ?? 0,
    outerWidth: window.outerWidth ?? null,
    outerHeight: window.outerHeight ?? null,
    innerWidth: window.innerWidth ?? null,
    innerHeight: window.innerHeight ?? null,
    notificationPermission: typeof Notification !== "undefined" ? Notification.permission ?? null : null,
    hasCallPhantom: typeof window.callPhantom === "function",
    hasEmit: typeof window.emit === "function",
    hasSpawn: typeof window.spawn === "function",
    chromeRuntimePresent: Boolean(window.chrome?.runtime),
    pdfViewerEnabled: typeof navigator.pdfViewerEnabled === "boolean" ? navigator.pdfViewerEnabled : null
  };
}
