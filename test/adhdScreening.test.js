import test from "node:test";
import assert from "node:assert/strict";
import { scoreAdhdScreening } from "../src/core/assessments/adhdScreening.js";

test("ADHD screening flags the combined profile only with clinical context", () => {
  const answers = [
    ...Array(6).fill(3), ...Array(12).fill(0),
    ...Array(6).fill(4), ...Array(15).fill(0),
    ...Array(6).fill(2)
  ];

  const result = scoreAdhdScreening({
    answers,
    symptomsPresentSixMonths: true,
    symptomsBeforeAgeTwelve: true
  });

  assert.equal(result.profile, "combined");
  assert.equal(result.meetsClinicalStyleScreen, true);
  assert.equal(result.functionalImpactAverage, 2);
  assert.equal(result.simpleConclusion, "Moderate");
});

test("ADHD screening does not flag a profile below six positive symptoms", () => {
  const result = scoreAdhdScreening({
    answers: [...Array(45).fill(0)].map((value, index) => index < 5 ? 3 : value),
    symptomsPresentSixMonths: true,
    symptomsBeforeAgeTwelve: true
  });

  assert.equal(result.profile, "none");
  assert.equal(result.meetsClinicalStyleScreen, false);
});
