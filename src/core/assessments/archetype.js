// Cognitive archetype — a plain-language read of a profile's shape.
//
// A profile's "archetype" is derived from its two strongest ability axes (or
// "balanced" when nothing stands out). The six axes are the friendly names the
// UI already uses for the CHC indices; the mapping from index keys lives here so
// callers pass whichever they have.
//
// This module is pure: no DOM, no fetch. The content for each key (word, line,
// fields, style) lives in public/data/archetypes.json and is looked up by the
// key this returns.

// The six ability axes, in stable id form (lowercase, alphabetical).
export const ARCHETYPE_AXES = ["memory", "numerical", "reasoning", "spatial", "speed", "verbal"];

// Cogni Measurement index keys -> archetype axis ids.
export const INDEX_TO_AXIS = {
  vci: "verbal",     // Verbal Comprehension
  fri: "reasoning",  // Fluid Reasoning
  vsi: "spatial",    // Visual Spatial
  qri: "numerical",  // Quantitative Reasoning
  wmi: "memory",     // Working Memory
  psi: "speed"       // Processing Speed
};

// How close the top and bottom axis have to be for a profile to read as
// "balanced" rather than led by a pair. In index-score points (SD = 15), so 10
// is about two thirds of a standard deviation. Exported so it can be tuned.
export const BALANCED_THRESHOLD = 10;

/**
 * Derive the archetype key for a set of axis scores.
 *
 * @param {Record<string, number>} axisScores  axis id -> normalized score
 * @param {{ threshold?: number }} [opts]
 * @returns {string} "balanced", or two axis ids joined alphabetically with "+".
 *
 * Ties are broken deterministically by axis id (ascending), so the same input
 * always yields the same key regardless of object insertion order.
 */
export function deriveArchetype(axisScores = {}, { threshold = BALANCED_THRESHOLD } = {}) {
  const ranked = Object.entries(axisScores)
    .filter(([, score]) => Number.isFinite(score))
    // Score descending; equal scores fall back to axis id ascending.
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  if (ranked.length < 2) return "balanced";

  const spread = ranked[0][1] - ranked[ranked.length - 1][1];
  if (spread < threshold) return "balanced";

  // The key names the two leaders alphabetically, independent of which scored
  // higher — "reasoning+speed", never "speed+reasoning".
  return [ranked[0][0], ranked[1][0]].sort().join("+");
}

/**
 * Map a session's CHC indices ({ vci: { score }, ... }) to axis scores keyed by
 * friendly axis id, then derive the archetype. Returns null if too little was
 * measured to name one.
 */
export function archetypeForIndices(indices = {}, opts) {
  const axisScores = {};
  for (const [indexKey, axisId] of Object.entries(INDEX_TO_AXIS)) {
    const score = indices?.[indexKey]?.score;
    if (Number.isFinite(score)) axisScores[axisId] = score;
  }
  if (Object.keys(axisScores).length < 2) return null;
  return deriveArchetype(axisScores, opts);
}
