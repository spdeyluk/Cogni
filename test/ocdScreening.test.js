import test from "node:test";
import assert from "node:assert/strict";
import { OCD_QUESTIONS, scoreOcdScreening } from "../src/core/assessments/ocdScreening.js";

test("OCD screening has 18 items with an impact item last", () => {
  assert.equal(OCD_QUESTIONS.length, 18);
  assert.equal(OCD_QUESTIONS.at(-1)[0], "impact");
});

test("all-zero answers score Low with no threshold hit", () => {
  const result = scoreOcdScreening({ answers: Array(18).fill(0) });
  assert.equal(result.total, 0);
  assert.equal(result.simpleConclusion, "Low");
  assert.equal(result.meetsScreenThreshold, false);
});

test("elevated answers with impact meet the screen threshold", () => {
  const answers = OCD_QUESTIONS.map(() => 2); // total 34 over 17 symptom items
  const result = scoreOcdScreening({ answers });
  assert.equal(result.total, 34);
  assert.equal(result.simpleConclusion, "High");
  assert.equal(result.impactScore, 2);
  assert.equal(result.meetsScreenThreshold, true);
  assert.equal(result.subscales.checking, 6);
  assert.equal(result.subscales.hoarding, 4);
});

test("impact alone does not trip the threshold", () => {
  const answers = Array(17).fill(0).concat([4]);
  const result = scoreOcdScreening({ answers });
  assert.equal(result.total, 0);
  assert.equal(result.meetsScreenThreshold, false);
});

test("answer count is validated", () => {
  assert.throws(() => scoreOcdScreening({ answers: [1, 2, 3] }));
});
