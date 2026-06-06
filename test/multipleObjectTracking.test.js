import test from "node:test";
import assert from "node:assert/strict";
import {
  createMotTrial,
  createMultipleObjectTrackingConfig,
  motSpeedDelta,
  nextMotConfig,
  scoreMotTrial
} from "../src/core/exercises/multipleObjectTracking.js";

test("MOT trial creates targets and distractors", () => {
  const config = createMultipleObjectTrackingConfig({
    targetCount: 3,
    blueDistractors: 4,
    coloredDistractors: 2
  });
  const balls = createMotTrial(config, () => 0.42);

  assert.equal(balls.length, 9);
  assert.equal(balls.filter((ball) => ball.isTarget).length, 3);
  assert.equal(balls.filter((ball) => ball.distractorType === "blue").length, 4);
  assert.equal(balls.filter((ball) => ball.distractorType === "colored").length, 2);
});

test("MOT trial starts balls separated enough to track identity", () => {
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const config = createMultipleObjectTrackingConfig({
    targetCount: 4,
    blueDistractors: 6,
    coloredDistractors: 0,
    ballSize: 1.8
  });
  const balls = createMotTrial(config, random);

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i].position;
      const b = balls[j].position;
      const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      assert.ok(distance >= config.ballSize * 2.25);
    }
  }
});

test("MOT trial preserves target identity after display shuffle", () => {
  const balls = createMotTrial(createMultipleObjectTrackingConfig({ targetCount: 1, blueDistractors: 5 }), () => 0.42);
  const target = balls.find((ball) => ball.isTarget);

  assert.equal(scoreMotTrial(balls, [target.id]).correct, true);
});

test("MOT scoring detects correct and false selections", () => {
  const balls = [
    { id: 1, isTarget: true },
    { id: 2, isTarget: true },
    { id: 3, isTarget: false }
  ];

  assert.deepEqual(scoreMotTrial(balls, [1, 2]), {
    correct: true,
    hits: 2,
    misses: 0,
    falseAlarms: 0,
    accuracy: 1
  });
  assert.equal(scoreMotTrial(balls, [1, 3]).correct, false);
  assert.equal(scoreMotTrial(balls, [1, 3]).falseAlarms, 1);
});

test("MOT auto progression adjusts speed by target accuracy", () => {
  const config = createMultipleObjectTrackingConfig({ ballSpeed: 0.35 });

  assert.equal(nextMotConfig(config, { hits: 4, falseAlarms: 0 }).ballSpeed, 0.37);
  assert.equal(nextMotConfig(config, { hits: 3, falseAlarms: 0 }).ballSpeed, 0.35);
  assert.equal(nextMotConfig(config, { hits: 3, falseAlarms: 1 }).ballSpeed, 0.35);
  assert.equal(nextMotConfig(config, { hits: 2, falseAlarms: 0 }).ballSpeed, 0.34);
  assert.equal(nextMotConfig(config, { hits: 1, falseAlarms: 0 }).ballSpeed, 0.33);
  assert.equal(nextMotConfig(config, { hits: 0, falseAlarms: 0 }).ballSpeed, 0.31);
});

test("MOT progression scales across target counts", () => {
  assert.equal(motSpeedDelta({ cleanPerfect: true, hitRate: 1, stepUp: 0.02 }), 0.02);
  assert.equal(motSpeedDelta({ cleanPerfect: false, hitRate: 0.8, falseAlarms: 1, stepDown: 0.02 }), 0);
  assert.equal(motSpeedDelta({ cleanPerfect: false, hitRate: 0.5, stepDown: 0.02 }), -0.01);
  assert.equal(motSpeedDelta({ cleanPerfect: false, hitRate: 0.25, stepDown: 0.02 }), -0.02);
  assert.equal(motSpeedDelta({ cleanPerfect: false, hitRate: 0, stepDown: 0.02 }), -0.04);
});
