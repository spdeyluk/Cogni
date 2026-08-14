import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHETYPE_AXES,
  BALANCED_THRESHOLD,
  deriveArchetype,
  archetypeForIndices
} from "../src/core/assessments/archetype.js";

test("clear top two returns the pair, joined alphabetically", () => {
  const key = deriveArchetype({
    verbal: 130, reasoning: 122, spatial: 100, numerical: 98, memory: 95, speed: 90
  });
  assert.equal(key, "reasoning+verbal");
});

test("key order is alphabetical, not by score", () => {
  // speed is the top score, reasoning second — key still lists them alphabetically.
  const key = deriveArchetype({
    speed: 140, reasoning: 128, verbal: 100, memory: 99, spatial: 97, numerical: 96
  });
  assert.equal(key, "reasoning+speed");
});

test("a flat profile reads as balanced", () => {
  const key = deriveArchetype({
    verbal: 104, reasoning: 101, spatial: 100, numerical: 99, memory: 98, speed: 97
  });
  assert.equal(key, "balanced"); // spread of 7 < threshold 10
});

test("BALANCED_THRESHOLD is the boundary", () => {
  // Spread exactly at the threshold is NOT balanced (strictly-less-than).
  const atThreshold = deriveArchetype({
    verbal: 110, reasoning: 105, spatial: 103, numerical: 102, memory: 101, speed: 100
  });
  assert.equal(atThreshold, "reasoning+verbal"); // spread 10, not < 10
  const belowThreshold = deriveArchetype({
    verbal: 109, reasoning: 105, spatial: 103, numerical: 102, memory: 101, speed: 100
  });
  assert.equal(belowThreshold, "balanced"); // spread 9 < 10
});

test("threshold is adjustable", () => {
  const scores = { verbal: 118, reasoning: 112, spatial: 105, numerical: 104, memory: 103, speed: 100 };
  assert.equal(deriveArchetype(scores, { threshold: 30 }), "balanced"); // spread 18 < 30
  assert.equal(deriveArchetype(scores, { threshold: 10 }), "reasoning+verbal");
});

test("ties break deterministically by axis id (ascending)", () => {
  // verbal and speed tie for the lead; memory and numerical tie behind.
  // Deterministic ordering picks speed, verbal — wait: alphabetical tie-break
  // means among the tied leaders, the earlier id wins the top slot.
  const key = deriveArchetype({
    speed: 120, verbal: 120, memory: 100, numerical: 100, reasoning: 90, spatial: 88
  });
  // Top two by (score desc, id asc): speed(120) then verbal(120) — key sorts them.
  assert.equal(key, "speed+verbal");
});

test("same input always yields the same key regardless of key order", () => {
  const a = deriveArchetype({ verbal: 120, speed: 118, memory: 100 });
  const b = deriveArchetype({ memory: 100, speed: 118, verbal: 120 });
  assert.equal(a, b);
  assert.equal(a, "speed+verbal");
});

test("fewer than two measured axes is balanced", () => {
  assert.equal(deriveArchetype({ verbal: 130 }), "balanced");
  assert.equal(deriveArchetype({}), "balanced");
});

test("non-finite scores are ignored", () => {
  const key = deriveArchetype({
    verbal: 130, reasoning: 120, spatial: NaN, numerical: undefined, memory: 95, speed: 90
  });
  assert.equal(key, "reasoning+verbal");
});

test("archetypeForIndices maps CHC index keys to axes", () => {
  const key = archetypeForIndices({
    vci: { score: 132 }, // verbal
    fri: { score: 124 }, // reasoning
    vsi: { score: 100 }, // spatial
    qri: { score: 99 },  // numerical
    wmi: { score: 96 },  // memory
    psi: { score: 92 }   // speed
  });
  assert.equal(key, "reasoning+verbal");
});

test("archetypeForIndices returns null when too little is measured", () => {
  assert.equal(archetypeForIndices({ vci: { score: 120 } }), null);
  assert.equal(archetypeForIndices({}), null);
});

test("axis id list is the six friendly names, alphabetical", () => {
  assert.deepEqual(ARCHETYPE_AXES, ["memory", "numerical", "reasoning", "spatial", "speed", "verbal"]);
});
