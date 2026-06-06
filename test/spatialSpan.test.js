import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpatialSpanAssessmentConfig,
  generateSpatialSpanTrials,
  scoreSpatialSpanAssessment,
  sequencesMatch
} from "../src/core/assessments/spatialSpan.js";

test("spatial span generates configured grid sequences", () => {
  const config = createSpatialSpanAssessmentConfig({
    startSpan: 3,
    maxSpan: 4,
    roundsPerSpan: 1,
    gridSize: 3
  });
  const trials = generateSpatialSpanTrials(config, () => 0.25);

  assert.equal(trials.length, 2);
  assert.equal(trials[0].sequence.length, 3);
  assert.equal(trials[1].sequence.length, 4);
  assert.ok(trials[0].sequence.every((cell) => cell >= 0 && cell < 9));
});

test("spatial span scores highest correct span", () => {
  const config = createSpatialSpanAssessmentConfig({ startSpan: 3, maxSpan: 5, roundsPerSpan: 1 });
  const trials = generateSpatialSpanTrials(config, () => 0.25);
  const results = trials.map((trial) => ({
    ...trial,
    correct: trial.span <= 4,
    reactionTimeMs: 1800
  }));

  const score = scoreSpatialSpanAssessment(config, results);

  assert.equal(score.highestCorrectSpan, 4);
  assert.equal(score.domain, "working-memory");
});

test("spatial span sequence matching checks exact order", () => {
  assert.equal(sequencesMatch([1, 2, 3], [1, 2, 3]), true);
  assert.equal(sequencesMatch([1, 2, 3], [1, 3, 2]), false);
});

