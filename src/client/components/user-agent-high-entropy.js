export async function getUserAgentHighEntropyFingerprint() {
  if (typeof navigator === "undefined") return { supported: false, reason: "navigator-unavailable" };
  const uaData = navigator.userAgentData;
  if (!uaData) return { supported: false, reason: "user-agent-data-unavailable" };
  const result = {
    supported: true,
    brands: uaData.brands ?? [],
    mobile: uaData.mobile ?? null,
    platform: uaData.platform ?? null,
    architecture: null,
    bitness: null,
    model: null,
    platformVersion: null,
    fullVersionList: [],
    wow64: null,
    formFactors: []
  };
  if (typeof uaData.getHighEntropyValues !== "function") return result;
  try {
    const high = await uaData.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "fullVersionList", "wow64", "formFactors"]);
    return {
      ...result,
      architecture: high.architecture ?? null,
      bitness: high.bitness ?? null,
      model: high.model ?? null,
      platformVersion: high.platformVersion ?? null,
      fullVersionList: high.fullVersionList ?? [],
      wow64: high.wow64 ?? null,
      formFactors: high.formFactors ?? []
    };
  } catch (error) {
    return { ...result, reason: error instanceof Error ? error.message : "user-agent-high-entropy-error" };
  }
}
