import crypto from 'node:crypto';

export const REQUEST_SCHEMA_VERSION = 'risk-eval-request.v1';
export const RESPONSE_SCHEMA_VERSION = 'risk-eval-response.v1';
export const EVENT_SCHEMA_VERSION = 'risk-event.v1';
export const RISK_RULES_VERSION = 'risk-rules.v1';

const MAX_ID_LENGTH = 128;
const MAX_PATH_LENGTH = 512;
const MAX_TITLE_LENGTH = 256;
const MAX_ENTRY_POINT_LENGTH = 64;
const MAX_VERSION_LENGTH = 64;
const MAX_COLLECTOR_LENGTH = 32;
const MAX_COMPOSITE_LENGTH = 4096;

const ALLOWED_CHANNELS = new Set([
  'web_dm',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimToNull(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampString(value, maxLength) {
  const normalized = trimToNull(value);
  if (normalized == null) return null;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function ensureObject(value) {
  return isPlainObject(value) ? value : {};
}

function isIsoDateString(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
}

function makeError(code, message, field = null, status = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  error.status = status;
  error.details = details;
  return error;
}

function requireString(value, field, maxLength = MAX_ID_LENGTH) {
  const normalized = clampString(value, maxLength);
  if (!normalized) {
    throw makeError('INVALID_REQUEST', `Missing required field: ${field}`, field, 400);
  }
  return normalized;
}

function requireIsoDate(value, field) {
  const normalized = trimToNull(value);
  if (!normalized) {
    throw makeError('INVALID_REQUEST', `Missing required field: ${field}`, field, 400);
  }
  if (!isIsoDateString(normalized)) {
    throw makeError('INVALID_REQUEST', `Invalid ISO date field: ${field}`, field, 400);
  }
  return normalized;
}

function collectUnknownKeys(obj, allowedKeys, prefix, warnings) {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      warnings.push(`Ignored unknown field: ${prefix}.${key}`);
    }
  }
}

function stripForbiddenKeys(clientRoot, warnings) {
  if (!isPlainObject(clientRoot)) return clientRoot;

  const forbidden = ['server', 'unified'];
  for (const key of forbidden) {
    if (key in clientRoot) {
      delete clientRoot[key];
      warnings.push(`Ignored forbidden client field: client.${key}`);
    }
  }

  return clientRoot;
}

function normalizeProvider(input, warnings) {
  const obj = ensureObject(input);
  collectUnknownKeys(obj, new Set(['providerId', 'workspaceId', 'policyId']), 'provider', warnings);

  return {
    providerId: requireString(obj.providerId, 'provider.providerId'),
    workspaceId: clampString(obj.workspaceId, MAX_ID_LENGTH),
    policyId: clampString(obj.policyId, MAX_ID_LENGTH),
  };
}

function normalizeConversation(input, warnings) {
  const obj = ensureObject(input);
  collectUnknownKeys(obj, new Set(['conversationId', 'channel', 'threadId', 'isFirstMessage']), 'conversation', warnings);

  const channel = requireString(obj.channel, 'conversation.channel', 64);
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw makeError('INVALID_REQUEST', `Unsupported conversation.channel: ${channel}`, 'conversation.channel', 400);
  }

  return {
    conversationId: requireString(obj.conversationId, 'conversation.conversationId'),
    channel,
    threadId: clampString(obj.threadId, MAX_ID_LENGTH),
    isFirstMessage: typeof obj.isFirstMessage === 'boolean' ? obj.isFirstMessage : false,
  };
}

function normalizePage(input, warnings) {
  const obj = ensureObject(input);
  collectUnknownKeys(obj, new Set(['path', 'title', 'referrerPath']), 'page', warnings);

  return {
    path: clampString(obj.path, MAX_PATH_LENGTH),
    title: clampString(obj.title, MAX_TITLE_LENGTH),
    referrerPath: clampString(obj.referrerPath, MAX_PATH_LENGTH),
  };
}

function normalizeContext(input, warnings) {
  const obj = ensureObject(input);
  collectUnknownKeys(obj, new Set(['entryPoint', 'clientTs', 'uiVariant', 'sdkVersion']), 'context', warnings);

  const clientTs = trimToNull(obj.clientTs);
  if (clientTs != null && !isIsoDateString(clientTs)) {
    warnings.push('Ignored invalid ISO date field: context.clientTs');
  }

  return {
    entryPoint: clampString(obj.entryPoint, MAX_ENTRY_POINT_LENGTH),
    clientTs: isIsoDateString(clientTs) ? clientTs : null,
    uiVariant: clampString(obj.uiVariant, MAX_VERSION_LENGTH),
    sdkVersion: clampString(obj.sdkVersion, MAX_VERSION_LENGTH),
  };
}

function normalizeClientPayload(input, warnings) {
  const obj = ensureObject(input);
  collectUnknownKeys(obj, new Set(['collector', 'version', 'collectedAt', 'client', 'groupedComponents']), 'client', warnings);

  const collector = requireString(obj.collector, 'client.collector', MAX_COLLECTOR_LENGTH);
  const version = requireString(obj.version, 'client.version', MAX_VERSION_LENGTH);
  const collectedAt = requireIsoDate(obj.collectedAt, 'client.collectedAt');

  const clientObj = ensureObject(obj.client);
  stripForbiddenKeys(clientObj, warnings);

  collectUnknownKeys(
    clientObj,
    new Set([
      'composite',
      'stableComposite',
      'unstableComposite',
      'compositeHash',
      'stableCompositeHash',
      'unstableCompositeHash',
      'components',
    ]),
    'client.client',
    warnings
  );

  const composite = requireString(clientObj.composite, 'client.client.composite', MAX_COMPOSITE_LENGTH);
  const stableComposite = requireString(clientObj.stableComposite, 'client.client.stableComposite', MAX_COMPOSITE_LENGTH);
  const unstableComposite = clampString(clientObj.unstableComposite, MAX_COMPOSITE_LENGTH);

  const components = clientObj.components;
  if (!isPlainObject(components) || Object.keys(components).length === 0) {
    throw makeError(
      'INVALID_REQUEST',
      'Missing required field: client.client.components',
      'client.client.components',
      400
    );
  }

  const groupedComponents = isPlainObject(obj.groupedComponents) ? obj.groupedComponents : {};
  if (!isPlainObject(obj.groupedComponents) && obj.groupedComponents !== undefined) {
    warnings.push('Normalized invalid client.groupedComponents to empty object');
  }

  return {
    collector,
    version,
    collectedAt,
    client: {
      composite,
      stableComposite,
      unstableComposite,
      compositeHash: clampString(clientObj.compositeHash, 256),
      stableCompositeHash: clampString(clientObj.stableCompositeHash, 256),
      unstableCompositeHash: clampString(clientObj.unstableCompositeHash, 256),
      components,
    },
    groupedComponents,
    raw: obj,
  };
}

export function normalizeEvaluateRequest(body) {
  if (!isPlainObject(body)) {
    throw makeError('INVALID_JSON', 'Request body must be a JSON object', null, 400);
  }

  const warnings = [];
  collectUnknownKeys(
    body,
    new Set(['schemaVersion', 'provider', 'conversation', 'page', 'context', 'client']),
    'root',
    warnings
  );

  const schemaVersion = requireString(body.schemaVersion, 'schemaVersion', 64);
  if (schemaVersion !== REQUEST_SCHEMA_VERSION) {
    throw makeError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported schemaVersion: ${schemaVersion}`,
      'schemaVersion',
      400
    );
  }

  if ('eventId' in body) warnings.push('Ignored forbidden field: eventId');
  if ('scores' in body) warnings.push('Ignored forbidden field: scores');
  if ('action' in body) warnings.push('Ignored forbidden field: action');
  if ('derived' in body) warnings.push('Ignored forbidden field: derived');

  return {
    schemaVersion,
    provider: normalizeProvider(body.provider, warnings),
    conversation: normalizeConversation(body.conversation, warnings),
    page: normalizePage(body.page, warnings),
    context: normalizeContext(body.context, warnings),
    client: normalizeClientPayload(body.client, warnings),
    warnings,
  };
}

export function createEventId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(4).toString('hex');
  return `revt_${stamp}_${rand}`;
}

export function buildRiskEvent({
  normalizedRequest,
  serverSnapshot,
  evaluation,
  action,
  eventId,
  receivedAt,
}) {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId,
    receivedAt,
    provider: normalizedRequest.provider,
    conversation: normalizedRequest.conversation,
    page: normalizedRequest.page,
    context: normalizedRequest.context,
    client: {
      collector: normalizedRequest.client.collector,
      version: normalizedRequest.client.version,
      collectedAt: normalizedRequest.client.collectedAt,
      raw: normalizedRequest.client.raw,
      composite: normalizedRequest.client.client.composite,
      stableComposite: normalizedRequest.client.client.stableComposite,
      unstableComposite: normalizedRequest.client.client.unstableComposite,
      compositeHash: normalizedRequest.client.client.compositeHash,
      stableCompositeHash: normalizedRequest.client.client.stableCompositeHash,
      unstableCompositeHash: normalizedRequest.client.client.unstableCompositeHash,
      groupedComponents: normalizedRequest.client.groupedComponents,
    },
    server: {
      requestId: serverSnapshot?.requestId ?? null,
      timestamp: serverSnapshot?.timestamp ?? null,
      raw: serverSnapshot ?? {},
    },
    derived: {
      riskRulesVersion: evaluation?.version ?? RISK_RULES_VERSION,
      scoringVariant: evaluation?.scoringVariant ?? 'stable_v1',
      browserScore: evaluation?.browserScore ?? 0,
      protocolScore: evaluation?.protocolScore ?? 0,
      consistencyScore: evaluation?.consistencyScore ?? 0,
      totalRiskScore: evaluation?.totalRiskScore ?? 0,
      level: evaluation?.level ?? 'unscored',
      reasons: Array.isArray(evaluation?.reasons) ? evaluation.reasons : [],
      ruleHits: Array.isArray(evaluation?.ruleHits) ? evaluation.ruleHits : [],
      browserSupportLevel: evaluation?.browserSupportLevel ?? 'unknown',
      clientProfile: evaluation?.clientProfile ?? 'unknown',
      serverProfile: evaluation?.serverProfile ?? 'unknown',
      meta: evaluation?.meta ?? {},
    },
    action: {
      action: action?.action ?? 'allow',
      challengeRequired: action?.challengeRequired ?? false,
      challengeType: action?.challengeType ?? null,
      rateLimitProfile: action?.rateLimitProfile ?? 'default',
      providerVisibleWarning: action?.providerVisibleWarning ?? false,
    },
    meta: {
      storageVersion: 'jsonl.v1',
      normalizationWarnings: normalizedRequest.warnings,
    },
  };
}

export function buildEvaluateResponse({
  eventId,
  receivedAt,
  evaluation,
  action,
  warnings = [],
  diagnostics = {},
}) {
  return {
    ok: true,
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    eventId,
    receivedAt,
    scores: {
      browserScore: evaluation?.browserScore ?? 0,
      protocolScore: evaluation?.protocolScore ?? 0,
      consistencyScore: evaluation?.consistencyScore ?? 0,
      totalRiskScore: evaluation?.totalRiskScore ?? 0,
      level: evaluation?.level ?? 'unscored',
      reasons: Array.isArray(evaluation?.reasons) ? evaluation.reasons : [],
      ruleHits: Array.isArray(evaluation?.ruleHits) ? evaluation.ruleHits : [],
      version: evaluation?.version ?? RISK_RULES_VERSION,
      scoringVariant: evaluation?.scoringVariant ?? 'stable_v1',
      browserSupportLevel: evaluation?.browserSupportLevel ?? 'unknown',
      clientProfile: evaluation?.clientProfile ?? 'unknown',
      serverProfile: evaluation?.serverProfile ?? 'unknown',
    },
    action: {
      action: action?.action ?? 'allow',
      challengeRequired: action?.challengeRequired ?? false,
      challengeType: action?.challengeType ?? null,
      rateLimitProfile: action?.rateLimitProfile ?? 'default',
      providerVisibleWarning: action?.providerVisibleWarning ?? false,
    },
    diagnostics: {
      requestAccepted: true,
      normalized: true,
      warnings,
      ...diagnostics,
    },
  };
}

export function buildErrorResponse({
  code,
  message,
  field = null,
  details = null,
  status = 400,
}) {
  return {
    status,
    body: {
      ok: false,
      schemaVersion: RESPONSE_SCHEMA_VERSION,
      error: {
        code,
        message,
        field,
        details,
      },
    },
  };
}
