import test from "node:test";
import assert from "node:assert/strict";
import {
  UFOV_SECTORS,
  createUfovConfig,
  createUfovTrial,
  currentUfovStreak,
  nextUfovConfig,
  scoreUfovTrial
} from "../src/core/exercises/usefulFieldOfView.js";

test("UFOV trial includes center choices and a peripheral sector", () => {
  const trial = createUfovTrial(createUfovConfig({ distractorCount: 12 }), () => 0.2);
  assert.equal(trial.centerChoices.length, 4);
  assert.equal(UFOV_SECTORS.includes(trial.targetSector), true);
  assert.equal(Array.isArray(trial.distractors), true);
});

test("UFOV scoring requires both center and sector to be correct", () => {
  const trial = {
    centerSymbol: "●",
    targetSector: "NE"
  };
  assert.equal(scoreUfovTrial(trial, { centerSymbol: "●", targetSector: "NE" }).correct, true);
  assert.equal(scoreUfovTrial(trial, { centerSymbol: "●", targetSector: "N" }).correct, false);
  assert.equal(scoreUfovTrial(trial, { centerSymbol: "▲", targetSector: "NE" }).correct, false);
});

test("UFOV adaptive progression speeds up and slows down by streak", () => {
  const config = createUfovConfig({ stimulusDurationMs: 1000, advanceStreak: 2, regressStreak: 2 });
  const faster = nextUfovConfig(config, [{ correct: true }, { correct: true }]);
  const slower = nextUfovConfig(config, [{ correct: false }, { correct: false }]);
  assert.equal(faster.stimulusDurationMs, 800);
  assert.equal(slower.stimulusDurationMs, 1200);
  assert.deepEqual(currentUfovStreak([{ correct: true }, { correct: false }, { correct: false }]), { correct: 0, wrong: 2 });
});
