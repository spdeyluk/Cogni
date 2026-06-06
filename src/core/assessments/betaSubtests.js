import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment } from "../scoring.js";

const betaDefinitions = {
  "matrix-reasoning": {
    title: "Matrix Reasoning",
    domain: CognitiveDomain.REASONING,
    expectedMedianMs: 9000,
    instructions: [
      "Find the rule in the pattern.",
      "Choose the option that best completes the sequence.",
      "Harder items count more than easier items."
    ],
    trials: [
      choice("2, 4, 6, ?", ["7", "8", "10", "12"], "8", 1),
      choice("3, 6, 12, ?", ["15", "18", "21", "24"], "24", 2),
      choice("1, 4, 9, 16, ?", ["20", "24", "25", "32"], "25", 3),
      choice("A1, B2, C3, ?", ["D3", "D4", "E4", "C4"], "D4", 4),
      choice("▲●, ▲●●, ▲▲●●, ?", ["▲▲●", "▲▲●●●", "▲●●●", "▲▲▲●"], "▲▲●●●", 5)
    ]
  },
  "rule-induction": {
    title: "Rule Induction",
    domain: CognitiveDomain.REASONING,
    expectedMedianMs: 8500,
    instructions: [
      "Infer the rule from the examples.",
      "Choose the item that follows the same rule.",
      "Focus on structure, not surface similarity."
    ],
    trials: [
      choice("Rule examples: 12 -> 21, 45 -> 54. Which fits?", ["67 -> 76", "67 -> 68", "67 -> 77", "67 -> 56"], "67 -> 76", 1),
      choice("Rule examples: AB -> BC, CD -> DE. Which fits?", ["FG -> GH", "FG -> HI", "FG -> GF", "FG -> EF"], "FG -> GH", 2),
      choice("Rule examples: 2 -> 6, 4 -> 12. Which fits?", ["5 -> 10", "5 -> 15", "5 -> 20", "5 -> 25"], "5 -> 15", 3),
      choice("Rule examples: red small circle -> red large circle. What changes?", ["color", "shape", "size", "number"], "size", 4),
      choice("Rule examples: 1-3-6, 2-4-8. Complete 3-5-?", ["7", "8", "9", "10"], "10", 5)
    ]
  },
  "relational-comparison": {
    title: "Relational Comparison",
    domain: CognitiveDomain.REASONING,
    expectedMedianMs: 8000,
    instructions: [
      "Compare relationships between items.",
      "Choose the option with the same relationship.",
      "This measures relational reasoning rather than memory."
    ],
    trials: [
      choice("Hot is to cold as up is to ?", ["high", "down", "left", "sky"], "down", 1),
      choice("Finger is to hand as toe is to ?", ["shoe", "leg", "foot", "walk"], "foot", 2),
      choice("Seed is to tree as idea is to ?", ["thought", "plan", "book", "project"], "project", 3),
      choice("More is to less as expand is to ?", ["grow", "contract", "open", "wide"], "contract", 4),
      choice("Map is to territory as model is to ?", ["scale", "object", "paper", "copy"], "object", 5)
    ]
  },
  "mental-rotation": {
    title: "Mental Rotation",
    domain: CognitiveDomain.SPATIAL_REASONING,
    expectedMedianMs: 6500,
    instructions: [
      "Mentally rotate the shape.",
      "Choose the matching rotated version.",
      "Do not choose mirrored versions."
    ],
    trials: [
      choice("Rotate L clockwise.", ["┌", "┐", "└", "┘"], "┐", 1),
      choice("Rotate ↑ 90° clockwise.", ["←", "→", "↓", "↑"], "→", 2),
      choice("Rotate F 180°.", ["F", "ᖷ", "ⅎ", "Ⅎ"], "Ⅎ", 3),
      choice("Rotate └ clockwise.", ["┌", "┐", "└", "┘"], "┌", 4),
      choice("Rotate → 270° clockwise.", ["↑", "↓", "←", "→"], "↑", 5)
    ]
  },
  "grid-transformation": {
    title: "Grid Transformation",
    domain: CognitiveDomain.SPATIAL_REASONING,
    expectedMedianMs: 7000,
    instructions: [
      "Track how a position changes on a grid.",
      "Choose the final location.",
      "Rows and columns are numbered 1 to 3.",
      "You will see a grid guide before the questions begin."
    ],
    trials: [
      choice("Start R1C1. Move right.", ["R1C2", "R2C1", "R1C3", "R3C1"], "R1C2", 1),
      choice("Start R2C2. Move up then left.", ["R1C1", "R1C2", "R2C1", "R3C3"], "R1C1", 2),
      choice("Start R3C1. Mirror horizontally.", ["R3C3", "R1C3", "R3C2", "R1C1"], "R3C3", 3),
      choice("Start R1C3. Move down twice.", ["R2C3", "R3C3", "R3C1", "R1C1"], "R3C3", 4),
      choice("Start R2C1. Rotate grid 180°.", ["R2C3", "R1C2", "R3C2", "R2C1"], "R2C3", 5)
    ]
  },
  "perspective-taking": {
    title: "Perspective Taking",
    domain: CognitiveDomain.SPATIAL_REASONING,
    expectedMedianMs: 7500,
    instructions: [
      "Imagine facing a different direction.",
      "Choose what would be on your left or right from that perspective.",
      "This measures spatial viewpoint shifting."
    ],
    trials: [
      choice("Facing north, your right is?", ["north", "south", "east", "west"], "east", 1),
      choice("Facing east, your left is?", ["north", "south", "east", "west"], "north", 2),
      choice("Facing south, behind you is?", ["north", "south", "east", "west"], "north", 3),
      choice("Facing west, your right is?", ["north", "south", "east", "west"], "north", 4),
      choice("Facing northeast, turn 180°. You face?", ["northwest", "southeast", "southwest", "east"], "southwest", 5)
    ]
  },
  "symbol-match": speedDefinition("Symbol Match", "Do the two symbols match?", ["Match", "Different"]),
  "visual-search": speedDefinition("Visual Search", "Is the target symbol present?", ["Present", "Absent"]),
  "choice-reaction-time": speedDefinition("Choice Reaction Time", "Choose the shown direction.", ["Left", "Right"]),
  "word-list-recall": memoryDefinition("Word List Recall", ["river", "glass", "market", "silver", "planet", "candle"]),
  "visual-pair-memory": pairMemoryDefinition("Visual Pair Memory", [
    { shape: "circle", color: "blue" },
    { shape: "square", color: "green" },
    { shape: "star", color: "red" },
    { shape: "hex", color: "yellow" },
    { shape: "ring", color: "black" },
    { shape: "cross", color: "purple" }
  ]),
  "delayed-recognition": memoryDefinition("Delayed Recognition", ["anchor", "velvet", "orange", "garden", "mirror", "pencil"])
};

