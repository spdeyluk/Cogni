import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickFreshRound, rememberServed, shuffleIndices } from "../src/core/itemRotation.js";
import { catItemBank } from "../src/core/assessments/catItemBank.js";

const FALLACY_ROUND_SIZE = 16;

function loadFallacyItems() {
  return JSON.parse(readFileSync(new URL("../public/data/fallacy-items.json", import.meta.url))).items;
}

// Deals a bank repeatedly the way the app does, returning each round's ids.
function dealRounds(pool, rounds, roundSize = FALLACY_ROUND_SIZE) {
  let recent = [];
  const dealt = [];
  for (let index = 0; index < rounds; index += 1) {
    const round = pickFreshRound({ pool, size: roundSize, recent });
    dealt.push(round.map((item) => item.id));
    recent = rememberServed({ recent, servedIds: round.map((item) => item.id), poolSize: pool.length, roundSize });
  }
  return dealt;
}

test("shuffleIndices returns a true permutation", () => {
  for (const length of [2, 4, 5, 9]) {
    const order = shuffleIndices(length);
    assert.equal(order.length, length);
    assert.equal(new Set(order).size, length);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length }, (_, i) => i));
  }
});

test("shuffled presentation spreads the answer across every position", () => {
  // The bank stores each answer at a fixed index; shuffling per showing must
  // make the displayed position uniform rather than learnable.
  const counts = new Array(4).fill(0);
  const answerIndex = 2;
  for (let trial = 0; trial < 4000; trial += 1) {
    const order = shuffleIndices(4);
    counts[order.indexOf(answerIndex)] += 1;
  }
  for (const count of counts) {
    assert.ok(Math.abs(count - 1000) < 150, `position skewed: ${counts.join(",")}`);
  }
});

test("consecutive rounds never repeat an item while the bank has fresh ones", () => {
  const pool = Array.from({ length: 72 }, (_, i) => ({ id: `e${i}` }));
  const dealt = dealRounds(pool, 4);
  for (let index = 1; index < dealt.length; index += 1) {
    const previous = new Set(dealt[index - 1]);
    const overlap = dealt[index].filter((id) => previous.has(id));
    assert.deepEqual(overlap, [], `round ${index} repeated ${overlap.length} items`);
  }
});

test("a bank is dealt through completely before any item comes back", () => {
  const pool = Array.from({ length: 72 }, (_, i) => ({ id: `e${i}` }));
  const dealt = dealRounds(pool, 4).flat();
  // 4 rounds x 16 = 64 draws from 72 items, so every draw should be distinct.
  assert.equal(new Set(dealt).size, dealt.length);
});

test("rounds stay full even when the bank is smaller than the round", () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
  const round = pickFreshRound({ pool, size: FALLACY_ROUND_SIZE, recent: [] });
  assert.equal(round.length, 10);
  assert.equal(new Set(round.map((item) => item.id)).size, 10);
});

test("a stale recent window still yields a full, duplicate-free round", () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` }));
  // Everything already seen — the top-up path must still fill the round.
  const recent = pool.map((item) => item.id);
  const round = pickFreshRound({ pool, size: FALLACY_ROUND_SIZE, recent });
  assert.equal(round.length, FALLACY_ROUND_SIZE);
  assert.equal(new Set(round.map((item) => item.id)).size, FALLACY_ROUND_SIZE);
});

test("rememberServed keeps a full round available", () => {
  const poolSize = 72;
  let recent = [];
  for (let round = 0; round < 12; round += 1) {
    const served = Array.from({ length: FALLACY_ROUND_SIZE }, (_, i) => `r${round}-${i}`);
    recent = rememberServed({ recent, servedIds: served, poolSize, roundSize: FALLACY_ROUND_SIZE });
    assert.ok(recent.length <= poolSize - FALLACY_ROUND_SIZE);
  }
});

test("fallacy bank is big enough that a round is a minority of it", () => {
  const items = loadFallacyItems();
  for (const difficulty of ["easy", "hard"]) {
    const pool = items.filter((item) => (item.difficulty || "easy") === difficulty);
    assert.ok(pool.length >= FALLACY_ROUND_SIZE * 3,
      `${difficulty} bank too small for varied rounds: ${pool.length}`);
  }
});

test("fallacy bank has no duplicate ids or duplicate question text", () => {
  const items = loadFallacyItems();
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(new Set(items.map((item) => item.text.trim().toLowerCase())).size, items.length);
});

test("CAT bank items are unique and every option set is distinct", () => {
  assert.equal(new Set(catItemBank.map((item) => item.id)).size, catItemBank.length);
  for (const item of catItemBank) {
    assert.equal(new Set(item.options).size, item.options.length, `duplicate option in ${item.id}`);
    assert.ok(item.answerIndex >= 0 && item.answerIndex < item.options.length, `bad answerIndex in ${item.id}`);
  }
});
