import { getComponentGroup, COMPONENT_GROUPS } from "./core/groups.js";
export function groupComponents(componentMap) {
  const grouped = {};
  for (const groupName of Object.keys(COMPONENT_GROUPS)) grouped[groupName] = {};
  grouped.ungrouped = {};
  for (const [id, result] of Object.entries(componentMap)) {
    grouped[getComponentGroup(id)][id] = result;
  }
  return grouped;
}
export function buildSummary(componentMap) {
  const summary = {
    componentCount: 0,
    stableComponentCount: 0,
    semiStableComponentCount: 0,
    volatileComponentCount: 0,
    supportedComponentCount: 0,
    unsupportedComponentCount: 0,
    errorComponentCount: 0,
    timeoutComponentCount: 0
  };
  for (const result of Object.values(componentMap)) {
    summary.componentCount += 1;
    if (result.stability === "stable") summary.stableComponentCount += 1;
    if (result.stability === "semi_stable") summary.semiStableComponentCount += 1;
    if (result.stability === "volatile") summary.volatileComponentCount += 1;
    if (result.status === "ok") summary.supportedComponentCount += 1;
    if (result.status === "unsupported") summary.unsupportedComponentCount += 1;
    if (result.status === "error") summary.errorComponentCount += 1;
    if (result.status === "timeout") summary.timeoutComponentCount += 1;
  }
  return summary;
}
