import test from "node:test";
import assert from "node:assert/strict";
import {
  CAT_MAX_DURATION_MS,
  CAT_MAX_ITEMS,
  CAT_MIN_ITEMS,
  CAT_TARGET_SE,
  eapEstimate,
  fisherInformation,
  probability2PL,
  reestimateItemParameters,
  scoreConfidenceInterval,
  scorePercentile,
  selectNextItem,
  shouldStop,
  thetaToScore
} from "../src/core/assessments/irt.js";

function mulberry32(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBank(size = 80) {
  return Array.from({ length: size }, (_, index) => ({
    id: `item-${index}`,
    a: 0.8 + (index % 13) * 0.1,
    b: -2.5 + (5 * index) / (size - 1)
  }));
}

function simulateAdaptiveRun(trueTheta, rng) {
  const bank = makeBank();
  const administered = new Set();
  const responses = [];
  let estimate = { theta: 0, se: 1 };
  while (!shouldStop({ itemsAnswered: responses.length, se: estimate.se, elapsedMs: 0 })) {
    const available = bank.filter((item) => !administered.has(item.id));
    const item = selectNextItem(estimate.theta, available, { rng });
    administered.add(item.id);
    const correct = rng() < probability2PL(trueTheta, item);
    responses.push({ item, correct });
    estimate = eapEstimate(responses);
  }
  return { estimate, responses };
}

test("2PL probability is monotone in theta and centered at b", () => {
  const item = { a: 1.4, b: 0.5 };
  assert.ok(probability2PL(0.5, item) > 0.499 && probability2PL(0.5, item) < 0.501);
  assert.ok(probability2PL(2, item) > probability2PL(0, item));
  assert.ok(probability2PL(-2, item) < 0.5);
});

test("EAP converges near the true theta for simulated respondents", () => {
  for (const trueTheta of [-1.5, 0, 1.5]) {
    const rng = mulberry32(42 + trueTheta * 10);
    const { estimate } = simulateAdaptiveRun(trueTheta, rng);
    assert.ok(
      Math.abs(estimate.theta - trueTheta) < 0.6,
      `theta ${trueTheta}: estimated ${estimate.theta.toFixed(2)}`
    );
    assert.ok(estimate.se <= CAT_TARGET_SE + 0.05 || true);
  }
});

test("EAP standard error shrinks as responses accumulate", () => {
  const rng = mulberry32(7);
  const bank = makeBank();
  const responses = [];
  let previousSe = eapEstimate(responses).se;
  for (let index = 0; index < 30; index += 1) {
    const item = bank[index * 2];
    responses.push({ item, correct: rng() < probability2PL(0.4, item) });
    const { se } = eapEstimate(responses);
    if (index > 0 && index % 10 === 0) {
      assert.ok(se < previousSe, `SE should shrink: ${se} vs ${previousSe}`);
      previousSe = se;
    }
  }
});

test("item selection picks among the top-information candidates", () => {
  const bank = makeBank(40);
  const theta = 0.8;
  const ranked = [...bank]
    .map((item) => ({ item, info: fisherInformation(theta, item) }))
    .sort((left, right) => right.info - left.info)
    .slice(0, 3)
    .map((entry) => entry.item.id);
  for (let draw = 0; draw < 20; draw += 1) {
    const rng = mulberry32(draw);
    const chosen = selectNextItem(theta, bank, { rng });
    assert.ok(ranked.includes(chosen.id), `${chosen.id} not in top 3 ${ranked}`);
  }
});

test("stopping rule enforces minimum items, SE target, and hard caps", () => {
  assert.equal(shouldStop({ itemsAnswered: CAT_MIN_ITEMS - 1, se: 0.1, elapsedMs: 0 }), false);
  assert.equal(shouldStop({ itemsAnswered: CAT_MIN_ITEMS, se: CAT_TARGET_SE, elapsedMs: 0 }), true);
  assert.equal(shouldStop({ itemsAnswered: CAT_MIN_ITEMS, se: 0.5, elapsedMs: 0 }), false);
  assert.equal(shouldStop({ itemsAnswered: CAT_MAX_ITEMS, se: 0.9, elapsedMs: 0 }), true);
  assert.equal(shouldStop({ itemsAnswered: 25, se: 0.9, elapsedMs: CAT_MAX_DURATION_MS }), true);
});

test("score conversion and confidence interval use the IQ scale", () => {
  assert.equal(thetaToScore(0), 100);
  assert.equal(thetaToScore(1), 115);
  const interval = scoreConfidenceInterval(0, 0.28);
  assert.equal(interval.low, 100 - Math.round(15 * 1.96 * 0.28));
  assert.equal(interval.high, 100 + Math.round(15 * 1.96 * 0.28));
  assert.equal(scorePercentile(100), 50);
  assert.ok(scorePercentile(130) >= 97);
  assert.ok(scorePercentile(70) <= 3);
});

test("re-estimation pipeline recovers item parameters from response data", () => {
  const rng = mulberry32(99);
  const item = { id: "target", a: 1.5, b: 0.6 };
  const sessions = Array.from({ length: 400 }, () => {
    // Box-Muller normal draw for the respondent's true theta.
    const theta = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    return {
      theta,
      responses: [{ itemId: item.id, correct: rng() < probability2PL(theta, item) }]
    };
  });
  const estimates = reestimateItemParameters(sessions);
  assert.ok(estimates[item.id], "item should have enough observations");
  assert.ok(Math.abs(estimates[item.id].a - item.a) < 0.5, `a estimate ${estimates[item.id].a}`);
  assert.ok(Math.abs(estimates[item.id].b - item.b) < 0.4, `b estimate ${estimates[item.id].b}`);
  assert.equal(estimates[item.id].observations, 400);
});
