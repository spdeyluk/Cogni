import test from "node:test";
import assert from "node:assert/strict";
import {
  createOperationSpanAssessmentConfig,
  generateOperationSpanTrials,
  scoreOperationSpanAssessment
} from "../src/core/assessments/operationSpan.js";

test("operation span generates memory items and operations", () => {
  const config = createOperationSpanAssessmentConfig({
    startSetSize: 2,
    maxSetSize: 3,
    roundsPerSetSize: 1
  });
  const trials = generateOperationSpanTrials(config, () => 0.5);

  assert.equal(trials.length, 2);
  assert.equal(trials[0].memoryItems.length, 2);
  assert.equal(trials[0].operations.length, 2);
  assert.match(trials[0].operations[0].prompt, /\d \+ \d = \d/);
});

test("operation span scores memory and operation accuracy separately", () => {
  const config = createOperationSpanAssessmentConfig({ startSetSize: 2, maxSetSize: 2, roundsPerSetSize: 1 });
  const trial = {
    trialIndex: 0,
    setSize: 2,
    memoryItems: ["K", "M"],
    recalledItems: ["K", "R"],
    operations: [
      { prompt: "2 + 2 = 4", isCorrect: true },
      { prompt: "3 + 2 = 6", isCorrect: false }
    ],
    operationResponses: [true, false],
    reactionTimesMs: [1100, 1200, 1800]
  };

  const score = scoreOperationSpanAssessment(config, [trial]);

  assert.equal(score.memoryAccuracy, 0.5);
  assert.equal(score.operationAccuracy, 1);
});

