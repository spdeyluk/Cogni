import test from "node:test";
import assert from "node:assert/strict";
import { scoreCriterionAssessment, scoreSignalDetection, progressScore } from "../src/core/scoring.js";

test("criterion assessment scoring rewards accuracy and difficulty", () => {
  const low = scoreCriterionAssessment({
    correct: 4,
    total: 10,
    difficultyRatio: 0.4,
    reactionTimesMs: [1800, 1900, 1750, 2000],
    expectedMedianMs: 1800
  });

  const high = scoreCriterionAssessment({
    correct: 9,
    total: 10,
    difficultyRatio: 0.8,
    reactionTimesMs: [1450, 1500, 1475, 1550],
    expectedMedianMs: 1800
  });

  assert.ok(high.score > low.score);
  assert.equal(high.kind, "criterion");
});

test("signal detection scoring produces higher d-prime for cleaner N-back performance", () => {
  const weak = scoreSignalDetection({
    hits: 4,
    misses: 4,
    falseAlarms: 5,
    correctRejections: 11
  });

  const strong = scoreSignalDetection({
    hits: 7,
    misses: 1,
    falseAlarms: 1,
    correctRejections: 15
  });

  assert.ok(strong.dPrime > weak.dPrime);
});

test("progress score compares current performance to baseline", () => {
  assert.equal(progressScore({ baselineAverage: 62.5, currentAverage: 70.25 }), 7.75);
});

