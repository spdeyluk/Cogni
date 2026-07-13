// Computerized Adaptive Test engine: 2PL Item Response Theory.
// Pure functions only — no DOM, no storage — so it can be unit tested and
// reused by the parameter re-estimation pipeline.

export const CAT_MIN_ITEMS = 20;
export const CAT_MAX_ITEMS = 50;
export const CAT_MAX_DURATION_MS = 30 * 60 * 1000;
export const CAT_TARGET_SE = 0.28; // reliability ~= 1 - SE^2 = 0.92

const THETA_GRID_MIN = -4;
const THETA_GRID_MAX = 4;
const THETA_GRID_STEPS = 121;

// P(correct | theta) under the 2PL model.
export function probability2PL(theta, item) {
  const exponent = -item.a * (theta - item.b);
  return 1 / (1 + Math.exp(exponent));
}

// Fisher information of one item at theta: a^2 * P * (1 - P).
export function fisherInformation(theta, item) {
  const p = probability2PL(theta, item);
  return item.a * item.a * p * (1 - p);
}

function normalPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function thetaGrid() {
  const step = (THETA_GRID_MAX - THETA_GRID_MIN) / (THETA_GRID_STEPS - 1);
  return Array.from({ length: THETA_GRID_STEPS }, (_, index) => THETA_GRID_MIN + index * step);
}

// Expected A Posteriori estimate of theta given responses, with a N(0,1)
// prior, computed by quadrature over a fixed grid. Responses are
// [{ item: { a, b }, correct: boolean }].
export function eapEstimate(responses) {
  const grid = thetaGrid();
  const weights = grid.map((theta) => {
    let likelihood = normalPdf(theta);
    for (const response of responses) {
      const p = probability2PL(theta, response.item);
      likelihood *= response.correct ? p : 1 - p;
    }
    return likelihood;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return { theta: 0, se: 1 };
  const theta = grid.reduce((sum, value, index) => sum + value * weights[index], 0) / total;
  const variance = grid.reduce((sum, value, index) => sum + (value - theta) ** 2 * weights[index], 0) / total;
  return { theta, se: Math.sqrt(variance) };
}

// Pick the next item: maximum Fisher information at the current theta, with
// a small randomization among the top candidates to reduce overexposure.
export function selectNextItem(theta, availableItems, { topCandidates = 3, rng = Math.random } = {}) {
  if (!availableItems.length) return null;
  const ranked = [...availableItems]
    .map((item) => ({ item, info: fisherInformation(theta, item) }))
    .sort((left, right) => right.info - left.info);
  const pool = ranked.slice(0, Math.min(topCandidates, ranked.length));
  return pool[Math.floor(rng() * pool.length)].item;
}

// True when the test should end.
export function shouldStop({ itemsAnswered, se, elapsedMs }) {
  if (itemsAnswered >= CAT_MAX_ITEMS) return true;
  if (elapsedMs >= CAT_MAX_DURATION_MS) return true;
  return itemsAnswered >= CAT_MIN_ITEMS && se <= CAT_TARGET_SE;
}

// IQ-style reporting: mean 100, SD 15.
export function thetaToScore(theta) {
  return Math.round(100 + 15 * theta);
}

export function scoreConfidenceInterval(theta, se, z = 1.96) {
  return {
    low: Math.round(100 + 15 * (theta - z * se)),
    high: Math.round(100 + 15 * (theta + z * se))
  };
}

// Percentile of an IQ-style score against the N(100, 15) population.
export function scorePercentile(score) {
  const z = (score - 100) / 15;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = normalPdf(z);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = d * poly;
  const cdf = z >= 0 ? 1 - upper : upper;
  return Math.round(cdf * 100);
}

// Provisional-parameter re-estimation pipeline. Feed it completed sessions
// ([{ theta, responses: [{ itemId, correct }] }]); for every item with
// enough observations it re-fits a and b by logistic regression of
// correctness on the respondents' theta estimates (Newton-Raphson).
// Returns { itemId: { a, b, observations } } for items that converged.
export function reestimateItemParameters(sessions, { minObservations = 30, iterations = 40 } = {}) {
  const byItem = new Map();
  for (const session of sessions) {
    for (const response of session.responses ?? []) {
      if (!byItem.has(response.itemId)) byItem.set(response.itemId, []);
      byItem.get(response.itemId).push({ theta: session.theta, correct: response.correct ? 1 : 0 });
    }
  }
  const estimates = {};
  for (const [itemId, observations] of byItem) {
    if (observations.length < minObservations) continue;
    // Logistic model: logit(P) = a * theta - a * b == w * theta + c.
    let w = 1;
    let c = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let gw = 0;
      let gc = 0;
      let hww = 0;
      let hwc = 0;
      let hcc = 0;
      for (const observation of observations) {
        const p = 1 / (1 + Math.exp(-(w * observation.theta + c)));
        const error = observation.correct - p;
        const weight = Math.max(1e-6, p * (1 - p));
        gw += error * observation.theta;
        gc += error;
        hww += weight * observation.theta * observation.theta;
        hwc += weight * observation.theta;
        hcc += weight;
      }
      const det = hww * hcc - hwc * hwc;
      if (Math.abs(det) < 1e-9) break;
      w += (gw * hcc - gc * hwc) / det;
      c += (gc * hww - gw * hwc) / det;
    }
    const a = Math.min(3, Math.max(0.2, w));
    const b = Math.min(4, Math.max(-4, -c / (Math.abs(w) < 1e-6 ? 1 : w)));
    estimates[itemId] = { a: roundParam(a), b: roundParam(b), observations: observations.length };
  }
  return estimates;
}

function roundParam(value) {
  return Math.round(value * 100) / 100;
}