export function getBetaSubtestDefinition(id) {
  return betaDefinitions[id] || null;
}

export function generateBetaSubtestTrials(id, random = Math.random) {
  const definition = getBetaSubtestDefinition(id);
  if (!definition) return [];
  if (definition.kind === "speed") return generateSpeedTrials(id, definition, random);
  if (definition.kind === "pair-memory") return generatePairMemoryTrials(definition, random);
  if (definition.kind === "memory") return generateMemoryTrials(definition, random);
  const cycles = ["matrix-reasoning", "rule-induction", "relational-comparison", "mental-rotation", "grid-transformation", "perspective-taking"].includes(id) ? 2 : 1;
  return Array.from({ length: cycles }).flatMap((_, cycle) => definition.trials.map((trial, index) => ({
    ...trial,
    trialIndex: cycle * definition.trials.length + index,
    difficulty: trial.difficulty + cycle,
    domain: definition.domain
  })));
}

export function scoreBetaSubtest(id, trialResults) {
  const definition = getBetaSubtestDefinition(id);
  const correctTrials = trialResults.filter((trial) => trial.correct);
  const weighted = trialResults.reduce((acc, trial) => {
    const weight = trial.difficulty || 1;
    acc.total += weight;
    if (trial.correct) acc.correct += weight;
    return acc;
  }, { correct: 0, total: 0 });
  const reactionTimesMs = trialResults
    .filter((trial) => trial.correct)
    .map((trial) => trial.reactionTimeMs)
    .filter((value) => Number.isFinite(value));

  const isStrictDomain = [CognitiveDomain.REASONING, CognitiveDomain.PROCESSING_SPEED].includes(definition.domain);
  const base = scoreCriterionAssessment({
    correct: weighted.correct,
    total: weighted.total,
    difficultyRatio: highestCorrectDifficulty(trialResults) / maxDifficulty(trialResults),
    reactionTimesMs,
    expectedMedianMs: definition.expectedMedianMs,
    weights: isStrictDomain
      ? { accuracy: 0.45, difficulty: 0.1, speed: 0.35, consistency: 0.1 }
      : { accuracy: 0.6, difficulty: 0.15, speed: 0.15, consistency: 0.1 }
  });
  const errors = trialResults.length - correctTrials.length;

  return {
    assessmentId: `${id}-v1`,
    domain: definition.domain,
    correctTrials: correctTrials.length,
    incorrectTrials: trialResults.length - correctTrials.length,
    ...base,
    score: Math.max(0, base.score - errors * (isStrictDomain ? 8 : 6)),
    errorPenalty: errors * (isStrictDomain ? 8 : 6)
  };
}

