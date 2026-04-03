import { getConsistencyRules } from './consistency-rules.js';

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value * 100) / 100;
}

export function evaluateConsistencyScore(event) {
  const rules = getConsistencyRules();
  const hits = [];
  let score = 100;

  for (const rule of rules) {
    const result = rule(event);
    if (!result || result.matched !== true) continue;
    hits.push(result);
    score += Number(result.delta ?? 0);
  }

  score = clampScore(score);
  return {
    name: 'consistency',
    score,
    reasons: hits.map((hit) => hit.reason),
    ruleHits: hits,
    scored: true,
  };
}
