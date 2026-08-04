import test from "node:test";
import assert from "node:assert/strict";
import {
  MEASUREMENT_INDEX_ORDER,
  MEASUREMENT_INDICES,
  ITEM_KIND_INDEX,
  indexForItem,
  thetaToIndexScore,
  spanToTheta,
  scoreWorkingMemoryIndex,
  scoreProcessingSpeedIndex,
  scoreComposite,
  compositeStandardError,
  indexConfidenceInterval,
  scoreToPercentile,
  scoreDescriptor,
  WM_REFERENCE,
  PS_REFERENCE
} from "../src/core/assessments/measurement.js";
import { catItemBank } from "../src/core/assessments/catItemBank.js";

test("every index in the order has a definition, and vice versa", () => {
  assert.deepEqual([...MEASUREMENT_INDEX_ORDER].sort(), Object.keys(MEASUREMENT_INDICES).sort());
});

test("every item in the bank maps to exactly one index", () => {
  const unmapped = catItemBank.filter((item) => !indexForItem(item));
  assert.deepEqual(unmapped.map((item) => item.kind), [], "unmapped item kinds");
  for (const index of Object.values(ITEM_KIND_INDEX)) {
    assert.ok(MEASUREMENT_INDICES[index], `unknown index ${index}`);
  }
});

test("the item-based indices each get a usable number of items", () => {
  const counts = {};
  for (const item of catItemBank) {
    const key = indexForItem(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const key of ["vci", "vsi", "qri"]) {
    assert.ok(counts[key] >= 20, `${key} has only ${counts[key]} items`);
  }
});

test("theta maps to the mean-100 SD-15 scale", () => {
  assert.equal(thetaToIndexScore(0), 100);
  assert.equal(thetaToIndexScore(1), 115);
  assert.equal(thetaToIndexScore(-2), 70);
});

test("span converts to SD units against its reference", () => {
  assert.equal(spanToTheta(WM_REFERENCE.digit.mean, WM_REFERENCE.digit), 0);
  assert.equal(spanToTheta(WM_REFERENCE.digit.mean + 1.5, WM_REFERENCE.digit), 1);
  // Out-of-range spans are clamped rather than producing absurd scores.
  assert.equal(spanToTheta(99, WM_REFERENCE.digit), 4);
});

test("working memory averages the subtests it actually has", () => {
  const both = scoreWorkingMemoryIndex({ digit: 8.5, spatial: 6.5 });
  assert.equal(both.subtests, 2);
  assert.equal(both.score, 115);
  const one = scoreWorkingMemoryIndex({ digit: 7 });
  assert.equal(one.subtests, 1);
  assert.equal(one.score, 100);
  assert.equal(scoreWorkingMemoryIndex({}), null);
});

test("processing speed rewards being faster and is gated by accuracy", () => {
  const average = scoreProcessingSpeedIndex({ medianMs: PS_REFERENCE.medianMs, accuracy: 1 });
  assert.equal(average.score, 100);
  const fast = scoreProcessingSpeedIndex({ medianMs: PS_REFERENCE.medianMs - 120, accuracy: 1 });
  assert.equal(fast.score, 115);
  const slow = scoreProcessingSpeedIndex({ medianMs: PS_REFERENCE.medianMs + 120, accuracy: 1 });
  assert.equal(slow.score, 85);
  // Speed bought by guessing must not read as ability: at chance accuracy the
  // response times say nothing about ability, however fast they are.
  const guessing = scoreProcessingSpeedIndex({ medianMs: 300, accuracy: 0.5 });
  assert.ok(guessing.score < fast.score, "guessing should not outscore accurate speed");
  assert.ok(guessing.score < 100, "a pure guesser should land below the mean");
  assert.equal(guessing.signal, 0);
  // Even an impossibly fast guesser cannot climb: speed is gated, not additive.
  assert.ok(scoreProcessingSpeedIndex({ medianMs: 120, accuracy: 0.5 }).score <= guessing.score);
  // Partial accuracy scales the speed estimate rather than zeroing it.
  const partial = scoreProcessingSpeedIndex({ medianMs: 530, accuracy: 0.75 });
  assert.ok(partial.score < fast.score && partial.score > guessing.score);
  assert.equal(scoreProcessingSpeedIndex({}), null);
});

test("composite averages available indices and ignores missing ones", () => {
  const all = scoreComposite({ vci: 1, vsi: 1, qri: 1, wmi: 1, psi: 1 });
  assert.equal(all.score, 115);
  assert.equal(all.indexCount, 5);
  const partial = scoreComposite({ vci: 2, qri: 0 });
  assert.equal(partial.indexCount, 2);
  assert.equal(partial.score, 115);
  assert.equal(scoreComposite({}), null);
});

test("composite is measured more precisely than its parts", () => {
  const se = compositeStandardError([0.3, 0.3, 0.3, 0.3]);
  assert.ok(se < 0.3, "averaging should shrink the standard error");
  assert.ok(Math.abs(se - 0.15) < 1e-9);
  assert.equal(compositeStandardError([]), null);
});

test("confidence interval brackets the estimate", () => {
  const ci = indexConfidenceInterval(0, 0.3);
  assert.ok(ci.low < 100 && ci.high > 100);
  assert.equal(indexConfidenceInterval(0, undefined), null);
});

test("percentiles line up with the normal curve", () => {
  assert.ok(Math.abs(scoreToPercentile(100) - 50) < 0.2);
  assert.ok(Math.abs(scoreToPercentile(115) - 84.1) < 0.5);
  assert.ok(Math.abs(scoreToPercentile(85) - 15.9) < 0.5);
  // Never claims certainty at the extremes.
  assert.ok(scoreToPercentile(200) <= 99.9);
  assert.ok(scoreToPercentile(10) >= 0.1);
});

test("descriptors are monotonic across the scale", () => {
  const bands = [60, 75, 85, 100, 115, 125, 135].map(scoreDescriptor);
  assert.equal(new Set(bands).size, bands.length, "each band should be distinct");
  assert.equal(scoreDescriptor(100), "Average");
});

test("every scored result carries the provisional flag", () => {
  assert.equal(scoreWorkingMemoryIndex({ digit: 7 }).provisional, true);
  assert.equal(scoreProcessingSpeedIndex({ medianMs: 650, accuracy: 1 }).provisional, true);
  assert.equal(scoreComposite({ vci: 0 }).provisional, true);
});
