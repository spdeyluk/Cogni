import { CognitiveDomain } from "../domains.js";
import { scoreSignalDetection } from "../scoring.js";

const DEFAULT_STIMULI = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function createNBackConfig(overrides = {}) {
  return {
    id: "n-back-training-v1",
    title: "N-Back Training",
    domain: CognitiveDomain.WORKING_MEMORY,
    n: 2,
    trialCount: 24,
    minTrials: 20,
    targetProbability: 0.28,
    stimuli: DEFAULT_STIMULI,
    ...overrides
  };
}

export function generateNBackTrials(config = createNBackConfig(), random = Math.random) {
  const trials = [];

  for (let index = 0; index < config.trialCount; index += 1) {
    const canBeTarget = index >= config.n;
    const shouldTarget = canBeTarget && random() < config.targetProbability;
    const stimulus = shouldTarget
      ? trials[index - config.n].stimulus
      : pickNonMatchingStimulus(config.stimuli, canBeTarget ? trials[index - config.n].stimulus : null, random);

    trials.push({
      trialIndex: index,
      stimulus,
      isTarget: shouldTarget,
      n: config.n,
      domain: config.domain
    });
  }

  return trials;
}

export function scoreNBackSession(trialResults) {
  const counts = trialResults.reduce(
    (acc, trial) => {
      if (trial.isTarget && trial.userResponded) acc.hits += 1;
      if (trial.isTarget && !trial.userResponded) acc.misses += 1;
      if (!trial.isTarget && trial.userResponded) acc.falseAlarms += 1;
      if (!trial.isTarget && !trial.userResponded) acc.correctRejections += 1;
      return acc;
    },
    { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }
  );

  const totalCorrect = counts.hits + counts.correctRejections;
  const accuracy = trialResults.length > 0 ? totalCorrect / trialResults.length : 0;

  return {
    ...counts,
    accuracy: Math.round(accuracy * 100) / 100,
    ...scoreSignalDetection(counts)
  };
}

function pickNonMatchingStimulus(stimuli, forbiddenStimulus, random) {
  const options = forbiddenStimulus
    ? stimuli.filter((stimulus) => stimulus !== forbiddenStimulus)
    : stimuli;
  return options[Math.floor(random() * options.length)];
}

