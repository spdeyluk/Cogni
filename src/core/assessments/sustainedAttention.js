import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment, scoreSignalDetection } from "../scoring.js";

export function createSustainedAttentionAssessmentConfig(overrides = {}) {
  return {
    id: "sustained-attention-v1",
    title: "Sustained Attention",
    domain: CognitiveDomain.ATTENTION_CONTROL,
    minTrials: 36,
    trialCount: 36,
    noGoDigit: 3,
    digitDisplayMs: 200,
    symbolMs: 3000,
    gapMs: 0,
    mistakePauseMs: 3000,
    expectedMedianMs: 540,
    ...overrides
  };
}

export function generateSustainedAttentionTrials(config = createSustainedAttentionAssessmentConfig(), random = Math.random) {
  const digits = [];
  while (digits.length < config.trialCount) {
    digits.push(...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random));
  }

  return digits.slice(0, config.trialCount).map((digit, trialIndex) => ({
    trialIndex,
    digit,
    isTarget: digit !== config.noGoDigit,
    stimulus: String(digit),
    domain: config.domain
  }));
}

export function scoreSustainedAttentionAssessment(config, trialResults) {
  const counts = trialResults.reduce((acc, trial) => {
    if (trial.isTarget && trial.responded) acc.hits += 1;
    if (trial.isTarget && !trial.responded) acc.misses += 1;
    if (!trial.isTarget && trial.responded) acc.falseAlarms += 1;
    if (!trial.isTarget && !trial.responded) acc.correctRejections += 1;
    return acc;
  }, { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 });
  const correct = counts.hits + counts.correctRejections;
  const reactionTimesMs = trialResults
    .map((trial) => trial.reactionTimeMs)
    .filter((value) => Number.isFinite(value));

  const base = scoreCriterionAssessment({
    correct,
    total: trialResults.length,
    difficultyRatio: 1,
    reactionTimesMs,
    expectedMedianMs: config.expectedMedianMs,
    weights: {
      accuracy: 0.55,
      difficulty: 0.05,
      speed: 0.25,
      consistency: 0.15
    }
  });
  const errors = counts.misses + counts.falseAlarms;

  return {
    assessmentId: config.id,
    domain: config.domain,
    rule: `Respond to digits 1-9 except ${config.noGoDigit}.`,
    ...counts,
    ...scoreSignalDetection(counts),
    ...base,
    score: Math.max(0, base.score - errors * 9),
    errorPenalty: errors * 9
  };
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
