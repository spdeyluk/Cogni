import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment } from "../scoring.js";

export function createFlankerAssessmentConfig(overrides = {}) {
  return {
    id: "flanker-task-v1",
    title: "Flanker Task",
    domain: CognitiveDomain.ATTENTION_CONTROL,
    minTrials: 24,
    trialCount: 30,
    incongruentProbability: 0.45,
    expectedMedianMs: 760,
    ...overrides
  };
}

export function generateFlankerTrials(config = createFlankerAssessmentConfig(), random = Math.random) {
  return Array.from({ length: config.trialCount }, (_, trialIndex) => {
    const targetDirection = random() < 0.5 ? "left" : "right";
    const incongruent = random() < config.incongruentProbability;
    const flankerDirection = incongruent ? opposite(targetDirection) : targetDirection;
    return {
      trialIndex,
      targetDirection,
      flankerDirection,
      incongruent,
      stimulus: buildArrowStimulus(flankerDirection, targetDirection),
      domain: config.domain
    };
  });
}

export function scoreFlankerAssessment(config, trialResults) {
  const correctTrials = trialResults.filter((trial) => trial.response === trial.targetDirection);
  const reactionTimesMs = trialResults
    .filter((trial) => trial.response === trial.targetDirection)
    .map((trial) => trial.reactionTimeMs)
    .filter((value) => Number.isFinite(value));
  const congruentRt = meanCorrectRt(trialResults.filter((trial) => !trial.incongruent));
  const incongruentRt = meanCorrectRt(trialResults.filter((trial) => trial.incongruent));

  const base = scoreCriterionAssessment({
    correct: correctTrials.length,
    total: trialResults.length,
    difficultyRatio: correctTrials.filter((trial) => trial.incongruent).length / Math.max(1, trialResults.filter((trial) => trial.incongruent).length),
    reactionTimesMs,
    expectedMedianMs: config.expectedMedianMs,
    weights: {
      accuracy: 0.5,
      difficulty: 0.1,
      speed: 0.25,
      consistency: 0.15
    }
  });
  const errors = trialResults.length - correctTrials.length;

  return {
    assessmentId: config.id,
    domain: config.domain,
    correctTrials: correctTrials.length,
    incorrectTrials: trialResults.length - correctTrials.length,
    interferenceMs: Math.round(Math.max(0, incongruentRt - congruentRt)),
    ...base,
    score: Math.max(0, base.score - errors * 8),
    errorPenalty: errors * 8
  };
}

function buildArrowStimulus(flankerDirection, targetDirection) {
  const flank = flankerDirection === "left" ? "<" : ">";
  const target = targetDirection === "left" ? "<" : ">";
  return `${flank} ${flank} ${target} ${flank} ${flank}`;
}

function opposite(direction) {
  return direction === "left" ? "right" : "left";
}

function meanCorrectRt(trials) {
  const rts = trials
    .filter((trial) => trial.response === trial.targetDirection)
    .map((trial) => trial.reactionTimeMs)
    .filter((value) => Number.isFinite(value));
  if (!rts.length) return 0;
  return rts.reduce((sum, value) => sum + value, 0) / rts.length;
}
