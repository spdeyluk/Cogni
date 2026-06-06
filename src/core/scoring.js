import { clamp, dPrime, median, round, standardDeviation } from "./math.js";
import { ScoreKind } from "./domains.js";

export const defaultAssessmentWeights = Object.freeze({
  accuracy: 0.55,
  difficulty: 0.25,
  speed: 0.1,
  consistency: 0.1
});

export function scoreCriterionAssessment({
  correct,
  total,
  difficultyRatio,
  reactionTimesMs,
  expectedMedianMs,
  weights = defaultAssessmentWeights
}) {
  const accuracy = total > 0 ? correct / total : 0;
  const medianRt = median(reactionTimesMs);
  const rtSd = standardDeviation(reactionTimesMs);
  const speed = medianRt > 0 ? clamp((expectedMedianMs / medianRt) ** 1.6, 0, 1) : 0;
  const consistency = medianRt > 0 ? clamp(1 - rtSd / medianRt, 0, 1) : 0;

  const raw =
    accuracy * weights.accuracy +
    clamp(difficultyRatio) * weights.difficulty +
    speed * weights.speed +
    consistency * weights.consistency;

  return {
    kind: ScoreKind.CRITERION,
    score: Math.round(clamp(raw, 0, 1) * 100),
    components: {
      accuracy: round(accuracy),
      difficultyReached: round(clamp(difficultyRatio)),
      difficultyReachedPercent: Math.round(clamp(difficultyRatio) * 100),
      speed: round(speed),
      speedPercent: Math.round(speed * 100),
      consistency: round(consistency),
      consistencyPercent: Math.round(consistency * 100),
      medianReactionTimeMs: Math.round(medianRt),
      reactionTimeSdMs: Math.round(rtSd)
    },
    weights,
    contributionPoints: {
      accuracy: Math.round(accuracy * weights.accuracy * 100),
      difficulty: Math.round(clamp(difficultyRatio) * weights.difficulty * 100),
      speed: Math.round(speed * weights.speed * 100),
      consistency: Math.round(consistency * weights.consistency * 100)
    }
  };
}

export function scoreSignalDetection({ hits, misses, falseAlarms, correctRejections }) {
  const targetCount = hits + misses;
  const nonTargetCount = falseAlarms + correctRejections;
  const hitRate = adjustedRate(hits, targetCount);
  const falseAlarmRate = adjustedRate(falseAlarms, nonTargetCount);

  return {
    hitRate: round(hitRate),
    falseAlarmRate: round(falseAlarmRate),
    dPrime: round(dPrime(hitRate, falseAlarmRate))
  };
}

function adjustedRate(count, total) {
  if (total <= 0) return 0.5;
  return (count + 0.5) / (total + 1);
}

export function progressScore({ baselineAverage, currentAverage }) {
  return round(currentAverage - baselineAverage);
}
