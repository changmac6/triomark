export const RISK_LEVELS = Object.freeze({
  UNSCORED: 'unscored',
  TRUSTED: 'trusted',
  NORMAL: 'normal',
  REVIEW: 'review',
  HIGH_RISK: 'high_risk',
});

export function normalizeScore(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num * 100) / 100;
}

export function scoreToLevel(score, { scored = true } = {}) {
  if (!scored) {
    return RISK_LEVELS.UNSCORED;
  }

  const normalized = normalizeScore(score);
  if (normalized >= 80) return RISK_LEVELS.TRUSTED;
  if (normalized >= 60) return RISK_LEVELS.NORMAL;
  if (normalized >= 40) return RISK_LEVELS.REVIEW;
  return RISK_LEVELS.HIGH_RISK;
}
