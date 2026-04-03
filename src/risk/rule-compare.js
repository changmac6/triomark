import fs from 'node:fs/promises';
import { getRiskEventsDir } from './storage.js';
import { listJsonlFilesRecursive, toSummary, matchesFilters } from './review-store.js';
import { loadRiskLabels } from './label-store.js';
import { evaluateRisk } from './scoring-engine.js';
import { buildActionPolicy } from './action-policy.js';
import { buildCompareSummary } from './compare-analysis.js';
import { listScoringVariants, getScoringVariant } from './scoring-variants.js';

function normalizeString(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
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

function toReplayEvent(entry) {
  if (entry?.client?.raw && entry?.server?.raw) {
    return { client: entry.client, server: entry.server };
  }
  return null;
}

export async function loadStoredReplayEntries({ rootDir = getRiskEventsDir(), filters = {}, labelsByEventId = {} } = {}) {
  try {
    await fs.access(rootDir);
  } catch {
    return { rootDir, files: [], entries: [] };
  }

  const files = await listJsonlFilesRecursive(rootDir);
  const entries = [];
  const normalizedFilters = normalizeFilters(filters);

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const storedEvent = JSON.parse(lines[index]);
      const labelRecord = storedEvent?.eventId ? labelsByEventId[storedEvent.eventId] ?? null : null;
      const summary = toSummary(storedEvent, { labelRecord, filePath, lineNumber: index + 1 });
      if (!matchesFilters(summary, normalizedFilters)) continue;
      const replayEvent = toReplayEvent(storedEvent);
      if (!replayEvent) continue;
      entries.push({
        eventId: storedEvent.eventId ?? null,
        label: labelRecord?.label ?? null,
        summary,
        replayEvent,
        sourceFile: filePath,
        lineNumber: index + 1,
      });
    }
  }

  return { rootDir, files, entries };
}

export function compareReplayEntries(entries, { baseVariant = 'stable_v1', candidateVariant = 'candidate_consistency_v2' } = {}) {
  const baseConfig = getScoringVariant(baseVariant);
  const candidateConfig = getScoringVariant(candidateVariant);

  const compareResults = entries.map((entry, index) => {
    const base = evaluateRisk(entry.replayEvent, { variant: baseConfig.id });
    const candidate = evaluateRisk(entry.replayEvent, { variant: candidateConfig.id });
    return {
      index,
      eventId: entry.eventId,
      label: entry.label,
      sourceFile: entry.sourceFile,
      lineNumber: entry.lineNumber,
      summary: entry.summary,
      scoreDelta: Math.round((candidate.totalRiskScore - base.totalRiskScore) * 100) / 100,
      base: {
        ...base,
        action: buildActionPolicy(base.level, { browserSupportLevel: base.browserSupportLevel }),
        sourceFile: entry.sourceFile,
        eventId: entry.eventId,
      },
      candidate: {
        ...candidate,
        action: buildActionPolicy(candidate.level, { browserSupportLevel: candidate.browserSupportLevel }),
        sourceFile: entry.sourceFile,
        eventId: entry.eventId,
      },
    };
  });

  return {
    variants: {
      base: baseConfig,
      candidate: candidateConfig,
      available: listScoringVariants(),
    },
    ...buildCompareSummary(compareResults, { baseVariant: baseConfig.id, candidateVariant: candidateConfig.id }),
  };
}

export async function compareStoredEvents({
  rootDir = getRiskEventsDir(),
  filters = {},
  baseVariant = 'stable_v1',
  candidateVariant = 'candidate_consistency_v2',
  labels = loadRiskLabels(),
} = {}) {
  const loaded = await loadStoredReplayEntries({ rootDir, filters, labelsByEventId: labels.byEventId });
  const comparison = compareReplayEntries(loaded.entries, { baseVariant, candidateVariant });
  return {
    rootDir: loaded.rootDir,
    scannedFiles: loaded.files.length,
    eventCount: loaded.entries.length,
    filters,
    labelsFile: labels.filePath,
    ...comparison,
  };
}
