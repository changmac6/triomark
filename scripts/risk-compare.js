import path from 'node:path';
import { loadRiskLabels } from '../src/risk/label-store.js';
import { compareStoredEvents, compareReplayEntries } from '../src/risk/rule-compare.js';
import { listScoringVariants } from '../src/risk/scoring-variants.js';
import fs from 'node:fs';

function parseArgs(argv) {
  const args = { base: 'stable_v1', candidate: 'candidate_consistency_v2', path: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') args.base = argv[++i];
    else if (token === '--candidate') args.candidate = argv[++i];
    else if (!args.path) args.path = token;
  }
  return args;
}

function readEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.jsonl')) {
    return raw.split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function toReplayEntry(entry, index) {
  if (entry?.client?.raw && entry?.server?.raw) {
    return {
      eventId: entry.eventId ?? null,
      label: null,
      summary: null,
      replayEvent: { client: entry.client, server: entry.server },
      sourceFile: null,
      lineNumber: index + 1,
    };
  }
  if (entry?.client && entry?.server) {
    return {
      eventId: entry.eventId ?? null,
      label: null,
      summary: null,
      replayEvent: entry,
      sourceFile: null,
      lineNumber: index + 1,
    };
  }
  throw new Error('Replay entry does not contain client/server payload');
}

const args = parseArgs(process.argv.slice(2));
const labels = loadRiskLabels();

if (args.path) {
  const resolved = path.resolve(process.cwd(), args.path);
  const entries = readEntries(resolved).map(toReplayEntry);
  const comparison = compareReplayEntries(entries, { baseVariant: args.base, candidateVariant: args.candidate });
  console.log(JSON.stringify({
    inputPath: resolved,
    labelsFile: labels.filePath,
    ...comparison,
  }, null, 2));
} else {
  const result = await compareStoredEvents({
    baseVariant: args.base,
    candidateVariant: args.candidate,
    labels,
  });
  console.log(JSON.stringify(result, null, 2));
}
