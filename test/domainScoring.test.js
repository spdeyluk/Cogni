import test from "node:test";
import assert from "node:assert/strict";
import { scoreWorkingMemoryBattery } from "../src/core/assessments/domainScoring.js";

test("working memory battery combines all three subtest scores", () => {
  const score = scoreWorkingMemoryBattery({
    visualSequenceSpan: { score: 80 },
    spatialSpan: { score: 70 },
    operationSpan: { score: 60 }
  });

  assert.equal(score.domain, "working-memory");
  assert.equal(score.score, 70);
  assert.equal(score.scoringModelVersion, "working-memory-v1");
});

