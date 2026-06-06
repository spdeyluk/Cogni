import { CognitiveDomain } from "../domains.js";

export const ICT_DIRECTIONS = ["left", "right"];
export const ICT_STOP_MODES = ["triangle", "text", "sound"];

export function createIctConfig(overrides = {}) {
  return {
    id: "inhibitory-control-training-v1",
    title: "Inhibitory Control Training",
    domain: CognitiveDomain.ATTENTION_CONTROL,
    cueType: "arrows",
    blocks: 1,
    trialsPerBlock: 24,
    calibrationTrials: 8,
    fixationMs: 500,
    stopProbability: 0.25,
    stopSignalDelayMs: 250,
    stopSignalStepMs: 50,
    minStopSignalDelayMs: 80,
    maxStopSignalDelayMs: 900,
    stopSignalMode: "triangle",
    softDeadlineEnabled: true,
    softDeadlineMs: 1200,
    ...overrides
  };
}

export function createIctTrials(config = createIctConfig(), random = Math.random) {
  const totalMainTrials = Math.max(1, Number(config.blocks) * Number(config.trialsPerBlock));
  const calibrationCount = Math.max(0, Number(config.calibrationTrials) || 0);
  const trials = [];
  for (let index = 0; index < calibrationCount + totalMainTrials; index += 1) {
    const calibration = index < calibrationCount;
    const direction = ICT_DIRECTIONS[Math.floor(random() * ICT_DIRECTIONS.length)];
    const stopTrial = !calibration && random() < Number(config.stopProbability);
    trials.push({
      index,
      block: calibration ? 0 : Math.floor((index - calibrationCount) / Number(config.trialsPerBlock)) + 1,
      calibration,
      direction,
      cue: cueForDirection(direction, config.cueType),
      stopTrial: config.cueType === "food" ? stopTrial && direction === "left" : stopTrial
    });
  }
  return trials;
}

export function scoreIctTrial(trial, response, reactionTimeMs = null, config = createIctConfig()) {
  const responded = response === "left" || response === "right";
  const deadlineMiss = Boolean(
    !trial.stopTrial
      && config.softDeadlineEnabled
      && Number.isFinite(reactionTimeMs)
      && reactionTimeMs > Number(config.softDeadlineMs)
  );
  if (trial.stopTrial) {
    return {
      stopTrial: true,
      correct: !responded,
      stopped: !responded,
      response: responded ? response : null,
      expected: null,
      reactionTimeMs
    };
  }
  const correctResponse = response === trial.direction && !deadlineMiss;
  return {
    stopTrial: false,
    correct: correctResponse,
    stopped: false,
    response: responded ? response : null,
    expected: trial.direction,
    deadlineMiss,
    reactionTimeMs
  };
}

export function nextIctStopSignalDelay(config, currentDelayMs, result) {
  const delay = Number(currentDelayMs) || Number(config.stopSignalDelayMs);
  if (!result?.stopTrial) return delay;
  const next = result.stopped
    ? delay + Number(config.stopSignalStepMs)
    : delay - Number(config.stopSignalStepMs);
  return Math.min(
    Number(config.maxStopSignalDelayMs),
    Math.max(Number(config.minStopSignalDelayMs), Math.round(next))
  );
}

function cueForDirection(direction, cueType) {
  if (cueType === "food") return direction === "left" ? "Junk food" : "Healthy food";
  return direction === "left" ? "←" : "→";
}
