import { CognitiveDomain } from "../domains.js";

export const UFOV_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const UFOV_CENTER_SYMBOLS = ["●", "▲", "■", "◆"];

export function createUfovConfig(overrides = {}) {
  return {
    id: "useful-field-of-view-v1",
    title: "Useful Field of View",
    domain: CognitiveDomain.ATTENTION_CONTROL,
    trialCount: 16,
    stimulusDurationMs: 900,
    minStimulusDurationMs: 180,
    distractorCount: 20,
    peripheralTargets: 1,
    autoProgression: true,
    advanceStreak: 5,
    regressStreak: 3,
    speedIncreasePercent: 20,
    speedDecreasePercent: 20,
    ...overrides
  };
}

export function createUfovTrial(config = createUfovConfig(), random = Math.random) {
  const targetSector = UFOV_SECTORS[Math.floor(random() * UFOV_SECTORS.length)];
  const centerSymbol = UFOV_CENTER_SYMBOLS[Math.floor(random() * UFOV_CENTER_SYMBOLS.length)];
  return {
    centerSymbol,
    centerChoices: shuffle(UFOV_CENTER_SYMBOLS, random),
    targetSector,
    distractors: createDistractors(config.distractorCount, targetSector, random)
  };
}

export function scoreUfovTrial(trial, answer, reactionTimeMs = null) {
  const centerCorrect = answer.centerSymbol === trial.centerSymbol;
  const sectorCorrect = answer.targetSector === trial.targetSector;
  return {
    correct: centerCorrect && sectorCorrect,
    centerCorrect,
    sectorCorrect,
    expectedCenter: trial.centerSymbol,
    expectedSector: trial.targetSector,
    answeredCenter: answer.centerSymbol ?? null,
    answeredSector: answer.targetSector ?? null,
    reactionTimeMs
  };
}

export function nextUfovConfig(config, results) {
  if (!config.autoProgression) return { ...config };
  const streak = currentUfovStreak(results);
  const duration = Number(config.stimulusDurationMs) || 900;
  if (streak.correct >= config.advanceStreak) {
    return {
      ...config,
      stimulusDurationMs: Math.max(
        config.minStimulusDurationMs,
        Math.round(duration * (1 - config.speedIncreasePercent / 100))
      )
    };
  }
  if (streak.wrong >= config.regressStreak) {
    return {
      ...config,
      stimulusDurationMs: Math.round(duration * (1 + config.speedDecreasePercent / 100))
    };
  }
  return { ...config };
}

export function currentUfovStreak(results) {
  let correct = 0;
  let wrong = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index].correct) {
      if (wrong > 0) break;
      correct += 1;
    } else {
      if (correct > 0) break;
      wrong += 1;
    }
  }
  return { correct, wrong };
}

function createDistractors(count, targetSector, random) {
  const distractors = [];
  for (let index = 0; index < count; index += 1) {
    distractors.push({
      sector: UFOV_SECTORS[Math.floor(random() * UFOV_SECTORS.length)],
      x: randomBetween(12, 88, random),
      y: randomBetween(12, 88, random),
      symbol: random() > 0.5 ? "+" : "·"
    });
  }
  return distractors.filter((item) => item.sector !== targetSector || random() > 0.35);
}

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomBetween(min, max, random) {
  return min + (max - min) * random();
}
