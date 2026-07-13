export const ADHD_SYMPTOM_THRESHOLD = 3;
export const ADHD_PROFILE_THRESHOLD = 6;
export const ADHD_FUNCTIONAL_IMPACT_THRESHOLD = 2;

export function scoreAdhdScreening({ answers, symptomsPresentSixMonths, symptomsBeforeAgeTwelve }) {
  if (!Array.isArray(answers) || answers.length !== 45) {
    throw new Error("ADHD screening requires 45 rating answers.");
  }

  const inattentivePositive = countPositiveSymptoms(answers.slice(0, 18));
  const hyperactiveImpulsivePositive = countPositiveSymptoms(answers.slice(18, 39));
  const functionalImpactAverage = average(answers.slice(39, 45));
  const meetsInattentive = inattentivePositive >= ADHD_PROFILE_THRESHOLD;
  const meetsHyperactiveImpulsive = hyperactiveImpulsivePositive >= ADHD_PROFILE_THRESHOLD;
  const profile = determineProfile(meetsInattentive, meetsHyperactiveImpulsive);
  const meetsFunctionalImpact = functionalImpactAverage >= ADHD_FUNCTIONAL_IMPACT_THRESHOLD;
  const meetsClinicalStyleScreen = profile !== "none"
    && meetsFunctionalImpact
    && symptomsPresentSixMonths
    && symptomsBeforeAgeTwelve;
  const simpleScore = Math.round(
    ((inattentivePositive / 18) * 0.4
      + (hyperactiveImpulsivePositive / 21) * 0.4
      + (functionalImpactAverage / 4) * 0.2) * 100
  );

  return {
    inattentivePositive,
    hyperactiveImpulsivePositive,
    functionalImpactAverage,
    profile,
    meetsFunctionalImpact,
    meetsClinicalStyleScreen,
    simpleScore,
    simpleConclusion: simpleScore >= 60 ? "High" : simpleScore >= 30 ? "Moderate" : "Low"
  };
}

function countPositiveSymptoms(scores) {
  return scores.filter((score) => Number(score) >= ADHD_SYMPTOM_THRESHOLD).length;
}

function average(scores) {
  return scores.reduce((sum, score) => sum + Number(score), 0) / scores.length;
}

function determineProfile(meetsInattentive, meetsHyperactiveImpulsive) {
  if (meetsInattentive && meetsHyperactiveImpulsive) return "combined";
  if (meetsInattentive) return "inattentive";
  if (meetsHyperactiveImpulsive) return "hyperactive-impulsive";
  return "none";
}
