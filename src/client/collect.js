export async function collectComponents(registry, componentIds, { withTimeout, timeoutMs = 2500 } = {}) {
  const componentResults = {};
  const errors = [];
  for (const id of componentIds) {
    const getter = registry[id];
    if (!getter) {
      errors.push({ id, error: `Unknown fingerprint component: ${id}` });
      continue;
    }
    try {
      componentResults[id] = await withTimeout(() => getter(), timeoutMs, {
        id,
        status: "timeout",
        stability: "volatile",
        durationMs: timeoutMs,
        value: { supported: false, reason: "component-timeout" },
        hash: "timeout",
        error: "component-timeout",
        unstable: true
      });
    } catch (error) {
      errors.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { componentResults, errors };
}
