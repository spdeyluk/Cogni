import test from "node:test";
import assert from "node:assert/strict";
import { betaBellCurveEstimate } from "../src/core/norms.js";

test("beta bell curve estimate maps strong criterion score to average standard score", () => {
  const estimate = betaBellCurveEstimate(78);

  assert.equal(estimate.standardScore, 100);
  assert.equal(estimate.mean, 100);
  assert.equal(estimate.standardDeviation, 15);
  assert.match(estimate.caveat, /Estimated/);
});

test("beta bell curve estimate increases with criterion score", () => {
  assert.ok(betaBellCurveEstimate(80).standardScore > betaBellCurveEstimate(40).standardScore);
});
