import test from "node:test";
import assert from "node:assert/strict";
import { validateSessionTiming } from "../src/core/validation.js";

test("session validation flags implausibly fast responses", () => {
  const result = validateSessionTiming({
    config: { minTrials: 2 },
    trials: [
      { reactionTimeMs: 90 },
      { reactionTimeMs: 400 }
    ]
  });

  assert.equal(result.valid, false);
  assert.match(result.issues[0], /plausible/);
});

