import test from "node:test";
import assert from "node:assert/strict";
import { createNBackConfig, generateNBackTrials, scoreNBackSession } from "../src/core/exercises/nBack.js";

test("N-back generator avoids accidental non-target matches", () => {
  const config = createNBackConfig({
    n: 2,
    trialCount: 20,
    targetProbability: 0,
    stimuli: ["A", "B", "C"]
  });
  const trials = generateNBackTrials(config, () => 0.4);

  for (let index = config.n; index < trials.length; index += 1) {
    assert.notEqual(trials[index].stimulus, trials[index - config.n].stimulus);
    assert.equal(trials[index].isTarget, false);
  }
});

test("N-back scorer counts hits and false alarms", () => {
  const score = scoreNBackSession([
    { isTarget: true, userResponded: true },
    { isTarget: true, userResponded: false },
    { isTarget: false, userResponded: true },
    { isTarget: false, userResponded: false }
  ]);

  assert.equal(score.hits, 1);
  assert.equal(score.misses, 1);
  assert.equal(score.falseAlarms, 1);
  assert.equal(score.correctRejections, 1);
  assert.equal(score.accuracy, 0.5);
});

