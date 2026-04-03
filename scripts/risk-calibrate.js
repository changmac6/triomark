import fs from 'node:fs';
import path from 'node:path';
import { evaluateRisk } from '../src/risk/scoring-engine.js';
import { buildActionPolicy } from '../src/risk/action-policy.js';
import { summarizeReplayResults } from '../src/risk/replay-analysis.js';
import { loadRiskLabels } from '../src/risk/label-store.js';

function usage() {
  console.error('Usage: npm run risk:calibrate -- [risk-events-dir]');
  process.exit(1);
}

function findJsonlFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJsonlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function readEvents(files) {
  const events = [];
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\n+/)) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      if (!entry?.client?.raw || !entry?.server?.raw) continue;
      events.push({
        sourceFile: filePath,
        eventId: entry.eventId ?? null,
        replayEvent: { client: entry.client, server: entry.server },
      });
    }
  }
  return events;
}

function buildProfileHotspots(summary) {
  const hotspots = [];
  for (const [profile, bucket] of Object.entries(summary.whitelistProfiles ?? {})) {
    if (!bucket || bucket.total === 0) continue;
    hotspots.push({
      profile,
      total: bucket.total,
      scoreAvg: bucket.scoreAvg,
      scoreMin: bucket.scoreMin,
      rawScoreAvg: bucket.rawScoreAvg,
      mostCommonRules: bucket.topRuleIds.slice(0, 5),
      mostCommonGuardrails: bucket.topGuardrails.slice(0, 5),
      reviewOrWorseCount: bucket.reviewOrWorseCandidates.length,
      lowScoreCount: bucket.lowScoreCandidates.length,
      reviewOrWorseCandidates: bucket.reviewOrWorseCandidates.slice(0, 5),
      lowScoreCandidates: bucket.lowScoreCandidates.slice(0, 5),
    });
  }

  hotspots.sort((a, b) => {
    if (b.reviewOrWorseCount !== a.reviewOrWorseCount) return b.reviewOrWorseCount - a.reviewOrWorseCount;
    if (b.lowScoreCount !== a.lowScoreCount) return b.lowScoreCount - a.lowScoreCount;
    if (a.scoreMin !== b.scoreMin) return a.scoreMin - b.scoreMin;
    return a.profile.localeCompare(b.profile);
  });

  return hotspots;
}

const rootDir = path.resolve(process.cwd(), process.argv[2] || path.join('data', 'risk-events'));
if (!fs.existsSync(rootDir)) usage();

const files = findJsonlFiles(rootDir);
const sourceEvents = readEvents(files);
const labels = loadRiskLabels();
const results = sourceEvents.map((item, index) => {
  const evaluation = evaluateRisk(item.replayEvent);
  const action = buildActionPolicy(evaluation.level, { browserSupportLevel: evaluation.browserSupportLevel });
  const eventId = item.eventId;
  return {
    index,
    sourceFile: item.sourceFile,
    eventId,
    label: eventId ? (labels.byEventId[eventId]?.label ?? null) : null,
    ...evaluation,
    action,
  };
});

const summary = summarizeReplayResults(results);

console.log(JSON.stringify({
  rootDir,
  labelsFile: labels.filePath,
  fileCount: files.length,
  eventCount: results.length,
  files,
  summary,
  profileHotspots: buildProfileHotspots(summary),
}, null, 2));
