import { SUPPORTED_BASELINE_PROFILES } from './profile-policy.js';

export function average(values) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function pushLimited(list, item, limit = 20) {
  if (list.length < limit) list.push(item);
}

function sortedTop(map, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, count]) => ({ id, count }));
}

function summarizeRuleHits(ruleHits = []) {
  const counts = {};
  const severeCounts = {};

  for (const hit of ruleHits) {
    if (!hit?.id) continue;
    increment(counts, hit.id);
    if (['critical', 'high'].includes(hit.severity)) {
      increment(severeCounts, hit.id);
    }
  }

  return {
    counts,
    severeCounts,
  };
}

function createProfileBucket() {
  return {
    total: 0,
    labels: {},
    scoreAvg: 0,
    scoreMin: 0,
    scoreMax: 0,
    rawScoreAvg: 0,
    rawScoreMin: 0,
    rawScoreMax: 0,
    levels: {},
    supportLevels: {},
    actions: {},
    guardrails: {},
    topRuleIds: [],
    topSevereRuleIds: [],
    topGuardrails: [],
    reviewOrWorseCandidates: [],
    lowScoreCandidates: [],
    labeledLegitReviewOrWorse: [],
    labeledAbuseAllowOrNormal: [],
  };
}

function updateProfileBucket(bucket, result) {
  bucket.total += 1;
  if (result.label) {
    increment(bucket.labels, result.label);
  }
  bucket._scores = bucket._scores ?? [];
  bucket._rawScores = bucket._rawScores ?? [];
  bucket._ruleCounts = bucket._ruleCounts ?? {};
  bucket._severeRuleCounts = bucket._severeRuleCounts ?? {};

  bucket._scores.push(result.totalRiskScore);
  bucket._rawScores.push(result.meta?.rawTotalRiskScore ?? result.totalRiskScore);

  increment(bucket.levels, result.level);
  increment(bucket.supportLevels, result.browserSupportLevel);
  increment(bucket.actions, result.action?.action ?? 'unknown');

  for (const guardrail of result.meta?.guardrails ?? []) {
    increment(bucket.guardrails, guardrail.id);
  }

  const ruleSummary = summarizeRuleHits(result.ruleHits);
  for (const [id, count] of Object.entries(ruleSummary.counts)) {
    increment(bucket._ruleCounts, id, count);
  }
  for (const [id, count] of Object.entries(ruleSummary.severeCounts)) {
    increment(bucket._severeRuleCounts, id, count);
  }
}

function finalizeProfileBucket(bucket) {
  const scores = bucket._scores ?? [];
  const rawScores = bucket._rawScores ?? [];

  bucket.scoreAvg = average(scores);
  bucket.scoreMin = scores.length ? Math.min(...scores) : 0;
  bucket.scoreMax = scores.length ? Math.max(...scores) : 0;
  bucket.rawScoreAvg = average(rawScores);
  bucket.rawScoreMin = rawScores.length ? Math.min(...rawScores) : 0;
  bucket.rawScoreMax = rawScores.length ? Math.max(...rawScores) : 0;
  bucket.topRuleIds = sortedTop(bucket._ruleCounts ?? {}, 10);
  bucket.topSevereRuleIds = sortedTop(bucket._severeRuleCounts ?? {}, 10);
  bucket.topGuardrails = sortedTop(bucket.guardrails ?? {}, 10);

  delete bucket._scores;
  delete bucket._rawScores;
  delete bucket._ruleCounts;
  delete bucket._severeRuleCounts;
  return bucket;
}

export function compactCandidate(result) {
  return {
    index: result.index,
    eventId: result.eventId,
    level: result.level,
    totalRiskScore: result.totalRiskScore,
    rawTotalRiskScore: result.meta?.rawTotalRiskScore ?? null,
    browserSupportLevel: result.browserSupportLevel,
    clientProfile: result.clientProfile,
    serverProfile: result.serverProfile,
    action: result.action?.action ?? null,
    topRuleIds: result.meta?.topRuleIds ?? [],
    guardrails: (result.meta?.guardrails ?? []).map((guardrail) => guardrail.id),
    sourceFile: result.sourceFile ?? null,
  };
}

function createWhitelistProfileBuckets() {
  const buckets = {};
  for (const profile of SUPPORTED_BASELINE_PROFILES) {
    buckets[profile] = createProfileBucket();
  }
  return buckets;
}

