import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment, scoreSignalDetection } from "../scoring.js";

export function createGoNoGoAssessmentConfig(overrides = {}) {
  return {
    id: "go-no-go-v1",
    title: "Go/No-Go",
    domain: CognitiveDomain.ATTENTION_CONTROL,
    minTrials: 24,
    trialCount: 30,
    noGoProbability: 0.25,
    noGoHoldMs: 2500,
    gapMs: 800,
    expectedMedianMs: 520,
    ...overrides
  };
}

export function generateGoNoGoTrials(config = createGoNoGoAssessmentConfig(), random = Math.random) {
  return Array.from({ length: config.trialCount }, (_, trialIndex) => {
    const isNoGo = random() < config.noGoProbability;
    return {
      trialIndex,
      isTarget: !isNoGo,
      stimulus: isNoGo ? "NO-GO" : "GO",
      domain: config.domain
    };
  });
}

export function scoreGoNoGoAssessment(config, trialResults) {
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
    ...counts,
    ...scoreSignalDetection(counts),
    ...base,
    score: Math.max(0, base.score - errors * 10),
    errorPenalty: errors * 10
  };
}
