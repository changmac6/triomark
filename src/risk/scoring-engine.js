import { RISK_RULES_VERSION } from './schema.js';
import { normalizeScore, scoreToLevel, RISK_LEVELS } from './levels.js';
import { evaluateBrowserScore } from './browser-score.js';
import { evaluateProtocolScore } from './protocol-score.js';
import { evaluateConsistencyScore } from './consistency-score.js';
import { DEFAULT_SCORING_VARIANT, getScoringVariant } from './scoring-variants.js';
import {
  detectSupportedBrowserPolicy,
  detectClientProfile,
  detectServerProfile,
  topRuleIds,
} from './signal-utils.js';


function round2(value) {
  return Math.round(value * 100) / 100;
}

export function computeWeightedTotal({
  browserScore,
  protocolScore,
  consistencyScore,
  browserScored = true,
  protocolScored = true,
  consistencyScored = true,
  weights,
}) {
  const weightedParts = [];
  if (browserScored) weightedParts.push({ weight: weights.browser, score: normalizeScore(browserScore) });
  if (protocolScored) weightedParts.push({ weight: weights.protocol, score: normalizeScore(protocolScore) });
  if (consistencyScored) weightedParts.push({ weight: weights.consistency, score: normalizeScore(consistencyScore) });
  if (weightedParts.length === 0) return 0;
  const totalWeight = weightedParts.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  const total = weightedParts.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
  return round2(total);
}

function mergeReasons(...groups) {
  return groups.flat().filter((v) => typeof v === 'string' && v.trim().length > 0);
}

function mergeRuleHits(...groups) {
  return groups.flat().filter((v) => v && typeof v === 'object');
}

function applyGuardrails(totalRiskScore, consistency, supportPolicy, guardrailConfig) {
  const guardrails = [];
  let guardedScore = totalRiskScore;
  const severeConsistencyHits = consistency.ruleHits.filter((hit) => ['critical', 'high'].includes(hit.severity));

  if (supportPolicy.level === 'unsupported' && guardedScore > guardrailConfig.unsupportedCap) {
    guardedScore = guardrailConfig.unsupportedCap;
    guardrails.push({
      id: 'G001',
      reason: 'Unsupported browser policy cap',
      cap: guardrailConfig.severeConsistencyCap,
    });
  } else if (supportPolicy.level === 'unknown' && guardedScore > guardrailConfig.unknownCap) {
    guardedScore = guardrailConfig.unknownCap;
    guardrails.push({
      id: 'G002',
      reason: 'Unknown browser policy cap',
      cap: guardrailConfig.unknownCap,
    });
  }

  const criticalMismatch = consistency.ruleHits.some((hit) => hit.id === 'C000' && hit.severity === 'critical');

  if (criticalMismatch && guardedScore > guardrailConfig.criticalMismatchCap) {
    guardedScore = guardrailConfig.criticalMismatchCap;
    guardrails.push({
      id: 'G003',
      reason: 'Critical client/server profile mismatch cap',
      cap: guardrailConfig.criticalMismatchCap,
    });
  }

  if (consistency.scored && consistency.score < guardrailConfig.severeConsistencyScoreThreshold && severeConsistencyHits.length >= guardrailConfig.severeConsistencyMinHits && guardedScore > guardrailConfig.severeConsistencyCap) {
    guardedScore = guardrailConfig.severeConsistencyCap;
    guardrails.push({
      id: 'G004',
      reason: 'Critical consistency conflict cap',
      cap: guardrailConfig.severeConsistencyCap,
      severeConsistencyHits: severeConsistencyHits.map((hit) => hit.id),
    });
  } else if (consistency.scored && consistency.score < guardrailConfig.highConsistencyScoreThreshold && severeConsistencyHits.length >= guardrailConfig.highConsistencyMinHits && guardedScore > guardrailConfig.highConsistencyCap) {
    guardedScore = guardrailConfig.highConsistencyCap;
    guardrails.push({
      id: 'G005',
      reason: 'High consistency conflict cap',
      cap: guardrailConfig.highConsistencyCap,
      severeConsistencyHits: severeConsistencyHits.map((hit) => hit.id),
    });
  }

  return {
    totalRiskScore: round2(guardedScore),
    guardrails,
  };
}

export function evaluateRisk(event, options = {}) {
  const variant = getScoringVariant(options.variant ?? DEFAULT_SCORING_VARIANT);
  const browser = evaluateBrowserScore(event, { ...options, variant });
  const protocol = evaluateProtocolScore(event, { ...options, variant });
  const consistency = evaluateConsistencyScore(event, { ...options, variant });
  const anyScored = Boolean(browser.scored || protocol.scored || consistency.scored);

  const browserScore = normalizeScore(browser.score);
  const protocolScore = normalizeScore(protocol.score);
  const consistencyScore = normalizeScore(consistency.score);

  const rawTotalRiskScore = anyScored
    ? computeWeightedTotal({
        browserScore,
        protocolScore,
        consistencyScore,
        browserScored: browser.scored,
        protocolScored: protocol.scored,
        consistencyScored: consistency.scored,
        weights: variant.weights,
      })
    : 0;

  const supportPolicy = detectSupportedBrowserPolicy(event);
  const guardrailResult = applyGuardrails(rawTotalRiskScore, consistency, supportPolicy, variant.guardrails);
  const totalRiskScore = guardrailResult.totalRiskScore;

  const level = anyScored ? scoreToLevel(totalRiskScore, { scored: true }) : RISK_LEVELS.UNSCORED;
  const reasons = anyScored ? mergeReasons(browser.reasons, protocol.reasons, consistency.reasons) : ['Scoring rules not enabled yet'];
  const ruleHits = anyScored ? mergeRuleHits(browser.ruleHits, protocol.ruleHits, consistency.ruleHits) : [];

  return {
    browserScore,
    protocolScore,
    consistencyScore,
    totalRiskScore,
    level,
    reasons,
    ruleHits,
    version: RISK_RULES_VERSION,
    scoringVariant: variant.id,
    browserSupportLevel: supportPolicy.level,
    clientProfile: detectClientProfile(event),
    serverProfile: detectServerProfile(event),
    meta: {
      scored: anyScored,
      weights: variant.weights,
      guardrailConfig: variant.guardrails,
      rawTotalRiskScore,
      guardrails: guardrailResult.guardrails,
      ruleHitCounts: {
        browser: browser.ruleHits.length,
        protocol: protocol.ruleHits.length,
        consistency: consistency.ruleHits.length,
      },
      topRuleIds: topRuleIds(ruleHits, 8),
    },
  };
}
