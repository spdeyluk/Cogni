import { CognitiveDomain } from "../domains.js";
import { betaBellCurveEstimate } from "../norms.js";

export function scoreWorkingMemoryBattery(results) {
  const subtestWeights = {
    visualSequenceSpan: 0.32,
    spatialSpan: 0.32,
    operationSpan: 0.36
  };

  const score =
    results.visualSequenceSpan.score * subtestWeights.visualSequenceSpan +
    results.spatialSpan.score * subtestWeights.spatialSpan +
    results.operationSpan.score * subtestWeights.operationSpan;

  return {
    domain: CognitiveDomain.WORKING_MEMORY,
    scoringModelVersion: "working-memory-v1",
    score: Math.round(score),
    betaBellCurve: betaBellCurveEstimate(Math.round(score)),
    subtestWeights,
    subtests: results
  };
}

export function scoreAttentionControlBattery(results) {
  const subtestWeights = {
    goNoGo: 0.34,
    flankerTask: 0.33,
    sustainedAttention: 0.33
  };

  const score =
    results.goNoGo.score * subtestWeights.goNoGo +
    results.flankerTask.score * subtestWeights.flankerTask +
    results.sustainedAttention.score * subtestWeights.sustainedAttention;

  return {
    domain: CognitiveDomain.ATTENTION_CONTROL,
    scoringModelVersion: "attention-control-v1",
    score: Math.round(score),
    betaBellCurve: betaBellCurveEstimate(Math.round(score)),
    subtestWeights,
    subtests: results
  };
}

export function scoreGenericDomainBattery(domain, results) {
  const entries = Object.values(results);
  const score = entries.reduce((sum, result) => sum + result.score, 0) / Math.max(1, entries.length);

  return {
    domain,
    scoringModelVersion: `${domain}-v1`,
    score: Math.round(score),
    betaBellCurve: betaBellCurveEstimate(Math.round(score)),
    subtests: results
  };
}
