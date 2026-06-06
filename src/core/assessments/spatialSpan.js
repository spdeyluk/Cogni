import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment } from "../scoring.js";

export function createSpatialSpanAssessmentConfig(overrides = {}) {
  return {
    id: "spatial-span-v1",
    title: "Spatial Span",
    domain: CognitiveDomain.WORKING_MEMORY,
    minTrials: 8,
    gridSize: 3,
    roundsPerSpan: 1,
    startSpan: 2,
    maxSpan: 9,
    displayMs: 850,
    gapMs: 250,
    expectedMedianMs: 2600,
    ...overrides
  };
}

export function generateSpatialSpanTrials(config = createSpatialSpanAssessmentConfig(), random = Math.random) {
  const trials = [];
  let trialIndex = 0;

  for (let span = config.startSpan; span <= config.maxSpan; span += 1) {
    for (let round = 0; round < config.roundsPerSpan; round += 1) {
      trials.push({
        trialIndex,
        span,
        gridSize: config.gridSize,
        sequence: createCellSequence(span, config.gridSize, random),
        domain: config.domain
      });
      trialIndex += 1;
    }
  }

  return trials;
}

export function scoreSpatialSpanAssessment(config, trialResults) {
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

export function sequencesMatch(expected, actual) {
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
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

function createCellSequence(length, gridSize, random) {
  const cellCount = gridSize * gridSize;
  const sequence = [];

  while (sequence.length < length) {
    let cell = Math.floor(random() * cellCount);
    if (sequence.at(-1) === cell) {
      cell = (cell + 1) % cellCount;
    }
    sequence.push(cell);
  }

  return sequence;
}
