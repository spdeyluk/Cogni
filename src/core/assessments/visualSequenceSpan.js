import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment } from "../scoring.js";

const SYMBOLS = ["circle", "square", "triangle", "diamond", "cross", "star", "hex", "ring"];

export function createVisualSequenceAssessmentConfig(overrides = {}) {
  return {
    id: "visual-sequence-span-v1",
    title: "Visual Sequence Span",
    domain: CognitiveDomain.WORKING_MEMORY,
    minTrials: 8,
    roundsPerSpan: 1,
    startSpan: 2,
    maxSpan: 14,
    consecutiveFailureLimit: 2,
    displayMs: 900,
    gapMs: 250,
    expectedMedianMs: 2400,
    ...overrides
  };
}

export function generateVisualSequenceTrials(config = createVisualSequenceAssessmentConfig(), random = Math.random) {
  const trials = [];
  let trialIndex = 0;

  for (let span = config.startSpan; span <= config.maxSpan; span += 1) {
    for (let round = 0; round < config.roundsPerSpan; round += 1) {
      trials.push({
        trialIndex,
        span,
        sequence: createSequence(span, random),
        domain: config.domain
      });
      trialIndex += 1;
    }
  }

  return trials;
}

export function scoreVisualSequenceAssessment(config, trialResults) {
  const correctTrials = trialResults.filter((trial) => trial.correct);
  const highestCorrectSpan = correctTrials.reduce((max, trial) => Math.max(max, trial.span), 0);
  const weighted = weightedAccuracy(trialResults);
  const reactionTimesMs = trialResults
    .map((trial) => trial.reactionTimeMs)
    .filter((value) => Number.isFinite(value));

  return {
    assessmentId: config.id,
    domain: config.domain,
    highestCorrectSpan,
    correctTrials: correctTrials.length,
    incorrectTrials: trialResults.length - correctTrials.length,
    rawAccuracy: trialResults.length > 0 ? Math.round((correctTrials.length / trialResults.length) * 100) / 100 : 0,
    weightedAccuracy: weighted.accuracy,
    ...scoreCriterionAssessment({
      correct: weighted.correct,
      total: weighted.total,
      difficultyRatio: highestCorrectSpan / config.maxSpan,
      reactionTimesMs,
      expectedMedianMs: config.expectedMedianMs
    })
  };
}

function createSequence(length, random) {
  return Array.from({ length }, () => SYMBOLS[Math.floor(random() * SYMBOLS.length)]);
}

function weightedAccuracy(trialResults) {
  const totals = trialResults.reduce((acc, trial) => {
    const weight = trial.span;
    acc.total += weight;
    if (trial.correct) acc.correct += weight;
    return acc;
  }, { correct: 0, total: 0 });

  return {
    ...totals,
    accuracy: totals.total > 0 ? Math.round((totals.correct / totals.total) * 100) / 100 : 0
  };
}
