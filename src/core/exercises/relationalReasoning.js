import { CognitiveDomain } from "../domains.js";

const MEANINGFUL_WORDS = ["atlas", "nova", "river", "stone", "ember", "orbit", "signal", "field", "vector", "prism"];
const EMOJI_WORDS = ["☀️", "🌙", "⭐", "⚡", "🌊", "🍃", "💎", "🔥", "☁️", "☄️"];
const SPATIAL_DIRECTIONS = [
  { label: "north of", dx: 0, dy: 1 },
  { label: "south of", dx: 0, dy: -1 },
  { label: "east of", dx: 1, dy: 0 },
  { label: "west of", dx: -1, dy: 0 },
  { label: "north-east of", dx: 1, dy: 1 },
  { label: "north-west of", dx: -1, dy: 1 },
  { label: "south-east of", dx: 1, dy: -1 },
  { label: "south-west of", dx: -1, dy: -1 }
];
const SPATIAL_3D_DIRECTIONS = [
  ...SPATIAL_DIRECTIONS.map((direction) => ({ ...direction, dz: 0 })),
  { label: "above and north of", dx: 0, dy: 1, dz: 1 },
  { label: "above and south of", dx: 0, dy: -1, dz: 1 },
  { label: "above and east of", dx: 1, dy: 0, dz: 1 },
  { label: "above and west of", dx: -1, dy: 0, dz: 1 },
  { label: "below and north of", dx: 0, dy: 1, dz: -1 },
  { label: "below and south of", dx: 0, dy: -1, dz: -1 },
  { label: "below and east of", dx: 1, dy: 0, dz: -1 },
  { label: "below and west of", dx: -1, dy: 0, dz: -1 }
];
const DEFAULT_MODE_SETTINGS = {
  distinction: { enabled: true, premiseCount: null, timerSeconds: null, priority: 150 },
  linear: { enabled: true, premiseCount: null, timerSeconds: null, priority: 100, rotate180: false },
  space2d: { enabled: true, premiseCount: null, timerSeconds: null, priority: 100 },
  space3d: { enabled: false, premiseCount: null, timerSeconds: null, priority: 100 }
};

export function createRelationalReasoningConfig(overrides = {}) {
  return {
    id: "relational-reasoning-training-v1",
    title: "Relational Reasoning Training",
    domain: CognitiveDomain.REASONING,
    mode: "mixed",
    premiseCount: 2,
    trialCount: 12,
    timerEnabled: true,
    timerSeconds: 30,
    vocabulary: "nonsense",
    vocabularies: null,
    nonsenseLength: 3,
    garbageLength: 3,
    autoProgression: true,
    modeSettings: DEFAULT_MODE_SETTINGS,
    connectionBranching: true,
    spoilerConclusion: false,
    visualNoiseSplits: 0,
    scrambleFactor: 80,
    dailyTargetMinutes: 10,
    weeklyTargetMinutes: 0,
    ...overrides
  };
}

export function generateRrtTrial(config = createRelationalReasoningConfig(), random = Math.random) {
  const normalized = normalizeConfig(config);
  const mode = normalized.mode === "mixed" ? pickWeightedMode(normalized, random) : normalized.mode;
  const modeConfig = normalized.modeSettings[mode] ?? DEFAULT_MODE_SETTINGS[mode] ?? {};
  const trialConfig = {
    ...normalized,
    premiseCount: modeConfig.premiseCount ?? normalized.premiseCount,
    timerSeconds: modeConfig.timerSeconds ?? normalized.timerSeconds
  };
  if (mode === "distinction") return generateDistinctionTrial(trialConfig, random);
  if (mode === "space2d") return generateSpace2dTrial(trialConfig, random);
  if (mode === "space3d") return generateSpace3dTrial(trialConfig, random);
  return generateLinearTrial(trialConfig, random);
}

export function scoreRrtAnswer(trial, answer, reactionTimeMs = null) {
  const correct = Boolean(answer) === trial.isTrue;
  return {
    mode: trial.mode,
    premiseCount: trial.premiseCount,
    correct,
    expected: trial.isTrue,
    answer: Boolean(answer),
    reactionTimeMs
  };
}

export function nextRrtConfig(config, recentResults) {
  if (!config.autoProgression || recentResults.length < 3) return { ...config };
  const lastThree = recentResults.slice(-3);
  const allCorrect = lastThree.every((result) => result.correct);
  const mostlyWrong = lastThree.filter((result) => result.correct).length <= 1;
  if (allCorrect) return { ...config, premiseCount: Math.min(config.premiseCount + 1, 6) };
  if (mostlyWrong) return { ...config, premiseCount: Math.max(config.premiseCount - 1, 2) };
  return { ...config };
}

