export const TRIOMARK_SCHEMA_VERSION = "1.0.0-phase2";
export function createEmptyMeta() {
  return {
    collector: "triomark",
    version: "0.2.0",
    schemaVersion: TRIOMARK_SCHEMA_VERSION,
    collectedAt: new Date().toISOString(),
    page: {
      href: globalThis.location?.href ?? null,
      origin: globalThis.location?.origin ?? null,
      protocol: globalThis.location?.protocol ?? null,
      host: globalThis.location?.host ?? null,
      pathname: globalThis.location?.pathname ?? null
    },
    timing: { clientCollectMs: 0, serverCollectMs: 0, totalMs: 0 },
    errors: { client: [], server: [] }
  };
}
