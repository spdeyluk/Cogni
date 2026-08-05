// Cogni Measurement — a CHC-structured battery.
//
// The old test reported one composite plus three loose "domains" (fluid, verbal,
// quant). That is thinner than what a modern battery reports, and it left two
// whole ability areas unmeasured even though the engines for them already
// existed in this folder. This module defines the battery proper: five indices
// built from named subtests, each scored to the familiar mean-100 / SD-15 scale,
// plus a composite.
//
// IMPORTANT — the honest caveat. Every index score here is derived either from
// provisional IRT parameters (author estimates, not calibrated on a sample) or
// from published-typical span/speed values used as a stand-in for real norms.
// They are internally consistent and useful for tracking change over time, but
// they are NOT norm-referenced scores and must never be presented as such until
// a real norming sample exists. `provisional: true` rides along on every result
// so the UI cannot quietly forget this.

export const MEASUREMENT_SCALE = { mean: 100, sd: 15 };

// The six CHC broad abilities the battery reports, each with its stratum-II
// code so the mapping to the theory is explicit rather than implied.
export const MEASUREMENT_INDICES = {
  vci: {
    key: "vci",
    chc: "Gc",
    short: "VCI",
    name: "Verbal Comprehension",
    blurb: "Word knowledge, verbal reasoning and how precisely you handle meaning.",
    accent: "#F2597A"
  },
  fri: {
    key: "fri",
    chc: "Gf",
    short: "FRI",
    name: "Fluid Reasoning",
    blurb: "Finding the rule in something you have never seen before.",
    accent: "#FB8A6B"
  },
  vsi: {
    key: "vsi",
    chc: "Gv",
    short: "VSI",
    name: "Visual Spatial",
    blurb: "Turning shapes over in your head and keeping track of how they sit.",
    accent: "#F5B942"
  },
  qri: {
    key: "qri",
    chc: "Gq",
    short: "QRI",
    name: "Quantitative Reasoning",
    blurb: "Reasoning with number, proportion and quantitative relationships.",
    accent: "#18B87B"
  },
  wmi: {
    key: "wmi",
    chc: "Gsm",
    short: "WMI",
    name: "Working Memory",
    blurb: "How much you can hold in mind at once while doing something else with it.",
    accent: "#3F82E8"
  },
  psi: {
    key: "psi",
    chc: "Gs",
    short: "PSI",
    name: "Processing Speed",
    blurb: "How quickly you make simple decisions accurately and without drifting.",
    accent: "#B564E8"
  }
};

// Report order follows the CHC wheel, reasoning first, speed last.
export const MEASUREMENT_INDEX_ORDER = ["vci", "fri", "vsi", "qri", "wmi", "psi"];

// Which index each adaptive item kind feeds. Matrix reasoning is Gf, not Gv:
// it is rule induction that happens to be presented visually. Visual Spatial is
// carried by mental rotation, where the work really is spatial.
export const ITEM_KIND_INDEX = {
  vocabulary: "vci",
  "verbal-analogy": "vci",
  "odd-one-out": "vci",
  "sentence-logic": "vci",
  matrix: "fri",
  series: "fri",
  "letter-analogy": "fri",
  "mental-rotation": "vsi",
  "word-problem": "qri",
  "number-property": "qri",
  "proportion-rate": "qri"
};

