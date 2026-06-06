import test from "node:test";
import assert from "node:assert/strict";
import {
  createIctConfig,
  createIctTrials,
  nextIctStopSignalDelay,
  scoreIctTrial
} from "../src/core/exercises/inhibitoryControlTraining.js";

test("ICT generates calibration and main stop-signal trials", () => {
  const config = createIctConfig({ calibrationTrials: 2, blocks: 1, trialsPerBlock: 4, stopProbability: 1 });
  const trials = createIctTrials(config, () => 0.1);

  assert.equal(trials.length, 6);
  assert.equal(trials.filter((trial) => trial.calibration).length, 2);
  assert.equal(trials.filter((trial) => trial.stopTrial).length, 4);
});

test("ICT food stop trials only appear for junk-food left cues", () => {
  const config = createIctConfig({ cueType: "food", calibrationTrials: 0, blocks: 1, trialsPerBlock: 4, stopProbability: 1 });
  const randomValues = [0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.9, 0.1];
  const trials = createIctTrials(config, () => randomValues.shift() ?? 0.1);

  assert.equal(trials[0].direction, "left");
  assert.equal(trials[0].stopTrial, true);
  assert.equal(trials[1].direction, "right");
  assert.equal(trials[1].stopTrial, false);
});

test("ICT scoring rewards fast go responses and withheld stop responses", () => {
  const goTrial = { direction: "left", stopTrial: false };
  const stopTrial = { direction: "left", stopTrial: true };

  assert.equal(scoreIctTrial(goTrial, "left", 420).correct, true);
  assert.equal(scoreIctTrial(goTrial, "right", 420).correct, false);
  assert.equal(scoreIctTrial(stopTrial, null, null).correct, true);
  assert.equal(scoreIctTrial(stopTrial, "left", 390).correct, false);
});

test("ICT adaptive SSD gets harder after successful stops and easier after failed stops", () => {
  const config = createIctConfig({ stopSignalDelayMs: 250, stopSignalStepMs: 50, minStopSignalDelayMs: 100, maxStopSignalDelayMs: 300 });

  assert.equal(nextIctStopSignalDelay(config, 250, { stopTrial: true, stopped: true }), 300);
  assert.equal(nextIctStopSignalDelay(config, 250, { stopTrial: true, stopped: false }), 200);
  assert.equal(nextIctStopSignalDelay(config, 100, { stopTrial: true, stopped: false }), 100);
});
