import test from "node:test";
import assert from "node:assert/strict";
import { catItemBank, CAT_DOMAIN_TIME_LIMITS_MS } from "../src/core/assessments/catItemBank.js";

test("bank has 150 items split 60/45/45 across domains", () => {
  assert.equal(catItemBank.length, 150);
  const byDomain = { fluid: 0, verbal: 0, quant: 0 };
  for (const item of catItemBank) byDomain[item.domain] += 1;
  assert.deepEqual(byDomain, { fluid: 60, verbal: 45, quant: 45 });
});

test("every item is well-formed with provisional 2PL parameters in range", () => {
  const ids = new Set();
  for (const item of catItemBank) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    assert.ok(item.prompt.length > 0);
    assert.ok(item.options.length >= 4 && item.options.length <= 6, `${item.id} option count`);
    assert.ok(item.answerIndex >= 0 && item.answerIndex < item.options.length, `${item.id} answer index`);
    assert.ok(item.a >= 0.8 && item.a <= 2.0, `${item.id} a=${item.a}`);
    assert.ok(item.b >= -2.5 && item.b <= 2.5, `${item.id} b=${item.b}`);
    assert.equal(item.provisional, true);
    assert.ok(CAT_DOMAIN_TIME_LIMITS_MS[item.domain] > 0);
  }
});

test("difficulty spreads evenly across the full range in each domain", () => {
  for (const domain of ["fluid", "verbal", "quant"]) {
    const bs = catItemBank.filter((item) => item.domain === domain).map((item) => item.b);
    assert.equal(Math.min(...bs), -2.5, `${domain} min b`);
    assert.equal(Math.max(...bs), 2.5, `${domain} max b`);
    const buckets = [0, 0, 0, 0, 0];
    for (const b of bs) buckets[Math.min(4, Math.floor(b + 2.5))] += 1;
    for (const [index, count] of buckets.entries()) {
      assert.ok(count >= bs.length / 10, `${domain} bucket ${index} too thin (${count})`);
    }
  }
});

test("matrix items carry renderable 3x3 specs with distinct options", () => {
  const matrixItems = catItemBank.filter((item) => item.matrix);
  assert.ok(matrixItems.length >= 20, "expected a solid block of matrix items");
  for (const item of matrixItems) {
    assert.equal(item.matrix.cells.length, 9, `${item.id} cell count`);
    assert.equal(item.matrix.cells[8], null, `${item.id} hidden cell`);
    assert.equal(item.matrix.optionCells.length, item.options.length, `${item.id} option cells`);
    for (const cell of item.matrix.cells.slice(0, 8)) {
      assert.ok(Array.isArray(cell) && cell.length > 0, `${item.id} has empty visible cell`);
    }
    const keys = item.matrix.optionCells.map((cell) => JSON.stringify(cell));
    assert.equal(new Set(keys).size, keys.length, `${item.id} duplicate visual options`);
  }
});

test("text answer options are unique per item", () => {
  for (const item of catItemBank.filter((entry) => !entry.matrix)) {
    assert.equal(new Set(item.options).size, item.options.length, `${item.id} duplicate options`);
  }
});
