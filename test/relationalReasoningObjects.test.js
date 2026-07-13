import test from "node:test";
import assert from "node:assert/strict";
import {
  createRelationalReasoningConfig,
  generateRrtTrial
} from "../src/core/exercises/relationalReasoning.js";

function seededRandom(seed = 1) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

test("RRT draws terms from stackable object vocabularies", () => {
  const trial = generateRrtTrial(createRelationalReasoningConfig({
    mode: "distinction",
    premiseCount: 6,
    vocabularies: ["emoji", "garbage"]
  }), seededRandom(13));
  const text = `${trial.premises.join(" ")} ${trial.conclusion}`;

  assert.match(text, /☀️|🌙|⭐|⚡|🌊|🍃|💎|🔥|☁️|☄️/);
  assert.match(text, /[A-Z0-9]{3}/);
});
