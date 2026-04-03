import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LABELS_FILE = path.resolve(process.cwd(), 'data', 'risk-labels.jsonl');
export const ALLOWED_RISK_LABELS = new Set(['legit', 'abuse', 'needs_review']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function getRiskLabelsFile() {
  return process.env.RISK_LABELS_FILE
    ? path.resolve(process.env.RISK_LABELS_FILE)
    : DEFAULT_LABELS_FILE;
}

export function normalizeRiskLabel(label) {
  const normalized = String(label ?? '').trim().toLowerCase();
  if (!ALLOWED_RISK_LABELS.has(normalized)) {
    throw new Error(`Unsupported risk label: ${label}`);
  }
  return normalized;
}

export function appendRiskLabel({ eventId, label, reviewer = null, notes = null, sourceFile = null, metadata = null }) {
  const normalizedEventId = String(eventId ?? '').trim();
  if (!normalizedEventId) {
    throw new Error('Missing required label field: eventId');
  }

  const normalizedLabel = normalizeRiskLabel(label);
  const record = {
    eventId: normalizedEventId,
    label: normalizedLabel,
    reviewedAt: new Date().toISOString(),
    reviewer: reviewer ? String(reviewer).trim() : null,
    notes: notes ? String(notes).trim() : null,
    sourceFile: sourceFile ? String(sourceFile).trim() : null,
    metadata: isPlainObject(metadata) ? metadata : null,
  };

  const filePath = getRiskLabelsFile();
  ensureDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');

  return { filePath, record };
}

export function loadRiskLabels(filePath = getRiskLabelsFile()) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      records: [],
      byEventId: {},
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const records = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const byEventId = {};
  for (const record of records) {
    if (!record?.eventId) continue;
    const current = byEventId[record.eventId];
    if (!current) {
      byEventId[record.eventId] = record;
      continue;
    }
    const currentTime = Date.parse(current.reviewedAt ?? 0);
    const nextTime = Date.parse(record.reviewedAt ?? 0);
    if (Number.isNaN(currentTime) || (!Number.isNaN(nextTime) && nextTime >= currentTime)) {
      byEventId[record.eventId] = record;
    }
  }

  return {
    filePath,
    records,
    byEventId,
  };
}