function generateDistinctionTrial(config, random) {
  const terms = createTerms(config, config.premiseCount + 1, random);
  const values = [random() > 0.5];
  for (let index = 1; index < terms.length; index += 1) values[index] = random() > 0.5;
  const premises = [];
  for (let index = 0; index < config.premiseCount; index += 1) {
    premises.push(`${terms[index]} is ${values[index] === values[index + 1] ? "same as" : "opposite of"} ${terms[index + 1]}`);
  }
  const actualSame = values[0] === values[values.length - 1];
  const isTrue = random() > 0.5;
  const conclusionSame = isTrue ? actualSame : !actualSame;

  return {
    mode: "distinction",
    premises,
    conclusion: `${terms[0]} is ${conclusionSame ? "same as" : "opposite of"} ${terms[terms.length - 1]}`,
    isTrue,
    premiseCount: config.premiseCount,
    timerSeconds: config.timerSeconds
  };
}

function generateLinearTrial(config, random) {
  const terms = createTerms(config, config.premiseCount + 1, random);
  const positions = [0];
  const premises = [];
  for (let index = 0; index < config.premiseCount; index += 1) {
    const direction = random() > 0.5 ? -1 : 1;
    positions[index + 1] = positions[index] - direction;
    premises.push(`${terms[index]} is ${direction < 0 ? "left of" : "right of"} ${terms[index + 1]}`);
  }
  const actualLeft = positions[0] < positions[positions.length - 1];
  const isTrue = random() > 0.5;
  const conclusionLeft = isTrue ? actualLeft : !actualLeft;

  return {
    mode: "linear",
    premises,
    conclusion: `${terms[0]} is ${conclusionLeft ? "left of" : "right of"} ${terms[terms.length - 1]}`,
    isTrue,
    premiseCount: config.premiseCount,
    timerSeconds: config.timerSeconds
  };
}

function generateSpace2dTrial(config, random) {
  const terms = createTerms(config, config.premiseCount + 1, random);
  const positions = [{ x: 0, y: 0 }];
  const premises = [];
  for (let index = 0; index < config.premiseCount; index += 1) {
    const direction = pick(SPATIAL_DIRECTIONS, random);
    positions[index + 1] = {
      x: positions[index].x - direction.dx,
      y: positions[index].y - direction.dy
    };
    premises.push(`${terms[index]} is ${direction.label} ${terms[index + 1]}`);
  }
  const dx = Math.sign(positions[0].x - positions[positions.length - 1].x);
  const dy = Math.sign(positions[0].y - positions[positions.length - 1].y);
  const actual = SPATIAL_DIRECTIONS.find((direction) => direction.dx === dx && direction.dy === dy)
    ?? SPATIAL_DIRECTIONS[0];
  const isTrue = random() > 0.5;
  const conclusionDirection = isTrue ? actual : pick(SPATIAL_DIRECTIONS.filter((direction) => direction !== actual), random);

  return {
    mode: "space2d",
    premises,
    conclusion: `${terms[0]} is ${conclusionDirection.label} ${terms[terms.length - 1]}`,
    isTrue,
    premiseCount: config.premiseCount,
    timerSeconds: config.timerSeconds
  };
}

function generateSpace3dTrial(config, random) {
  const terms = createTerms(config, config.premiseCount + 1, random);
  const positions = [{ x: 0, y: 0, z: 0 }];
  const premises = [];
  for (let index = 0; index < config.premiseCount; index += 1) {
    const direction = pick(SPATIAL_3D_DIRECTIONS, random);
    positions[index + 1] = {
      x: positions[index].x - direction.dx,
      y: positions[index].y - direction.dy,
      z: positions[index].z - direction.dz
    };
    premises.push(`${terms[index]} is ${direction.label} ${terms[index + 1]}`);
  }
  const dx = Math.sign(positions[0].x - positions[positions.length - 1].x);
  const dy = Math.sign(positions[0].y - positions[positions.length - 1].y);
  const dz = Math.sign(positions[0].z - positions[positions.length - 1].z);
  const actual = SPATIAL_3D_DIRECTIONS.find((direction) => direction.dx === dx && direction.dy === dy && direction.dz === dz)
    ?? SPATIAL_3D_DIRECTIONS[0];
  const isTrue = random() > 0.5;
  const conclusionDirection = isTrue ? actual : pick(SPATIAL_3D_DIRECTIONS.filter((direction) => direction !== actual), random);

  return {
    mode: "space3d",
    premises,
    conclusion: `${terms[0]} is ${conclusionDirection.label} ${terms[terms.length - 1]}`,
    isTrue,
    premiseCount: config.premiseCount,
    timerSeconds: config.timerSeconds
  };
}

