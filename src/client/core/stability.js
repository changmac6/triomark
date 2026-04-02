export const STABLE_COMPONENT_IDS = ["architecture", "audio", "audioBaseLatency", "canvas", "colorDepth", "colorGamut", "cpuClass", "deviceMemory", "fontPreferences", "fonts", "hardware", "hardwareConcurrency", "hdr", "intl", "math", "mathml", "monochrome", "pdfViewerEnabled", "platform", "screen", "screenResolution", "svg", "vendor", "vendorFlavors", "webGlBasics", "webGlExtensions", "webgl"];
export const SEMI_STABLE_COMPONENT_IDS = ["dateTimeLocale", "languages", "locales", "media", "mediaDevices", "osCpu", "plugins", "speech", "storageEstimate", "system", "timezone", "touchSupport", "userAgent", "userAgentHighEntropy"];
export const VOLATILE_COMPONENT_IDS = ["applePay", "automationSignals", "clipboard", "cookiesEnabled", "domBlockers", "domRect", "environment", "indexedDB", "localStorage", "networkInformation", "openDatabase", "permissions", "privateClickMeasurement", "reducedMotion", "reducedTransparency", "screenFrame", "sensors", "sessionStorage", "webgpu", "webrtc", "webrtcExtended"];
export const COMPONENT_STABILITY = Object.freeze(Object.fromEntries([
  ...STABLE_COMPONENT_IDS.map((id) => [id, "stable"]),
  ...SEMI_STABLE_COMPONENT_IDS.map((id) => [id, "semi_stable"]),
  ...VOLATILE_COMPONENT_IDS.map((id) => [id, "volatile"])
]));
export function getComponentStability(id) {
  return COMPONENT_STABILITY[id] ?? "stable";
}
