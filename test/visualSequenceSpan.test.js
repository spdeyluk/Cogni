import test from "node:test";
import assert from "node:assert/strict";
import {
  createVisualSequenceAssessmentConfig,
  generateVisualSequenceTrials,
  scoreVisualSequenceAssessment
} from "../src/core/assessments/visualSequenceSpan.js";

test("visual sequence assessment generates configured spans", () => {
  const config = createVisualSequenceAssessmentConfig({
    startSpan: 3,
    maxSpan: 5,
    roundsPerSpan: 2
  });
  const trials = generateVisualSequenceTrials(config, () => 0.1);

  assert.equal(trials.length, 6);
  assert.deepEqual(trials.map((trial) => trial.span), [3, 3, 4, 4, 5, 5]);
});

test("visual sequence assessment records highest correct span", () => {
  const config = createVisualSequenceAssessmentConfig({ startSpan: 3, maxSpan: 5, roundsPerSpan: 1 });
  const trials = generateVisualSequenceTrials(config, () => 0.1);
  const results = trials.map((trial) => ({
    ...trial,
    correct: trial.span <= 4,
    reactionTimeMs: 1600
  }));

  const score = scoreVisualSequenceAssessment(config, results);

  assert.equal(score.highestCorrectSpan, 4);
  assert.equal(score.domain, "working-memory");
});

