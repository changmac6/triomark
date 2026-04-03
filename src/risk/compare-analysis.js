import { compactCandidate } from './replay-analysis.js';

function average(values) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function compareSeverityLevel(level) {
  switch (level) {
    case 'trusted': return 0;
    case 'normal': return 1;
    case 'review': return 2;
    case 'high_risk': return 3;
    default: return 1;
  }
}

function summarizeChangedItems(changedItems, limit = 50) {
  return changedItems
    .sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta) || compareSeverityLevel(b.candidate.level) - compareSeverityLevel(a.candidate.level))
    .slice(0, limit)
    .map((item) => ({
      eventId: item.eventId,
      label: item.label,
      scoreDelta: item.scoreDelta,
      levelTransition: `${item.base.level} -> ${item.candidate.level}`,
      actionTransition: `${item.base.action.action} -> ${item.candidate.action.action}`,
      supportTransition: `${item.base.browserSupportLevel} -> ${item.candidate.browserSupportLevel}`,
      clientProfile: item.base.clientProfile,
      serverProfile: item.base.serverProfile,
      base: compactCandidate(item.base),
      candidate: compactCandidate(item.candidate),
    }));
}

export function buildCompareSummary(compareResults, { baseVariant, candidateVariant }) {
  const summary = {
    baseVariant,
    candidateVariant,
    total: compareResults.length,
    scoreDeltaAvg: average(compareResults.map((item) => item.scoreDelta)),
    levelChanges: {},
    actionChanges: {},
    supportChanges: {},
    labeledFalsePositiveReduction: 0,
    labeledFalsePositiveIncrease: 0,
    labeledFalseNegativeReduction: 0,
    labeledFalseNegativeIncrease: 0,
  };

  const changedItems = [];
  const falsePositiveReduced = [];
  const falsePositiveWorse = [];
  const falseNegativeReduced = [];
  const falseNegativeWorse = [];

  for (const item of compareResults) {
    const levelTransition = `${item.base.level} -> ${item.candidate.level}`;
    const actionTransition = `${item.base.action.action} -> ${item.candidate.action.action}`;
    const supportTransition = `${item.base.browserSupportLevel} -> ${item.candidate.browserSupportLevel}`;

    if (item.base.level !== item.candidate.level) increment(summary.levelChanges, levelTransition);
    if (item.base.action.action !== item.candidate.action.action) increment(summary.actionChanges, actionTransition);
    if (item.base.browserSupportLevel !== item.candidate.browserSupportLevel) increment(summary.supportChanges, supportTransition);

    if (item.base.totalRiskScore !== item.candidate.totalRiskScore || item.base.level !== item.candidate.level || item.base.action.action !== item.candidate.action.action) {
      changedItems.push(item);
    }

    if (item.label === 'legit') {
      const baseFalsePositive = ['review', 'high_risk'].includes(item.base.level);
      const candidateFalsePositive = ['review', 'high_risk'].includes(item.candidate.level);
      if (baseFalsePositive && !candidateFalsePositive) falsePositiveReduced.push(item);
      if (!baseFalsePositive && candidateFalsePositive) falsePositiveWorse.push(item);
    }

    if (item.label === 'abuse') {
      const baseFalseNegative = ['trusted', 'normal'].includes(item.base.level);
      const candidateFalseNegative = ['trusted', 'normal'].includes(item.candidate.level);
      if (baseFalseNegative && !candidateFalseNegative) falseNegativeReduced.push(item);
      if (!baseFalseNegative && candidateFalseNegative) falseNegativeWorse.push(item);
    }
  }

  summary.labeledFalsePositiveReduction = falsePositiveReduced.length;
  summary.labeledFalsePositiveIncrease = falsePositiveWorse.length;
  summary.labeledFalseNegativeReduction = falseNegativeReduced.length;
  summary.labeledFalseNegativeIncrease = falseNegativeWorse.length;

  return {
    summary,
    changedItems: summarizeChangedItems(changedItems, 50),
    falsePositiveReduced: summarizeChangedItems(falsePositiveReduced, 20),
    falsePositiveWorse: summarizeChangedItems(falsePositiveWorse, 20),
    falseNegativeReduced: summarizeChangedItems(falseNegativeReduced, 20),
    falseNegativeWorse: summarizeChangedItems(falseNegativeWorse, 20),
  };
}
