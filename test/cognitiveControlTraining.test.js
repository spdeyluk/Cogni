import test from "node:test";
import assert from "node:assert/strict";
import {
  createCctConfig,
  createCctDigit,
  nextCctInterval,
  scoreCctAnswer
} from "../src/core/exercises/cognitiveControlTraining.js";

test("CCT digit generator creates digits 1 through 9", () => {
  assert.equal(createCctDigit(() => 0), 1);
  assert.equal(createCctDigit(() => 0.999), 9);
});

test("CCT scoring adds the current digit to the previous digit", () => {
  const correct = scoreCctAnswer(4, 8, "12", 600);
  const wrong = scoreCctAnswer(8, 2, "12", 700);

  assert.equal(correct.expected, 12);
  assert.equal(correct.correct, true);
  assert.equal(wrong.expected, 10);
  assert.equal(wrong.correct, false);
});

test("CCT adaptive interval speeds up after correct answers and slows after errors", () => {
  const config = createCctConfig({ minimumIntervalMs: 500, correctStepMs: 100, wrongStepMs: 250 });

  assert.equal(nextCctInterval(config, 3000, { correct: true }), 2900);
  assert.equal(nextCctInterval(config, 3000, { correct: false }), 3250);
  assert.equal(nextCctInterval(config, 520, { correct: true }), 500);
});
