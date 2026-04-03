import fs from 'node:fs';
import path from 'node:path';
import { evaluateRisk } from '../src/risk/scoring-engine.js';
import { buildActionPolicy } from '../src/risk/action-policy.js';
import { buildEvaluationSummary } from '../src/risk/evaluation-summary.js';
import { summarizeReplayResults } from '../src/risk/replay-analysis.js';
import { loadRiskLabels } from '../src/risk/label-store.js';

function usage() {
  console.error('Usage: npm run risk:replay -- <path-to-json-or-jsonl> [all]');
  process.exit(1);
}

function readEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.jsonl')) {
    return raw.split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  return [parsed];
}

function toReplayEvent(entry) {
  if (entry?.client?.raw && entry?.server?.raw) {
    return { client: entry.client, server: entry.server };
  }
  if (entry?.client && entry?.server) {
    return entry;
  }
  throw new Error('Replay entry does not contain client/server raw payload');
}

const filePath = process.argv[2];
const mode = process.argv[3] ?? 'first';
if (!filePath) usage();

const resolved = path.resolve(process.cwd(), filePath);
const entries = readEntries(resolved);
const labels = loadRiskLabels();
const replayResults = entries.map((entry, index) => {
  const event = toReplayEvent(entry);
  const evaluation = evaluateRisk(event);
  const action = buildActionPolicy(evaluation.level, { browserSupportLevel: evaluation.browserSupportLevel });
  const eventId = entry.eventId ?? null;
  return {
    index,
    eventId,
    label: eventId ? (labels.byEventId[eventId]?.label ?? null) : null,
    ...evaluation,
    action,
    evaluationSummary: buildEvaluationSummary({ evaluation, event }),
  };
});

if (mode === 'all') {
  console.log(JSON.stringify({
    filePath: resolved,
    labelsFile: labels.filePath,
    summary: summarizeReplayResults(replayResults),
    results: replayResults,
  }, null, 2));
} else {
  console.log(JSON.stringify({
    filePath: resolved,
    labelsFile: labels.filePath,
    summary: summarizeReplayResults(replayResults),
    result: replayResults[0] ?? null,
  }, null, 2));
}
