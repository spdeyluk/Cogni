import { CognitiveDomain } from "../domains.js";
import { scoreSignalDetection } from "../scoring.js";

export const MODALITIES = Object.freeze(["position", "color", "shape", "audio"]);

export const STIMULUS_SETS = Object.freeze({
  positions: ["0", "1", "2", "3", "5", "6", "7", "8"],
  colorsBasic: ["#ff4d6d", "#40c057", "#4dabf7", "#ffd43b", "#845ef7", "#ff922b"],
  colorsGradient: ["#ff4d6d", "#15aabf", "#ffd43b", "#845ef7", "#51cf66", "#f06595"],
  colorsVoronoi: ["#f03e3e", "#1098ad", "#fab005", "#7048e8", "#2f9e44", "#e8590c"],
  colorsArt: ["#ff006e", "#3a86ff", "#ffbe0b", "#8338ec", "#06d6a0", "#fb5607"],
  shapesBasic: ["circle", "square", "triangle", "diamond", "cross", "ring"],
  shapesTetris: ["tee", "ell", "zig", "bar", "block", "corner"],
  shapesIconsA: ["bolt", "moon", "plus", "target", "wave", "spark"],
  shapesIconsB: ["leaf", "drop", "shield", "pin", "gear", "flag"],
  shapesAll: ["circle", "square", "triangle", "diamond", "cross", "ring", "tee", "ell", "zig", "bar", "bolt", "moon"],
  audioLetters1: ["B", "K", "M", "R", "S", "T"],
  audioLetters2: ["D", "F", "L", "N", "P", "V"],
  audioLetters3: ["A", "C", "E", "G", "H", "Q"],
  audioLetters4: ["J", "O", "U", "W", "X", "Y"],
  audioNumbers: ["one", "two", "three", "four", "five", "six"],
  audioNato: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"],
  audio5Syllables: ["baba", "doku", "lima", "pato", "senu"],
  audio10Syllables: ["baba", "doku", "lima", "pato", "senu", "mavi", "kora", "telu", "riso", "zafa"]
});

export function createQuadNBackConfig(overrides = {}) {
  return {
    id: "quad-n-back-training-v1",
    title: "Quad N-Back Training",
    domain: CognitiveDomain.WORKING_MEMORY,
    n: 2,
    trialCount: 35,
    activeModalities: ["position", "color", "shape", "audio"],
    matchChance: 0.25,
    interferenceChance: 0.2,
    stimulusSets: {
      color: "colorsBasic",
      shape: "shapesBasic",
      audio: "audioLetters1"
    },
    ...overrides
  };
}

export function generateQuadNBackTrials(config = createQuadNBackConfig(), random = Math.random) {
  const normalized = normalizeConfig(config);
  const trials = [];

  for (let trialIndex = 0; trialIndex < normalized.trialCount; trialIndex += 1) {
    const cues = {};
    const targets = {};
    const lures = {};

    for (const modality of MODALITIES) {
      const values = valuesForModality(normalized, modality);
      const canTarget = trialIndex >= normalized.n;
      const shouldTarget = normalized.activeModalities.includes(modality) && canTarget && random() < normalized.matchChance;
      const shouldLure = !shouldTarget && canTarget && random() < normalized.interferenceChance;
      const targetValue = canTarget ? trials[trialIndex - normalized.n].cues[modality] : null;
      const lureValue = pickLureValue(trials, trialIndex, normalized.n, modality, targetValue, random);

      cues[modality] = pickCueValue({
        values,
        shouldTarget,
        shouldLure,
        targetValue,
        lureValue,
        random
      });
      targets[modality] = shouldTarget;
      lures[modality] = !shouldTarget && cues[modality] === lureValue && cueCanBeLure(targetValue, lureValue);
    }

    trials.push({
      trialIndex,
      n: normalized.n,
      cues,
      targets,
      lures,
      activeModalities: [...normalized.activeModalities]
    });
  }

  return trials;
}

export function scoreQuadNBackSession(trialResults, activeModalities = MODALITIES) {
  const byModality = {};
  const totals = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
  const responseTimes = [];

  for (const modality of activeModalities) {
    const counts = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };

    for (const trial of trialResults) {
      const isTarget = Boolean(trial.targets?.[modality]);
      const responded = Boolean(trial.responses?.[modality]);

      if (isTarget && responded) counts.hits += 1;
      if (isTarget && !responded) counts.misses += 1;
      if (!isTarget && responded) counts.falseAlarms += 1;
      if (!isTarget && !responded) counts.correctRejections += 1;

      const rt = trial.reactionTimesMs?.[modality];
      if (responded && Number.isFinite(rt)) responseTimes.push(rt);
    }

    byModality[modality] = {
      ...counts,
      ...scoreSignalDetection(counts)
    };

    totals.hits += counts.hits;
    totals.misses += counts.misses;
    totals.falseAlarms += counts.falseAlarms;
    totals.correctRejections += counts.correctRejections;
  }

  const totalDecisions = totals.hits + totals.misses + totals.falseAlarms + totals.correctRejections;
  const correct = totals.hits + totals.correctRejections;

  return {
    ...totals,
    accuracy: totalDecisions > 0 ? round(correct / totalDecisions) : 0,
    ...scoreSignalDetection(totals),
    brainWorkshopContribution: round((trialResults[0]?.n ?? 1) - 1 + (totalDecisions > 0 ? correct / totalDecisions : 0)),
    meanReactionTimeMs: mean(responseTimes),
    byModality
  };
}

function normalizeConfig(config) {
  const activeModalities = config.activeModalities.filter((modality) => MODALITIES.includes(modality));
  return {
    ...config,
    activeModalities: activeModalities.length ? activeModalities : ["position"]
  };
}

function valuesForModality(config, modality) {
  if (modality === "position") return STIMULUS_SETS.positions;
  return STIMULUS_SETS[config.stimulusSets[modality]];
}

function pickCueValue({ values, shouldTarget, shouldLure, targetValue, lureValue, random }) {
  if (shouldTarget) return targetValue;
  if (shouldLure && cueCanBeLure(targetValue, lureValue)) return lureValue;

  const options = values.filter((value) => value !== targetValue);
  return options[Math.floor(random() * options.length)] ?? values[0];
}

function pickLureValue(trials, trialIndex, n, modality, targetValue, random) {
  const lureOffsets = [n - 1, n + 1, n * 2]
    .filter((offset) => offset > 0 && trialIndex - offset >= 0);
  const candidates = lureOffsets
    .map((offset) => trials[trialIndex - offset].cues[modality])
    .filter((value) => cueCanBeLure(targetValue, value));
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

function cueCanBeLure(targetValue, lureValue) {
  return lureValue !== null && lureValue !== undefined && lureValue !== targetValue;
}

function mean(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
