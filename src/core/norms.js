import { clamp, normalCdf } from "./math.js";

export function betaBellCurveEstimate(criterionScore) {
  const z = (clamp(criterionScore, 0, 100) - 78) / 18;
  const standardScore = Math.round(100 + z * 15);
  const percentile = Math.round(normalCdf(z) * 1000) / 10;

  return {
    label: "Beta bell-curve estimate",
    standardScore,
    percentile,
    mean: 100,
    standardDeviation: 15,
    caveat: "Estimated from criterion score only. Not a real population norm yet."
  };
}
