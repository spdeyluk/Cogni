import { CognitiveDomain } from "../domains.js";

export function createCctConfig(overrides = {}) {
  return {
    id: "cognitive-control-training-v1",
    title: "Cognitive Control Training",
    domain: CognitiveDomain.ATTENTION,
    durationSeconds: 300,
    startingIntervalMs: 3000,
    minimumIntervalMs: 500,
    adaptive: true,
    correctStepMs: 120,
    wrongStepMs: 220,
    speakDigits: true,
    showDigits: false,
    ...overrides
  };
}

export function createCctDigit(random = Math.random) {
  return Math.floor(random() * 9) + 1;
}

export function scoreCctAnswer(previousDigit, currentDigit, answer, reactionTimeMs = null) {
  const expected = previousDigit + currentDigit;
  const numericAnswer = Number(answer);
  const correct = numericAnswer === expected;
  return {
    previousDigit,
    currentDigit,
    expected,
    answer: Number.isFinite(numericAnswer) ? numericAnswer : null,
    correct,
    reactionTimeMs
  };
}

export function nextCctInterval(config, currentIntervalMs, result) {
  if (!config.adaptive || !result) return currentIntervalMs;
  if (result.correct) return Math.max(config.minimumIntervalMs, currentIntervalMs - config.correctStepMs);
  return Math.max(config.minimumIntervalMs, currentIntervalMs + config.wrongStepMs);
}
