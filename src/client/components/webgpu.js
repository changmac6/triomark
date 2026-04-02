export async function getWebgpuFingerprint() {
  if (typeof navigator === "undefined") return { supported: false, reason: "navigator-unavailable" };
  const gpu = navigator.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") return { supported: false, reason: "webgpu-unavailable" };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: "webgpu-adapter-unavailable" };
    const featureList = adapter.features ? Array.from(adapter.features.values()).sort() : [];
    const limitsSummary = adapter.limits ? {
      maxBindGroups: adapter.limits.maxBindGroups ?? null,
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D ?? null,
      maxBufferSize: adapter.limits.maxBufferSize ?? null,
      maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup ?? null
    } : null;
    let adapterInfo = null;
    try {
      const info = typeof adapter.requestAdapterInfo === "function" ? await adapter.requestAdapterInfo() : adapter.info;
      adapterInfo = info ? { vendor: info.vendor ?? null, architecture: info.architecture ?? null, device: info.device ?? null, description: info.description ?? null } : null;
    } catch {
      adapterInfo = null;
    }
    return { supported: true, adapterInfo, featureCount: featureList.length, featureList, limitsSummary };
  } catch (error) {
    return { supported: false, reason: error instanceof Error ? error.message : "webgpu-error" };
  }
}