// ---------------------------------------------------------------------------
// Subtests. A subtest is the unit the user actually commits to: it is started
// deliberately, runs to the end in one sitting, and cannot be paused, retried
// or resumed. That is what makes the score mean anything — a section you can
// restart is a section you can farm.
// ---------------------------------------------------------------------------
export const MEASUREMENT_SUBTESTS = [
  {
    id: "verbal-reasoning",
    index: "vci",
    name: "Verbal Reasoning",
    kinds: ["verbal-analogy", "odd-one-out", "sentence-logic"],
    questions: 12,
    secondsPerQuestion: 45,
    summary: "Assesses crystallized verbal knowledge and reasoning about meaning.",
    instructions: "For each question, choose the option that best preserves the relationship, completes the argument, or does not belong."
  },
  {
    id: "vocabulary",
    index: "vci",
    name: "Vocabulary",
    kinds: ["vocabulary"],
    questions: 12,
    secondsPerQuestion: 40,
    summary: "Assesses breadth and precision of word knowledge.",
    instructions: "Choose the option closest in meaning to the word given."
  },
  {
    id: "matrix-reasoning",
    index: "fri",
    name: "Matrix Reasoning",
    kinds: ["matrix"],
    questions: 14,
    secondsPerQuestion: 75,
    summary: "Assesses inductive reasoning — finding the rule that governs a visual pattern.",
    instructions: "Each 3×3 grid follows one or more rules. Choose the option that completes it."
  },
  {
    id: "series",
    index: "fri",
    name: "Series",
    kinds: ["series", "letter-analogy"],
    questions: 12,
    secondsPerQuestion: 60,
    summary: "Assesses sequential reasoning over numbers and letters.",
    instructions: "Work out the rule generating the sequence and choose what comes next."
  },
  {
    id: "mental-rotation",
    index: "vsi",
    name: "Mental Rotation",
    kinds: ["mental-rotation"],
    questions: 10,
    secondsPerQuestion: 50,
    summary: "Assesses spatial visualisation — rotating a figure in your head.",
    instructions: "One option is the target figure rotated. The others are mirror images, which can never be produced by rotation alone."
  },
  {
    id: "quantitative-knowledge",
    index: "qri",
    name: "Quantitative Knowledge",
    kinds: ["word-problem", "number-property", "proportion-rate"],
    questions: 14,
    secondsPerQuestion: 60,
    summary: "Assesses reasoning with number, proportion and quantitative relationships.",
    instructions: "Choose the correct answer. Working it out on paper is fine; a calculator is not."
  },
  {
    id: "digit-span",
    index: "wmi",
    name: "Digit Span",
    engine: "span",
    questions: null,
    summary: "Assesses how much you can hold in mind and manipulate at once.",
    instructions: "Digits appear briefly, then you type them back — forward first, then in reverse. The sequence grows until you miss twice."
  },
  {
    id: "symbol-match",
    index: "psi",
    name: "Symbol Match",
    engine: "speed",
    questions: 32,
    summary: "Assesses decision speed on a task with no reasoning load.",
    instructions: "Two symbols appear. Say whether they match, as fast as you can without making mistakes."
  }
];

export function subtestById(id) {
  return MEASUREMENT_SUBTESTS.find((subtest) => subtest.id === id) ?? null;
}

export function subtestsForIndex(indexKey) {
  return MEASUREMENT_SUBTESTS.filter((subtest) => subtest.index === indexKey);
}

/** Rough minutes for a subtest, used for the "~N minutes" line on its card. */
export function subtestMinutes(subtest) {
  if (subtest.engine === "span") return 5;
  if (subtest.engine === "speed") return 2;
  const seconds = (subtest.questions ?? 0) * (subtest.secondsPerQuestion ?? 45);
  // People answer well inside the per-question limit, so halve it for the estimate.
  return Math.max(2, Math.round(seconds / 2 / 60));
}

export function indexForItem(item) {
  return ITEM_KIND_INDEX[item?.kind] ?? null;
}

/** theta (SD units, mean 0) → an index score on the mean-100 / SD-15 scale. */
export function thetaToIndexScore(theta) {
  return Math.round(MEASUREMENT_SCALE.mean + MEASUREMENT_SCALE.sd * theta);
}

/** Clamp helper shared by the non-IRT indices. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// --- Working memory -------------------------------------------------------
// Reference points, not norms: forward digit span in healthy adults centres
// near 7 items and spatial span near 5, both with a spread of roughly 1.5. We
// convert each to SD units against those reference points and average them.
export const WM_REFERENCE = {
  digit: { mean: 7, sd: 1.5 },
  spatial: { mean: 5, sd: 1.5 }
};

export function spanToTheta(span, reference) {
  if (!Number.isFinite(span) || !reference) return 0;
  return clamp((span - reference.mean) / reference.sd, -4, 4);
}

/**
 * Working memory index from the span subtests.
 * `spans` is { digit, spatial } — either may be missing if a subtest was skipped.
 */