function choice(prompt, options, answer, difficulty) {
  return { kind: "choice", prompt, options, answer, difficulty };
}

function speedDefinition(title, prompt, options) {
  return {
    kind: "speed",
    title,
    domain: CognitiveDomain.PROCESSING_SPEED,
    expectedMedianMs: 650,
    instructions: [
      "Respond as quickly and accurately as possible.",
      "Speed matters, but mistakes reduce the score.",
      "The test advances after each answer."
    ],
    prompt,
    options
  };
}

function memoryDefinition(title, studyItems) {
  return {
    kind: "memory",
    title,
    domain: CognitiveDomain.LEARNING_MEMORY,
    expectedMedianMs: 3800,
    instructions: [
      "Study the items carefully.",
      "Then answer recognition questions.",
      "Accuracy matters more than speed."
    ],
    studyItems
  };
}

function pairMemoryDefinition(title, studyPairs) {
  return {
    kind: "pair-memory",
    title,
    domain: CognitiveDomain.LEARNING_MEMORY,
    expectedMedianMs: 4200,
    instructions: [
      "Study each shape-color pair.",
      "Then decide whether each pair was in the study set.",
      "The shape and the color both matter."
    ],
    studyItems: studyPairs
  };
}

function generateSpeedTrials(id, definition, random) {
  return Array.from({ length: 12 }, (_, trialIndex) => {
    if (id === "symbol-match") {
      const left = pick(["●", "■", "▲", "◆"], random);
      const match = random() >= 0.5;
      const right = match ? left : pick(["●", "■", "▲", "◆"].filter((item) => item !== left), random);
      return { kind: "choice", trialIndex, prompt: `${left}   ${right}`, options: definition.options, answer: match ? "Match" : "Different", difficulty: 1 + Math.floor(trialIndex / 4), domain: definition.domain };
    }
    if (id === "visual-search") {
      const target = "◆";
      const present = random() >= 0.5;
      const pool = ["●", "■", "▲", "○", "□", "△"];
      const items = Array.from({ length: 6 + Math.floor(trialIndex / 4) }, () => pick(pool, random));
      if (present) items[Math.floor(random() * items.length)] = target;
      return { kind: "choice", trialIndex, prompt: `Find ◆: ${items.join(" ")}`, options: definition.options, answer: present ? "Present" : "Absent", difficulty: 1 + Math.floor(trialIndex / 4), domain: definition.domain };
    }
    const direction = random() >= 0.5 ? "Left" : "Right";
    return { kind: "choice", trialIndex, prompt: direction === "Left" ? "←" : "→", options: definition.options, answer: direction, difficulty: 1 + Math.floor(trialIndex / 4), domain: definition.domain };
  });
}

function generateMemoryTrials(definition, random) {
  const foils = ["window", "forest", "brass", "ticket", "violet", "ladder", "cloud", "stone"];
  return Array.from({ length: 8 }, (_, trialIndex) => {
    const old = trialIndex % 2 === 0;
    const item = old ? definition.studyItems[trialIndex % definition.studyItems.length] : pick(foils, random);
    return {
      kind: "memory",
      trialIndex,
      studyItems: definition.studyItems,
      prompt: `Was "${item}" in the study set?`,
      options: ["Yes", "No"],
      answer: old ? "Yes" : "No",
      difficulty: 1 + Math.floor(trialIndex / 3),
      domain: definition.domain
    };
  });
}

function generatePairMemoryTrials(definition, random) {
  const foils = [
    { shape: "circle", color: "green" },
    { shape: "square", color: "blue" },
    { shape: "star", color: "yellow" },
    { shape: "hex", color: "red" },
    { shape: "ring", color: "purple" },
    { shape: "cross", color: "black" }
  ];

  return Array.from({ length: 10 }, (_, trialIndex) => {
    const old = trialIndex % 2 === 0;
    const pair = old
      ? definition.studyItems[(trialIndex / 2) % definition.studyItems.length]
      : pick(foils, random);
    return {
      kind: "pair-memory",
      trialIndex,
      studyItems: definition.studyItems,
      pair,
      prompt: "Was this exact shape-color pair in the study set?",
      options: ["Yes", "No"],
      answer: old ? "Yes" : "No",
      difficulty: 1 + Math.floor(trialIndex / 4),
      domain: definition.domain
    };
  });
}

function highestCorrectDifficulty(results) {
  return results.filter((trial) => trial.correct).reduce((max, trial) => Math.max(max, trial.difficulty || 1), 0);
}

function maxDifficulty(results) {
  return results.reduce((max, trial) => Math.max(max, trial.difficulty || 1), 1);
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}
