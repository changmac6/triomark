import { getComponentStability } from "./stability.js";
export async function buildComponentResult(id, data, { hashShort, stableStringify, startedAt = Date.now(), status, stability, error, unstable } = {}) {
  const resolvedStability = stability ?? getComponentStability(id);
  const resolvedStatus = status ?? inferComponentStatus(data);
  const resolvedError = error ?? extractComponentError(data, resolvedStatus);
  const value = normalizeComponentValue(data, resolvedStatus, resolvedError);
  const hash = await hashShort(stableStringify(value));
  return {
    id,
    status: resolvedStatus,
    stability: resolvedStability,
    durationMs: Math.max(0, Date.now() - startedAt),
    value,
    hash,
    error: resolvedError,
    unstable: unstable ?? resolvedStability !== "stable"
  };
}
function inferComponentStatus(data) {
  if (data && typeof data === "object" && "supported" in data && data.supported === false) return "unsupported";
  if (data && typeof data === "object" && "reason" in data && data.reason) return "error";
  return "ok";
}
function extractComponentError(data, status) {
  if (status === "ok" || status === "unsupported") return null;
  return data && typeof data === "object" && "reason" in data && data.reason ? String(data.reason) : null;
}
function normalizeComponentValue(data, status, error) {
  if (status === "ok") return data;
  return { ...(data && typeof data === "object" ? data : {}), error };
}
