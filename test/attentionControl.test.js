import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoNoGoAssessmentConfig,
  generateGoNoGoTrials,
  scoreGoNoGoAssessment
} from "../src/core/assessments/goNoGo.js";
import {
  createFlankerAssessmentConfig,
  generateFlankerTrials,
  scoreFlankerAssessment
} from "../src/core/assessments/flankerTask.js";
import {
  createSustainedAttentionAssessmentConfig,
  generateSustainedAttentionTrials,
  scoreSustainedAttentionAssessment
} from "../src/core/assessments/sustainedAttention.js";
import { scoreAttentionControlBattery } from "../src/core/assessments/domainScoring.js";

test("go/no-go generates go and no-go trials", () => {
  const config = createGoNoGoAssessmentConfig({ trialCount: 4, noGoProbability: 0.5 });
  const values = [0.1, 0.9, 0.1, 0.9];
  const trials = generateGoNoGoTrials(config, () => values.shift());

  assert.deepEqual(trials.map((trial) => trial.isTarget), [false, true, false, true]);
});

test("go/no-go scoring counts inhibition errors", () => {
  const config = createGoNoGoAssessmentConfig({ trialCount: 4 });
  const score = scoreGoNoGoAssessment(config, [
    { isTarget: true, responded: true, reactionTimeMs: 400 },
    { isTarget: true, responded: false, reactionTimeMs: null },
    { isTarget: false, responded: true, reactionTimeMs: 430 },
    { isTarget: false, responded: false, reactionTimeMs: null }
  ]);

  assert.equal(score.hits, 1);
  assert.equal(score.falseAlarms, 1);
});

test("flanker generator builds congruent and incongruent arrow trials", () => {
  const config = createFlankerAssessmentConfig({ trialCount: 2, incongruentProbability: 0.5 });
  const values = [0.1, 0.1, 0.9, 0.9];
  const trials = generateFlankerTrials(config, () => values.shift());

  assert.equal(trials[0].incongruent, true);
  assert.equal(trials[1].incongruent, false);
});

test("flanker scoring rewards correct center-arrow responses", () => {
  const config = createFlankerAssessmentConfig({ trialCount: 2 });
  const score = scoreFlankerAssessment(config, [
    { targetDirection: "left", response: "left", incongruent: false, reactionTimeMs: 600 },
    { targetDirection: "right", response: "left", incongruent: true, reactionTimeMs: 800 }
  ]);

  assert.equal(score.correctTrials, 1);
  assert.equal(score.incorrectTrials, 1);
});

test("sustained attention generator balances digits across blocks", () => {
  const config = createSustainedAttentionAssessmentConfig({ trialCount: 9 });
  const trials = generateSustainedAttentionTrials(config, () => 0);
  const digits = trials.map((trial) => trial.digit).sort((a, b) => a - b);

  assert.deepEqual(digits, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(trials.filter((trial) => !trial.isTarget).length, 1);
});

test("sustained attention scoring treats digit 3 as no-go", () => {
  const config = createSustainedAttentionAssessmentConfig({ trialCount: 2 });
  const score = scoreSustainedAttentionAssessment(config, [
    { digit: 4, isTarget: true, responded: true, reactionTimeMs: 420 },
    { digit: 3, isTarget: false, responded: false, reactionTimeMs: null }
  ]);

  assert.equal(score.hits, 1);
  assert.equal(score.correctRejections, 1);
});

test("attention control battery combines the three subtests", () => {
  const score = scoreAttentionControlBattery({
    goNoGo: { score: 80 },
    flankerTask: { score: 70 },
    sustainedAttention: { score: 60 }
  });

  assert.equal(score.domain, "attention-control");
  assert.equal(score.score, 70);
});
