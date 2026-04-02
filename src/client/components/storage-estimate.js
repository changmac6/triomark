export async function getStorageEstimateFingerprint() {
  if (typeof navigator === "undefined") return { supported: false, reason: "navigator-unavailable" };
  const storage = navigator.storage;
  if (!storage) return { supported: false, reason: "storage-unavailable" };
  const result = { supported: true, quota: null, usage: null, usageDetails: null, persisted: null };
  try {
    if (typeof storage.estimate === "function") {
      const estimate = await storage.estimate();
      result.quota = estimate?.quota ?? null;
      result.usage = estimate?.usage ?? null;
      result.usageDetails = estimate?.usageDetails ?? null;
    }
    if (typeof storage.persisted === "function") {
      result.persisted = await storage.persisted();
    }
    return result;
  } catch (error) {
    return { ...result, reason: error instanceof Error ? error.message : "storage-estimate-error" };
  }
}
