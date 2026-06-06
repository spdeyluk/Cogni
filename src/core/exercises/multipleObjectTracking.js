import { CognitiveDomain } from "../domains.js";

export function createMultipleObjectTrackingConfig(overrides = {}) {
  return {
    id: "three-d-mot-training-v1",
    title: "3D Multiple Object Tracking",
    domain: CognitiveDomain.ATTENTION_CONTROL,
    targetCount: 4,
    blueDistractors: 4,
    coloredDistractors: 0,
    ballSpeed: 0.25,
    adaptiveStartSpeed: 0.12,
    ballSize: 1.8,
    boxWidth: 45,
    boxHeight: 30,
    boxDepth: 25,
    fov: 75,
    trialCount: 8,
    startDelayMs: 500,
    highlightDurationMs: 1800,
    trackingDurationMs: 7500,
    trialEndDelayMs: 1200,
    highlightTogether: true,
    ballOpacity: 0.94,
    ballRoughness: 0.3,
    ballMetalness: 0.65,
    cameraRotation: false,
    cameraRotationSpeed: 0.002,
    cameraDistance: 42,
    divider: "none",
    feedback: "immediate",
    autoProgression: true,
    speedStepCorrect: 0.02,
    speedStepIncorrect: -0.02,
    ...overrides
  };
}

export function createMotTrial(config = createMultipleObjectTrackingConfig(), random = Math.random) {
  const normalized = normalizeConfig(config);
  const totalBalls = normalized.targetCount + normalized.blueDistractors + normalized.coloredDistractors;
  const balls = [];

  for (let index = 0; index < totalBalls; index += 1) {
    balls.push({
      id: index,
      isTarget: index < normalized.targetCount,
      distractorType: index < normalized.targetCount
        ? "target"
        : index < normalized.targetCount + normalized.blueDistractors
          ? "blue"
          : "colored",
      position: randomSeparatedPosition(normalized, balls, index, random),
      velocity: randomVelocity(normalized.ballSpeed, random)
    });
  }

  return shuffleBalls(balls, random).map((ball, index) => ({ ...ball, displayIndex: index }));
}

export function scoreMotTrial(balls, selectedIds) {
  const selected = new Set(selectedIds);
  const targets = balls.filter((ball) => ball.isTarget);
  const hits = targets.filter((ball) => selected.has(ball.id)).length;
  const misses = targets.length - hits;
  const falseAlarms = balls.filter((ball) => !ball.isTarget && selected.has(ball.id)).length;
  const correct = hits === targets.length && falseAlarms === 0;

  return {
    correct,
    hits,
    misses,
    falseAlarms,
    accuracy: targets.length > 0 ? round(hits / targets.length) : 0
  };
}

export function nextMotConfig(config, score) {
  if (!config.autoProgression) return { ...config };
  const targetCount = Math.max(1, Number(config.targetCount) || 1);
  const hits = Math.max(0, Math.min(Number(score.hits) || 0, targetCount));
  const falseAlarms = Math.max(0, Number(score.falseAlarms) || 0);
  const hitRate = hits / targetCount;
  const cleanPerfect = hits === targetCount && falseAlarms === 0;
  const stepUp = Math.abs(Number(config.speedStepCorrect) || 0.01);
  const stepDown = Math.abs(Number(config.speedStepIncorrect) || stepUp);
  const speedDelta = motSpeedDelta({
    cleanPerfect,
    hitRate,
    falseAlarms,
    stepUp,
    stepDown
  });

  return {
    ...config,
    ballSpeed: round(clamp(
      config.ballSpeed + speedDelta,
      0.05,
      2.5
    ))
  };
}

export function motSpeedDelta({ cleanPerfect, hitRate, falseAlarms = 0, stepUp = 0.01, stepDown = 0.01 }) {
  if (cleanPerfect) return stepUp;

  if (hitRate >= 0.75) return 0;
  if (hitRate >= 0.5) return -stepDown * 0.5;
  if (hitRate >= 0.25) return -stepDown;
  return -stepDown * 2;
}

function normalizeConfig(config) {
  return {
    ...config,
    targetCount: clamp(Math.round(config.targetCount), 1, 12),
    blueDistractors: clamp(Math.round(config.blueDistractors), 0, 30),
    coloredDistractors: clamp(Math.round(config.coloredDistractors), 0, 30),
    ballSpeed: clamp(Number(config.ballSpeed), 0.05, 2.5),
    ballSize: clamp(Number(config.ballSize), 0.4, 6),
    boxWidth: clamp(Number(config.boxWidth), 12, 120),
    boxHeight: clamp(Number(config.boxHeight), 12, 90),
    boxDepth: clamp(Number(config.boxDepth), 12, 90)
  };
}

function randomPosition(config, random) {
  const margin = config.ballSize * 1.5;
  return {
    x: randomBetween(-config.boxWidth / 2 + margin, config.boxWidth / 2 - margin, random),
    y: randomBetween(-config.boxHeight / 2 + margin, config.boxHeight / 2 - margin, random),
    z: randomBetween(-config.boxDepth / 2 + margin, config.boxDepth / 2 - margin, random)
  };
}

function randomSeparatedPosition(config, balls, index, random) {
  const minDistance = config.ballSize * 2.35;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const position = randomPosition(config, random);
    if (balls.every((ball) => distanceBetween(position, ball.position) >= minDistance)) return position;
  }
  return fallbackPosition(config, index);
}

function fallbackPosition(config, index) {
  const columns = Math.max(2, Math.floor(config.boxWidth / (config.ballSize * 3)));
  const rows = Math.max(2, Math.floor(config.boxHeight / (config.ballSize * 3)));
  const layer = Math.floor(index / (columns * rows));
  const cell = index % (columns * rows);
  const column = cell % columns;
  const row = Math.floor(cell / columns);
  const xStep = config.boxWidth / columns;
  const yStep = config.boxHeight / rows;
  const zStep = config.ballSize * 3;

  return {
    x: -config.boxWidth / 2 + xStep * (column + 0.5),
    y: -config.boxHeight / 2 + yStep * (row + 0.5),
    z: clamp((layer - 1) * zStep, -config.boxDepth / 2 + config.ballSize * 2, config.boxDepth / 2 - config.ballSize * 2)
  };
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function randomVelocity(speed, random) {
  const theta = randomBetween(0, Math.PI * 2, random);
  const z = randomBetween(-0.75, 0.75, random);
  const radius = Math.sqrt(1 - z * z);
  return {
    x: Math.cos(theta) * radius * speed,
    y: Math.sin(theta) * radius * speed,
    z: z * speed
  };
}

function shuffleBalls(balls, random) {
  const copy = [...balls];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomBetween(min, max, random) {
  return min + (max - min) * random();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
