import test from "node:test";
import assert from "node:assert/strict";
import {
  generateBetaSubtestTrials,
  getBetaSubtestDefinition,
  scoreBetaSubtest
} from "../src/core/assessments/betaSubtests.js";

test("beta subtest definitions exist for remaining domains", () => {
  assert.equal(getBetaSubtestDefinition("matrix-reasoning").title, "Matrix Reasoning");
  assert.equal(getBetaSubtestDefinition("mental-rotation").title, "Mental Rotation");
  assert.equal(getBetaSubtestDefinition("symbol-match").title, "Symbol Match");
  assert.equal(getBetaSubtestDefinition("word-list-recall").title, "Word List Recall");
});

test("beta choice subtests generate scored trials", () => {
  const trials = generateBetaSubtestTrials("matrix-reasoning");

  assert.equal(trials.length, 10);
  assert.equal(trials[0].kind, "choice");
  assert.ok(trials[0].options.includes(trials[0].answer));
});

test("beta speed subtests generate more trials", () => {
  const trials = generateBetaSubtestTrials("symbol-match", () => 0.9);

  assert.equal(trials.length, 12);
  assert.equal(trials[0].domain, "processing-speed");
});

test("beta memory subtests include study items and recognition trials", () => {
  const trials = generateBetaSubtestTrials("word-list-recall", () => 0.1);

  assert.equal(trials.length, 8);
  assert.ok(trials[0].studyItems.length > 0);
});

test("visual pair memory uses visual pair foils instead of word foils", () => {
  const trials = generateBetaSubtestTrials("visual-pair-memory", () => 0.1);

  assert.equal(trials.length, 10);
  assert.equal(trials[0].kind, "pair-memory");
  assert.ok(trials.every((trial) => trial.pair.shape && trial.pair.color));
  assert.match(trials[0].prompt, /shape-color pair/);
});

test("beta subtest scoring returns criterion score", () => {
  const trials = generateBetaSubtestTrials("matrix-reasoning");
  const score = scoreBetaSubtest("matrix-reasoning", trials.map((trial) => ({
    ...trial,
    response: trial.answer,
    correct: true,
    reactionTimeMs: 1000
  })));

  assert.equal(score.domain, "reasoning");
  assert.ok(score.score > 80);
});
