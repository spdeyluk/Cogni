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
  MEASUREMENT_SUBTESTS,
  subtestMinutes,
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

test("processing speed measures corrected throughput, not reaction time", () => {
  const average = scoreProcessingSpeedIndex({ correct: 50, incorrect: 5 });
  assert.equal(average.score, 100);
  const fast = scoreProcessingSpeedIndex({ correct: 62, incorrect: 5 });
  assert.ok(fast.score > average.score);
  const slow = scoreProcessingSpeedIndex({ correct: 25, incorrect: 4 });
  assert.ok(slow.score < average.score);

  // Two-choice guessing is cancelled by the correction, so a masher who racks
  // up a big raw count still lands far below the mean.
  const masher = scoreProcessingSpeedIndex({ correct: 60, incorrect: 60 });
  assert.equal(masher.corrected, 0);
  assert.ok(masher.score < 60, `masher scored ${masher.score}`);
  assert.ok(masher.score < slow.score);

  // A short window is pro-rated so a stopped-early sitting is comparable.
  const half = scoreProcessingSpeedIndex({ correct: 25, incorrect: 2, windowMs: 60000 });
  const full = scoreProcessingSpeedIndex({ correct: 50, incorrect: 4, windowMs: 120000 });
  assert.equal(half.score, full.score);

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
  assert.equal(scoreProcessingSpeedIndex({ correct: 40, incorrect: 2 }).provisional, true);
  assert.equal(scoreComposite({ vci: 0 }).provisional, true);
});

test("every subtest belongs to a real index and the six indices are all covered", () => {
  const covered = new Set();
  for (const subtest of MEASUREMENT_SUBTESTS) {
    assert.ok(MEASUREMENT_INDICES[subtest.index], `${subtest.id} has unknown index ${subtest.index}`);
    covered.add(subtest.index);
    assert.ok(subtest.name && subtest.summary && subtest.instructions, `${subtest.id} is missing copy`);
    assert.ok(subtest.kinds || subtest.engine, `${subtest.id} has no source`);
  }
  assert.deepEqual([...covered].sort(), [...MEASUREMENT_INDEX_ORDER].sort());
});

test("each item-based subtest has a pool comfortably larger than its length", () => {
  for (const subtest of MEASUREMENT_SUBTESTS) {
    if (!subtest.kinds) continue;
    const pool = catItemBank.filter((item) => subtest.kinds.includes(item.kind));
    assert.ok(pool.length >= subtest.questions * 1.5,
      `${subtest.id}: pool ${pool.length} for ${subtest.questions} questions`);
  }
});

test("mental rotation distractors are mirrors, never rotations of the target", () => {
  const items = catItemBank.filter((item) => item.kind === "mental-rotation");
  assert.ok(items.length >= 15, `only ${items.length} rotation items`);
  for (const item of items) {
    const shapes = item.figure.optionCells.map((cells) =>
      JSON.stringify(cells.map((g) => [Number(g.x.toFixed(3)), Number(g.y.toFixed(3))]).sort()));
    assert.equal(new Set(shapes).size, shapes.length, `${item.id} has two identical options`);
    assert.equal(item.figure.optionCells.length, item.options.length);
    assert.ok(item.figure.target.length >= 4, `${item.id} target too small`);
  }
});

test("subtest minute estimates are sane", () => {
  for (const subtest of MEASUREMENT_SUBTESTS) {
    const minutes = subtestMinutes(subtest);
    assert.ok(minutes >= 2 && minutes <= 15, `${subtest.id} estimated at ${minutes} min`);
  }
});

test("figure weights items each have exactly one balancing option", () => {
  // Solved the way a taker would: read the exchange rates off the two premise
  // scales, then weigh every option. The generator gets no say here.
  const items = catItemBank.filter((item) => item.kind === "figure-weights");
  assert.ok(items.length >= 24, `only ${items.length} figure-weight items`);
  const count = (pan, shape) => (pan ?? []).filter((glyph) => glyph.s === shape).length;

  for (const item of items) {
    const [first, second, question] = item.weights.scales;
    const midValue = count(first.right, "circle") / Math.max(1, count(first.left, "square"));
    const bigValue = (count(second.right, "square") / Math.max(1, count(second.left, "triangle"))) * midValue;
    assert.ok(midValue > 0 && bigValue > 0, `${item.id} has an unreadable premise`);
    const weigh = (pan) =>
      count(pan, "circle") + count(pan, "square") * midValue + count(pan, "triangle") * bigValue;

    const target = weigh(question.left);
    assert.equal(question.right, null, `${item.id} question scale should be open`);
    const balancing = item.weights.optionCells
      .map((cells, index) => ({ index, weight: weigh(cells) }))
      .filter((option) => option.weight === target);
    assert.equal(balancing.length, 1, `${item.id} has ${balancing.length} balancing options`);
    assert.equal(balancing[0].index, item.answerIndex, `${item.id} answer key disagrees with the scales`);
  }
});

test("figure weight pans stay readable", () => {
  for (const item of catItemBank.filter((i) => i.kind === "figure-weights")) {
    const pans = [
      ...item.weights.scales.flatMap((scale) => [scale.left, scale.right]),
      ...item.weights.optionCells
    ].filter(Boolean);
    for (const pan of pans) assert.ok(pan.length <= 5, `${item.id} has a pan of ${pan.length} shapes`);
  }
});