function normalizeConfig(config) {
  const modeSettings = normalizeModeSettings(config.modeSettings);
  return {
    ...config,
    modeSettings,
    premiseCount: clamp(Math.round(config.premiseCount), 2, 6),
    trialCount: clamp(Math.round(config.trialCount), 1, 60),
    vocabularies: normalizeVocabularies(config),
    nonsenseLength: clamp(Math.round(config.nonsenseLength), 2, 8),
    garbageLength: clamp(Math.round(config.garbageLength ?? config.nonsenseLength), 2, 12)
  };
}

function createTerms(config, count, random) {
  const vocabularies = config.vocabularies?.length ? config.vocabularies : [config.vocabulary ?? "nonsense"];
  const candidates = vocabularies.flatMap((vocabulary) => createTermCandidates(vocabulary, count, config, random));
  const terms = uniqueTerms(shuffle(candidates, random)).slice(0, count);
  while (terms.length < count) {
    const term = createSingleTerm(pick(vocabularies, random), config, random);
    terms.push(terms.includes(term) ? `${term}${terms.length + 1}` : term);
  }
  return terms;
}

function uniqueTerms(terms) {
  return terms.filter((term, index, list) => list.indexOf(term) === index);
}

function normalizeVocabularies(config) {
  const values = Array.isArray(config.vocabularies) && config.vocabularies.length
    ? config.vocabularies
    : [config.vocabulary ?? "nonsense"];
  const valid = new Set(["nonsense", "garbage", "meaningful", "emoji"]);
  const normalized = values.filter((value, index, list) => valid.has(value) && list.indexOf(value) === index);
  return normalized.length ? normalized : ["nonsense"];
}

function createTermCandidates(vocabulary, count, config, random) {
  if (vocabulary === "meaningful") return shuffle(MEANINGFUL_WORDS, random);
  if (vocabulary === "emoji") return shuffle(EMOJI_WORDS, random);
  return Array.from({ length: count }, () => createSingleTerm(vocabulary, config, random));
}

function createSingleTerm(vocabulary, config, random) {
  if (vocabulary === "garbage") return garbageWord(config.garbageLength, random);
  if (vocabulary === "meaningful") return pick(MEANINGFUL_WORDS, random);
  if (vocabulary === "emoji") return pick(EMOJI_WORDS, random);
  return nonsenseWord(config.nonsenseLength, random);
}

function nonsenseWord(length, random) {
  const letters = "BCDFGHJKLMNPQRSTVWXYZ";
  const vowels = "AEIOU";
  let word = "";
  for (let index = 0; index < length; index += 1) {
    const source = index % 2 === 0 ? letters : vowels;
    word += source[Math.floor(random() * source.length)];
  }
  return word;
}

function garbageWord(length, random) {
  const characters = "BCDFGHJKLMNPQRSTVWXYZ0123456789";
  return Array.from({ length }, () => characters[Math.floor(random() * characters.length)]).join("");
}

function pickWeightedMode(config, random) {
  const enabled = Object.entries(config.modeSettings)
    .filter(([, setting]) => setting.enabled)
    .map(([mode, setting]) => ({ mode, weight: Math.max(1, setting.priority) }));
  const pool = enabled.length ? enabled : [{ mode: "distinction", weight: 1 }];
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item.mode;
  }
  return pool[0].mode;
}

function normalizeModeSettings(settings = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_MODE_SETTINGS).map(([mode, defaults]) => {
    const setting = settings[mode] ?? {};
    return [mode, {
      ...defaults,
      ...setting,
      premiseCount: setting.premiseCount ? clamp(Math.round(setting.premiseCount), 2, 6) : null,
      timerSeconds: setting.timerSeconds ? clamp(Math.round(setting.timerSeconds), 5, 90) : null,
      priority: clamp(Math.round(setting.priority ?? defaults.priority), 1, 300),
      enabled: Boolean(setting.enabled)
    }];
  }));
}

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