export function summarizeReplayResults(results) {
  const summary = {
    total: results.length,
    levels: {},
    supportLevels: {},
    clientProfiles: {},
    serverProfiles: {},
    guardrails: {},
    actions: {},
    scoreStats: {
      min: results.length ? Math.min(...results.map((result) => result.totalRiskScore)) : 0,
      max: results.length ? Math.max(...results.map((result) => result.totalRiskScore)) : 0,
      avg: average(results.map((result) => result.totalRiskScore)),
    },
    rawScoreStats: {
      min: results.length ? Math.min(...results.map((result) => result.meta?.rawTotalRiskScore ?? result.totalRiskScore)) : 0,
      max: results.length ? Math.max(...results.map((result) => result.meta?.rawTotalRiskScore ?? result.totalRiskScore)) : 0,
      avg: average(results.map((result) => result.meta?.rawTotalRiskScore ?? result.totalRiskScore)),
    },
    byClientProfile: {},
    byServerProfile: {},
    whitelistProfiles: createWhitelistProfileBuckets(),
    supportedReviewOrWorse: [],
    supportedLowScore: [],
    unsupportedTooHigh: [],
    unknownTooHigh: [],
    profileMismatchReviewOrWorse: [],
    labelStats: {
      labels: {},
      legitReviewOrWorse: [],
      abuseAllowOrNormal: [],
      needsReviewLabeled: [],
    },
  };

  for (const result of results) {
    increment(summary.levels, result.level);
    increment(summary.supportLevels, result.browserSupportLevel);
    increment(summary.clientProfiles, result.clientProfile);
    increment(summary.serverProfiles, result.serverProfile);
    increment(summary.actions, result.action?.action ?? 'unknown');
    if (result.label) {
      increment(summary.labelStats.labels, result.label);
    }

    for (const guardrail of result.meta?.guardrails ?? []) {
      increment(summary.guardrails, guardrail.id);
    }

    const clientProfileKey = result.clientProfile ?? 'unknown';
    const serverProfileKey = result.serverProfile ?? 'unknown';
    summary.byClientProfile[clientProfileKey] ??= createProfileBucket();
    summary.byServerProfile[serverProfileKey] ??= createProfileBucket();
    updateProfileBucket(summary.byClientProfile[clientProfileKey], result);
    updateProfileBucket(summary.byServerProfile[serverProfileKey], result);

    if (summary.whitelistProfiles[clientProfileKey]) {
      updateProfileBucket(summary.whitelistProfiles[clientProfileKey], result);
      if (['review', 'high_risk'].includes(result.level)) {
        pushLimited(summary.whitelistProfiles[clientProfileKey].reviewOrWorseCandidates, compactCandidate(result), 10);
      }
      if (result.totalRiskScore < 80) {
        pushLimited(summary.whitelistProfiles[clientProfileKey].lowScoreCandidates, compactCandidate(result), 10);
      }
      if (result.label === 'legit' && ['review', 'high_risk'].includes(result.level)) {
        pushLimited(summary.whitelistProfiles[clientProfileKey].labeledLegitReviewOrWorse, compactCandidate(result), 10);
      }
      if (result.label === 'abuse' && ['trusted', 'normal'].includes(result.level)) {
        pushLimited(summary.whitelistProfiles[clientProfileKey].labeledAbuseAllowOrNormal, compactCandidate(result), 10);
      }
    }

    const mismatch = result.clientProfile !== 'unknown' && result.serverProfile !== 'unknown' && result.clientProfile !== result.serverProfile;

    if (result.browserSupportLevel === 'supported' && ['review', 'high_risk'].includes(result.level)) {
      pushLimited(summary.supportedReviewOrWorse, compactCandidate(result));
    }

    if (result.browserSupportLevel === 'supported' && result.totalRiskScore < 80) {
      pushLimited(summary.supportedLowScore, compactCandidate(result));
    }

    if (result.browserSupportLevel === 'unsupported' && result.totalRiskScore > 39) {
      pushLimited(summary.unsupportedTooHigh, compactCandidate(result));
    }

    if (result.browserSupportLevel === 'unknown' && result.totalRiskScore > 59) {
      pushLimited(summary.unknownTooHigh, compactCandidate(result));
    }

    if (mismatch && ['review', 'high_risk'].includes(result.level)) {
      pushLimited(summary.profileMismatchReviewOrWorse, compactCandidate(result));
    }

    if (result.label === 'legit' && ['review', 'high_risk'].includes(result.level)) {
      pushLimited(summary.labelStats.legitReviewOrWorse, compactCandidate(result));
    }

    if (result.label === 'abuse' && ['trusted', 'normal'].includes(result.level)) {
      pushLimited(summary.labelStats.abuseAllowOrNormal, compactCandidate(result));
    }

    if (result.label === 'needs_review') {
      pushLimited(summary.labelStats.needsReviewLabeled, compactCandidate(result));
    }
  }

  for (const mapKey of ['byClientProfile', 'byServerProfile', 'whitelistProfiles']) {
    for (const [profile, bucket] of Object.entries(summary[mapKey])) {
      summary[mapKey][profile] = finalizeProfileBucket(bucket);
    }
  }

  return summary;
}
