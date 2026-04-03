export const DEFAULT_SCORING_VARIANT = 'stable_v1';

export const SCORING_VARIANTS = Object.freeze({
  stable_v1: Object.freeze({
    id: 'stable_v1',
    label: 'Stable v1',
    description: 'Current production-oriented scoring profile.',
    weights: Object.freeze({ browser: 0.4, protocol: 0.35, consistency: 0.25 }),
    guardrails: Object.freeze({
      unsupportedCap: 39,
      unknownCap: 59,
      criticalMismatchCap: 59,
      highConsistencyCap: 59,
      severeConsistencyCap: 39,
      highConsistencyScoreThreshold: 60,
      severeConsistencyScoreThreshold: 50,
      highConsistencyMinHits: 1,
      severeConsistencyMinHits: 2,
    }),
  }),
  candidate_consistency_v2: Object.freeze({
    id: 'candidate_consistency_v2',
    label: 'Candidate Consistency v2',
    description: 'Candidate profile that raises consistency weight and tightens mismatch caps.',
    weights: Object.freeze({ browser: 0.34, protocol: 0.28, consistency: 0.38 }),
    guardrails: Object.freeze({
      unsupportedCap: 29,
      unknownCap: 49,
      criticalMismatchCap: 39,
      highConsistencyCap: 49,
      severeConsistencyCap: 29,
      highConsistencyScoreThreshold: 65,
      severeConsistencyScoreThreshold: 55,
      highConsistencyMinHits: 1,
      severeConsistencyMinHits: 2,
    }),
  }),
});

export function listScoringVariants() {
  return Object.values(SCORING_VARIANTS).map((variant) => ({
    id: variant.id,
    label: variant.label,
    description: variant.description,
    weights: variant.weights,
    guardrails: variant.guardrails,
  }));
}

export function getScoringVariant(variantId = DEFAULT_SCORING_VARIANT) {
  return SCORING_VARIANTS[variantId] ?? SCORING_VARIANTS[DEFAULT_SCORING_VARIANT];
}
