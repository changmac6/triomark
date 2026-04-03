import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), 'data', 'risk-events');
const MAX_EVENT_BYTES = 1024 * 1024 * 2;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toUtcDateString(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for storage partition');
  }
  return date.toISOString().slice(0, 10);
}

function validateStoredEventShape(event) {
  if (!isPlainObject(event)) {
    throw new Error('Stored risk event must be a plain object');
  }
  if (!event.schemaVersion) {
    throw new Error('Stored risk event missing schemaVersion');
  }
  if (!event.eventId) {
    throw new Error('Stored risk event missing eventId');
  }
  if (!event.receivedAt) {
    throw new Error('Stored risk event missing receivedAt');
  }
}

export function getRiskEventsDir() {
  return process.env.RISK_EVENTS_DIR
    ? path.resolve(process.env.RISK_EVENTS_DIR)
    : DEFAULT_STORAGE_ROOT;
}

export function getRiskEventFilePath(receivedAt) {
  const day = toUtcDateString(receivedAt);
  return path.join(getRiskEventsDir(), `${day}.jsonl`);
}

export async function ensureRiskStorageReady() {
  const dir = getRiskEventsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function serializeEvent(event) {
  validateStoredEventShape(event);
  const serialized = JSON.stringify(event);
  const size = Buffer.byteLength(serialized, 'utf8');

  if (size === 0) {
    throw new Error('Risk event serialization produced empty payload');
  }

  if (size > MAX_EVENT_BYTES) {
    throw new Error(`Risk event exceeds max size limit: ${size} bytes`);
  }

  return { serialized, size };
}

export async function appendRiskEvent(event) {
  const dir = await ensureRiskStorageReady();
  const filePath = getRiskEventFilePath(event.receivedAt);
  const { serialized, size } = serializeEvent(event);
  const line = `${serialized}\n`;

  await fs.appendFile(filePath, line, 'utf8');

  return {
    ok: true,
    dir,
    filePath,
    bytesWritten: Buffer.byteLength(line, 'utf8'),
    eventBytes: size,
  };
}

export async function appendRiskEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('appendRiskEvents requires a non-empty array');
  }

  await ensureRiskStorageReady();
  const grouped = new Map();

  for (const event of events) {
    const filePath = getRiskEventFilePath(event?.receivedAt);
    const { serialized } = serializeEvent(event);

    if (!grouped.has(filePath)) {
      grouped.set(filePath, []);
    }

    grouped.get(filePath).push(serialized);
  }

  const results = [];
  for (const [filePath, lines] of grouped.entries()) {
    const content = `${lines.join('\n')}\n`;
    await fs.appendFile(filePath, content, 'utf8');
    results.push({
      ok: true,
      filePath,
      eventCount: lines.length,
      bytesWritten: Buffer.byteLength(content, 'utf8'),
    });
  }

  return results;
}
