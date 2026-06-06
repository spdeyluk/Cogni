import test from "node:test";
import assert from "node:assert/strict";
import { createQuadNBackConfig, generateQuadNBackTrials, scoreQuadNBackSession } from "../src/core/exercises/quadNBack.js";

test("quad n-back generator creates cues for every modality", () => {
  const config = createQuadNBackConfig({ trialCount: 12, n: 2 });
  const trials = generateQuadNBackTrials(config, () => 0.9);

  assert.equal(trials.length, 12);
  assert.ok(trials.every((trial) => trial.cues.position));
  assert.ok(trials.every((trial) => trial.cues.color));
  assert.ok(trials.every((trial) => trial.cues.shape));
  assert.ok(trials.every((trial) => trial.cues.audio));
});

test("quad n-back position cues never use the center fixation tile", () => {
  const config = createQuadNBackConfig({
    trialCount: 80,
    n: 2,
    matchChance: 0.4,
    interferenceChance: 0.4,
    activeModalities: ["position"]
  });
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const trials = generateQuadNBackTrials(config, random);

  assert.ok(trials.every((trial) => trial.cues.position !== "4"));
});

test("quad n-back generator makes targets match the cue n steps back", () => {
  const config = createQuadNBackConfig({
    trialCount: 8,
    n: 2,
    matchChance: 1,
    interferenceChance: 0,
    activeModalities: ["position"]
  });
  const trials = generateQuadNBackTrials(config, () => 0.1);

  for (let index = config.n; index < trials.length; index += 1) {
    assert.equal(trials[index].targets.position, true);
    assert.equal(trials[index].cues.position, trials[index - config.n].cues.position);
  }
});

test("quad n-back scoring counts decisions by active modality", () => {
  const score = scoreQuadNBackSession([
    {
      targets: { position: true, color: false },
      responses: { position: true, color: true },
      reactionTimesMs: { position: 500, color: 650 }
    },
    {
      targets: { position: false, color: true },
      responses: {},
      reactionTimesMs: {}
    }
  ], ["position", "color"]);

  assert.equal(score.hits, 1);
  assert.equal(score.misses, 1);
  assert.equal(score.falseAlarms, 1);
  assert.equal(score.correctRejections, 1);
  assert.equal(score.accuracy, 0.5);
  assert.equal(score.meanReactionTimeMs, 575);
  assert.equal(score.brainWorkshopContribution, 0.5);
  assert.equal(score.byModality.position.hits, 1);
  assert.equal(score.byModality.color.misses, 1);
});

test("quad n-back interference uses brain workshop lure offsets", () => {
  const config = createQuadNBackConfig({
    trialCount: 8,
    n: 3,
    matchChance: 0,
    interferenceChance: 1,
    activeModalities: ["position"]
  });
  const randomValues = [
    0.01, 0.01, 0.01, 0.01,
    0.2, 0.01, 0.2, 0.01,
    0.4, 0.01, 0.4, 0.01,
    0.6, 0.01, 0.6, 0.01,
    0.8, 0.01, 0.8, 0.01,
    0.3, 0.01, 0.3, 0.01,
    0.5, 0.01, 0.5, 0.01,
    0.7, 0.01, 0.7, 0.01
  ];
  let index = 0;
  const trials = generateQuadNBackTrials(config, () => randomValues[index++] ?? 0.01);

  const lureTrial = trials.find((trial) => trial.trialIndex >= config.n && trial.lures.position);
  assert.ok(lureTrial);
  assert.notEqual(lureTrial.cues.position, trials[lureTrial.trialIndex - config.n].cues.position);
  assert.ok([config.n - 1, config.n + 1, config.n * 2]
    .filter((offset) => lureTrial.trialIndex - offset >= 0)
    .some((offset) => lureTrial.cues.position === trials[lureTrial.trialIndex - offset].cues.position));
});
