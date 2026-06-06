import test from "node:test";
import assert from "node:assert/strict";
import {
  createRelationalReasoningConfig,
  generateRrtTrial,
  nextRrtConfig,
  scoreRrtAnswer
} from "../src/core/exercises/relationalReasoning.js";

test("RRT generates distinction trials with premises and conclusion", () => {
  const trial = generateRrtTrial(createRelationalReasoningConfig({ mode: "distinction", premiseCount: 3 }), () => 0.7);

  assert.equal(trial.mode, "distinction");
  assert.equal(trial.premises.length, 3);
  assert.match(trial.conclusion, /same as|opposite of/);
  assert.equal(typeof trial.isTrue, "boolean");
});

test("RRT generates linear and spatial trials", () => {
  const linear = generateRrtTrial(createRelationalReasoningConfig({ mode: "linear" }), () => 0.2);
  const spatial = generateRrtTrial(createRelationalReasoningConfig({ mode: "space2d" }), () => 0.8);

  assert.match(linear.conclusion, /left of|right of/);
  assert.match(spatial.conclusion, /north|south|east|west/);
});

test("RRT supports space 3D and mode priorities", () => {
  const trial = generateRrtTrial(createRelationalReasoningConfig({
    mode: "mixed",
    modeSettings: {
      distinction: { enabled: false, priority: 1 },
      linear: { enabled: false, priority: 1 },
      space2d: { enabled: false, priority: 1 },
      space3d: { enabled: true, priority: 100, premiseCount: 4, timerSeconds: 45 }
    }
  }), () => 0.9);

  assert.equal(trial.mode, "space3d");
  assert.equal(trial.premises.length, 4);
  assert.equal(trial.timerSeconds, 45);
  assert.match(trial.conclusion, /above|below|north|south|east|west/);
});

test("RRT scoring compares boolean answer to truth", () => {
  const trial = { isTrue: true };

  assert.equal(scoreRrtAnswer(trial, true).correct, true);
  assert.equal(scoreRrtAnswer(trial, false).correct, false);
});

test("RRT auto progression adjusts premise count", () => {
  const config = createRelationalReasoningConfig({ premiseCount: 3 });

  assert.equal(nextRrtConfig(config, [{ correct: true }, { correct: true }, { correct: true }]).premiseCount, 4);
  assert.equal(nextRrtConfig(config, [{ correct: false }, { correct: true }, { correct: false }]).premiseCount, 2);
});
