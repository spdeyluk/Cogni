import test from "node:test";
import assert from "node:assert/strict";
import { calculateExerciseWeight } from "../src/core/exerciseWeight.js";

test("N-back setting weight rises with faster trials and more active cues", () => {
  const easy = calculateExerciseWeight("nback", {
    n: 1,
    activeModalities: ["position"],
    trialTimeMs: 5000,
    interference: 0,
    matchChance: 0.25,
    sessionTimerSeconds: 30
  });
  const hard = calculateExerciseWeight("nback", {
    n: 8,
    activeModalities: ["position", "audio", "color", "shape"],
    trialTimeMs: 1500,
    interference: 0.75,
    matchChance: 0,
    sessionTimerSeconds: 3600
  });

  assert.equal(easy.overall, 0);
  assert.equal(hard.overall, 1);
});

test("CCT setting weight reports the settings that form its score", () => {
  const weight = calculateExerciseWeight("cct", {
    durationSeconds: 300,
    startingIntervalMs: 3000,
    minimumIntervalMs: 500,
    adaptive: true,
    cueMode: "voice"
  });

  assert.equal(weight.factors.length, 5);
  assert.ok(weight.overall > 0 && weight.overall < 1);
});