export function scoreWorkingMemoryIndex(spans = {}) {
  const parts = [];
  if (Number.isFinite(spans.digit)) parts.push(spanToTheta(spans.digit, WM_REFERENCE.digit));
  if (Number.isFinite(spans.spatial)) parts.push(spanToTheta(spans.spatial, WM_REFERENCE.spatial));
  if (!parts.length) return null;
  const theta = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return { theta, score: thetaToIndexScore(theta), subtests: parts.length, provisional: true };
}

// --- Processing speed -----------------------------------------------------
// Speeded two-choice decisions: a median around 650 ms with a spread near 120 ms
// is typical for young adults on a simple matching task. Faster is better, so
// the sign is inverted.
//
// Accuracy is not a penalty term but a *gain* on the speed estimate, because at
// chance accuracy response time carries no information about ability at all —
// it only measures how fast someone can tap. Subtracting a fixed penalty was
// not enough: mashing at 300 ms with 50% correct still scored above average.
// Scaling by the proportion of accuracy above chance makes speed count only to
// the degree the answers were real, and floors a pure guesser well below the mean.
export const PS_REFERENCE = { medianMs: 650, sdMs: 120, chanceAccuracy: 0.5, guessingTheta: -2 };

export function scoreProcessingSpeedIndex({ medianMs, accuracy } = {}) {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return null;
  const speedTheta = clamp((PS_REFERENCE.medianMs - medianMs) / PS_REFERENCE.sdMs, -4, 4);
  const chance = PS_REFERENCE.chanceAccuracy;
  const signal = Number.isFinite(accuracy)
    ? clamp((accuracy - chance) / (1 - chance), 0, 1)
    : 1;
  const theta = clamp(speedTheta * signal + PS_REFERENCE.guessingTheta * (1 - signal), -4, 4);
  return { theta, score: thetaToIndexScore(theta), signal, provisional: true };
}

// --- Composite ------------------------------------------------------------
// A simple average of the available index thetas. Equal weights are deliberate:
// with provisional parameters there is no defensible basis for weighting one
// index above another, and an unjustified weighting would look more precise
// than the data supports.
export function scoreComposite(indexThetas = {}) {
  const values = MEASUREMENT_INDEX_ORDER
    .map((key) => indexThetas[key])
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  const theta = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { theta, score: thetaToIndexScore(theta), indexCount: values.length, provisional: true };
}

/**
 * Standard error of a composite of independent index estimates, used for the
 * confidence band. Averaging k estimates divides the variance by k.
 */
export function compositeStandardError(indexErrors = []) {
  const values = indexErrors.filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  const meanVariance = values.reduce((sum, se) => sum + se * se, 0) / (values.length * values.length);
  return Math.sqrt(meanVariance);
}

/** Score band on the index scale, e.g. 100 ± 1.96 SE. */
export function indexConfidenceInterval(theta, se, z = 1.96) {
  if (!Number.isFinite(se)) return null;
  return {
    low: thetaToIndexScore(theta - z * se),
    high: thetaToIndexScore(theta + z * se)
  };
}

// Percentile of a score on the normal curve. Abramowitz & Stegun 7.1.26 for erf.
export function scoreToPercentile(score) {
  const z = (score - MEASUREMENT_SCALE.mean) / MEASUREMENT_SCALE.sd;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  const cdf = 0.5 * (1 + sign * y);
  return Math.round(clamp(cdf * 100, 0.1, 99.9) * 10) / 10;
}

/** Plain-language band for a score, so the report doesn't lean on the number alone. */
export function scoreDescriptor(score) {
  if (score >= 130) return "Very high";
  if (score >= 120) return "High";
  if (score >= 110) return "Above average";
  if (score >= 90) return "Average";
  if (score >= 80) return "Below average";
  if (score >= 70) return "Low";
  return "Very low";
}
