export function getEnvironmentFingerprint() {
  if (typeof window === "undefined" || typeof document === "undefined") return { supported: false, reason: "environment-unavailable" };
  return {
    supported: true,
    isSecureContext: globalThis.isSecureContext ?? false,
    crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
    navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine ?? null : null,
    visibilityState: document.visibilityState ?? null,
    prerendering: document.prerendering ?? null,
    location: {
      protocol: window.location?.protocol ?? null,
      host: window.location?.host ?? null,
      pathname: window.location?.pathname ?? null
    },
    origin: window.origin ?? null
  };
}
