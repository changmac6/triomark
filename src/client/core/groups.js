export const COMPONENT_GROUPS = {
  environment: ["system", "userAgent", "userAgentHighEntropy", "platform", "vendor", "vendorFlavors", "cpuClass", "osCpu", "architecture", "environment"],
  locale: ["languages", "locales", "timezone", "dateTimeLocale", "intl"],
  display: ["screen", "screenResolution", "screenFrame", "colorDepth", "colorGamut", "contrast", "forcedColors", "invertedColors", "monochrome", "hdr", "reducedMotion", "reducedTransparency"],
  graphics: ["canvas", "svg", "webgl", "webGlBasics", "webGlExtensions", "domRect", "fontPreferences", "fonts", "mathml", "webgpu"],
  audio: ["audio", "audioBaseLatency", "speech"],
  storage: ["cookiesEnabled", "localStorage", "sessionStorage", "indexedDB", "openDatabase", "pdfViewerEnabled", "storageEstimate"],
  capability: ["touchSupport", "sensors", "media", "mediaDevices", "clipboard", "applePay", "privateClickMeasurement", "automationSignals"],
  runtime: ["hardware", "hardwareConcurrency", "deviceMemory", "math"],
  pluginPermission: ["plugins", "permissions", "domBlockers"],
  networkLike: ["networkInformation", "webrtc", "webrtcExtended"]
};
export function getComponentGroup(id) {
  for (const [group, ids] of Object.entries(COMPONENT_GROUPS)) {
    if (ids.includes(id)) return group;
  }
  return "ungrouped";
}
