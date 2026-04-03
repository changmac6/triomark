import { listAllRiskEventSummaries } from './review-store.js';
import { SUPPORTED_BASELINE_PROFILES } from './profile-policy.js';

function average(values) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function topEntries(map, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function createBucket() {
  return {
    total: 0,
    scores: [],
    browserScores: [],
    protocolScores: [],
    consistencyScores: [],
    levels: {},
    supportLevels: {},
    actions: {},
    guardrails: {},
    rules: {},
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function addSummaryToBucket(bucket, summary) {
  bucket.total += 1;
  bucket.scores.push(Number(summary.totalRiskScore) || 0);
  bucket.browserScores.push(Number(summary.browserScore) || 0);
  bucket.protocolScores.push(Number(summary.protocolScore) || 0);
  bucket.consistencyScores.push(Number(summary.consistencyScore) || 0);
  increment(bucket.levels, summary.level || 'unscored');
  increment(bucket.supportLevels, summary.browserSupportLevel || 'unknown');
  increment(bucket.actions, summary.action || 'allow');
  for (const guardrail of summary.guardrails || []) increment(bucket.guardrails, guardrail);
  for (const ruleId of summary.topRuleIds || []) increment(bucket.rules, ruleId);
}

function finalizeBucket(bucket) {
  return {
    total: bucket.total,
    scoreAvg: average(bucket.scores),
    scoreMin: bucket.scores.length ? Math.min(...bucket.scores) : 0,
    scoreMax: bucket.scores.length ? Math.max(...bucket.scores) : 0,
    browserScoreAvg: average(bucket.browserScores),
    protocolScoreAvg: average(bucket.protocolScores),
    consistencyScoreAvg: average(bucket.consistencyScores),
    levels: bucket.levels,
    supportLevels: bucket.supportLevels,
    actions: bucket.actions,
    topGuardrails: topEntries(bucket.guardrails, 8),
    topRules: topEntries(bucket.rules, 8),
  };
}

function createInitialProfileBuckets() {
  const buckets = {};
  for (const profile of SUPPORTED_BASELINE_PROFILES) {
    buckets[profile] = createBucket();
  }
  buckets.unknown = createBucket();
  return buckets;
}

function compactItem(summary) {
  return {
    eventId: summary.eventId,
    receivedAt: summary.receivedAt,
    providerId: summary.providerId,
    totalRiskScore: summary.totalRiskScore,
    browserScore: summary.browserScore,
    protocolScore: summary.protocolScore,
    consistencyScore: summary.consistencyScore,
    level: summary.level,
    browserSupportLevel: summary.browserSupportLevel,
    clientProfile: summary.clientProfile,
    serverProfile: summary.serverProfile,
    action: summary.action,
    label: summary.label,
    topRuleIds: summary.topRuleIds,
    guardrails: summary.guardrails,
  };
}

export async function buildReviewMetrics({ labelsByEventId = {}, filters = {}, recentLimit = 20 } = {}) {
  const dataset = await listAllRiskEventSummaries({ ...filters, labelsByEventId });
  const items = dataset.items;

  const overview = {
    total: items.length,
    scoreAvg: average(items.map((item) => Number(item.totalRiskScore) || 0)),
    scoreMin: items.length ? Math.min(...items.map((item) => Number(item.totalRiskScore) || 0)) : 0,
    scoreMax: items.length ? Math.max(...items.map((item) => Number(item.totalRiskScore) || 0)) : 0,
    browserScoreAvg: average(items.map((item) => Number(item.browserScore) || 0)),
    protocolScoreAvg: average(items.map((item) => Number(item.protocolScore) || 0)),
    consistencyScoreAvg: average(items.map((item) => Number(item.consistencyScore) || 0)),
  };

  const counts = {
    levels: {},
    supportLevels: {},
    actions: {},
    clientProfiles: {},
    serverProfiles: {},
    labels: {},
    guardrails: {},
    rules: {},
  };

  const byClientProfile = createInitialProfileBuckets();
  const byServerProfile = createInitialProfileBuckets();
  const falsePositives = [];
  const falseNegatives = [];

  for (const item of items) {
    increment(counts.levels, item.level || 'unscored');
    increment(counts.supportLevels, item.browserSupportLevel || 'unknown');
    increment(counts.actions, item.action || 'allow');
    increment(counts.clientProfiles, item.clientProfile || 'unknown');
    increment(counts.serverProfiles, item.serverProfile || 'unknown');
    if (item.label) increment(counts.labels, item.label);
    for (const guardrail of item.guardrails || []) increment(counts.guardrails, guardrail);
    for (const ruleId of item.topRuleIds || []) increment(counts.rules, ruleId);

    const clientProfile = item.clientProfile || 'unknown';
    const serverProfile = item.serverProfile || 'unknown';
    if (!byClientProfile[clientProfile]) byClientProfile[clientProfile] = createBucket();
    if (!byServerProfile[serverProfile]) byServerProfile[serverProfile] = createBucket();
    addSummaryToBucket(byClientProfile[clientProfile], item);
    addSummaryToBucket(byServerProfile[serverProfile], item);

    if (item.label === 'legit' && ['review', 'high_risk'].includes(item.level)) {
      falsePositives.push(compactItem(item));
    }
    if (item.label === 'abuse' && ['trusted', 'normal'].includes(item.level)) {
      falseNegatives.push(compactItem(item));
    }
  }

  const profileHotspots = Object.entries(byClientProfile)
    .map(([profile, bucket]) => ({ profile, ...finalizeBucket(bucket) }))
    .filter((bucket) => bucket.total > 0)
    .sort((a, b) => (b.total - a.total) || (a.profile.localeCompare(b.profile)));

  const serverHotspots = Object.entries(byServerProfile)
    .map(([profile, bucket]) => ({ profile, ...finalizeBucket(bucket) }))
    .filter((bucket) => bucket.total > 0)
    .sort((a, b) => (b.total - a.total) || (a.profile.localeCompare(b.profile)));

  return {
    rootDir: dataset.rootDir,
    scannedFiles: dataset.scannedFiles,
    scannedEvents: dataset.scannedEvents,
    filters,
    overview,
    counts: {
      levels: counts.levels,
      supportLevels: counts.supportLevels,
      actions: counts.actions,
      clientProfiles: counts.clientProfiles,
      serverProfiles: counts.serverProfiles,
      labels: counts.labels,
      topGuardrails: topEntries(counts.guardrails, 10),
      topRules: topEntries(counts.rules, 10),
    },
    profileHotspots,
    serverHotspots,
    falsePositiveCount: falsePositives.length,
    falseNegativeCount: falseNegatives.length,
    falsePositives: falsePositives.slice(0, 20),
    falseNegatives: falseNegatives.slice(0, 20),
    recent: items.slice(0, Math.max(1, Math.min(Number(recentLimit) || 20, 100))).map(compactItem),
  };
}
