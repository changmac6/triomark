import fs from 'node:fs/promises';
import path from 'node:path';
import { getRiskEventsDir } from './storage.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function toSummary(event, { labelRecord = null, filePath = null, lineNumber = null } = {}) {
  if (!isPlainObject(event)) return null;

  const ruleHits = Array.isArray(event?.derived?.ruleHits) ? event.derived.ruleHits : [];
  const topRuleIds = ruleHits
    .slice(0, 10)
    .map((hit) => hit?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  const severeRuleIds = ruleHits
    .filter((hit) => ['critical', 'high'].includes(hit?.severity))
    .slice(0, 10)
    .map((hit) => hit?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  return {
    eventId: event.eventId ?? null,
    receivedAt: event.receivedAt ?? null,
    providerId: event?.provider?.providerId ?? null,
    conversationId: event?.conversation?.conversationId ?? null,
    channel: event?.conversation?.channel ?? null,
    totalRiskScore: event?.derived?.totalRiskScore ?? 0,
    scoringVariant: event?.derived?.scoringVariant ?? event?.derived?.meta?.scoringVariant ?? 'stable_v1',
    browserScore: event?.derived?.browserScore ?? 0,
    protocolScore: event?.derived?.protocolScore ?? 0,
    consistencyScore: event?.derived?.consistencyScore ?? 0,
    level: event?.derived?.level ?? 'unscored',
    browserSupportLevel: event?.derived?.browserSupportLevel ?? 'unknown',
    clientProfile: event?.derived?.clientProfile ?? 'unknown',
    serverProfile: event?.derived?.serverProfile ?? 'unknown',
    action: event?.action?.action ?? 'allow',
    challengeRequired: event?.action?.challengeRequired ?? false,
    ruleHitCount: ruleHits.length,
    topRuleIds,
    severeRuleIds,
    guardrails: (event?.derived?.meta?.guardrails ?? []).map((guardrail) => guardrail?.id).filter(Boolean),
    label: labelRecord?.label ?? null,
    reviewedAt: labelRecord?.reviewedAt ?? null,
    reviewer: labelRecord?.reviewer ?? null,
    notes: labelRecord?.notes ?? null,
    filePath,
    lineNumber,
  };
}

export async function listJsonlFilesRecursive(rootDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results.sort((a, b) => b.localeCompare(a));
}

export function matchesFilters(summary, filters) {
  if (!summary) return false;
  if (filters.providerId && summary.providerId !== filters.providerId) return false;
  if (filters.level && summary.level !== filters.level) return false;
  if (filters.browserSupportLevel && summary.browserSupportLevel !== filters.browserSupportLevel) return false;
  if (filters.clientProfile && summary.clientProfile !== filters.clientProfile) return false;
  if (filters.serverProfile && summary.serverProfile !== filters.serverProfile) return false;
  if (filters.label && summary.label !== filters.label) return false;
  if (filters.action && summary.action !== filters.action) return false;
  return true;
}

function normalizeFilters({ providerId = null, level = null, browserSupportLevel = null, clientProfile = null, serverProfile = null, label = null, action = null } = {}) {
  return {
    providerId: normalizeString(providerId),
    level: normalizeString(level),
    browserSupportLevel: normalizeString(browserSupportLevel),
    clientProfile: normalizeString(clientProfile),
    serverProfile: normalizeString(serverProfile),
    label: normalizeString(label),
    action: normalizeString(action),
  };
}

export async function listAllRiskEventSummaries({
  providerId = null,
  level = null,
  browserSupportLevel = null,
  clientProfile = null,
  serverProfile = null,
  label = null,
  action = null,
  labelsByEventId = {},
} = {}) {
  const rootDir = getRiskEventsDir();

  try {
    await fs.access(rootDir);
  } catch {
    return { rootDir, items: [], scannedFiles: 0, scannedEvents: 0 };
  }

  const files = await listJsonlFilesRecursive(rootDir);
  const items = [];
  let scannedEvents = 0;
  const filters = normalizeFilters({ providerId, level, browserSupportLevel, clientProfile, serverProfile, label, action });

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      scannedEvents += 1;
      const event = JSON.parse(lines[index]);
      const labelRecord = event?.eventId ? labelsByEventId[event.eventId] ?? null : null;
      const summary = toSummary(event, {
        labelRecord,
        filePath,
        lineNumber: index + 1,
      });
      if (!matchesFilters(summary, filters)) continue;
      items.push(summary);
    }
  }

  items.sort((a, b) => String(b.receivedAt ?? '').localeCompare(String(a.receivedAt ?? '')));

  return {
    rootDir,
    items,
    scannedFiles: files.length,
    scannedEvents,
  };
}

export async function listRecentRiskEvents({
  limit = 50,
  providerId = null,
  level = null,
  browserSupportLevel = null,
  clientProfile = null,
  serverProfile = null,
  label = null,
  action = null,
  labelsByEventId = {},
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const all = await listAllRiskEventSummaries({
    providerId,
    level,
    browserSupportLevel,
    clientProfile,
    serverProfile,
    label,
    action,
    labelsByEventId,
  });

  return {
    ...all,
    items: all.items.slice(0, safeLimit),
  };
}

export async function findRiskEventById(eventId, { labelsByEventId = {} } = {}) {
  const normalizedEventId = normalizeString(eventId);
  if (!normalizedEventId) {
    throw new Error('Missing required field: eventId');
  }

  const rootDir = getRiskEventsDir();
  try {
    await fs.access(rootDir);
  } catch {
    return null;
  }

  const files = await listJsonlFilesRecursive(rootDir);
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const event = JSON.parse(lines[index]);
      if (event?.eventId !== normalizedEventId) continue;

      const labelRecord = labelsByEventId[normalizedEventId] ?? null;
      return {
        filePath,
        lineNumber: index + 1,
        event,
        summary: toSummary(event, { labelRecord, filePath, lineNumber: index + 1 }),
        labelRecord,
      };
    }
  }

  return null;
}
