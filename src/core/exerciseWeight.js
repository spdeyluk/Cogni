function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function scale(value, min, max) {
  if (max === min) return 0;
  return clamp01((Number(value) - min) / (max - min));
}

function inverseScale(value, min, max) {
  return 1 - scale(value, min, max);
}

function factor(label, value) {
  return { label, value: Math.round(clamp01(value) * 100) / 100 };
}

function summarize(factors) {
  const overall = factors.length
    ? factors.reduce((sum, item) => sum + item.value, 0) / factors.length
    : 0;
  return { overall: Math.round(overall * 100) / 100, factors };
}

export function calculateExerciseWeight(exerciseId, settings = {}) {
  if (exerciseId === "nback") {
    const activeModalities = settings.activeModalities?.length ?? 1;
    return summarize([
      factor("N level", scale(settings.n ?? 1, 1, 8)),
      factor("Cue count", scale(activeModalities, 1, 4)),
      factor("Trial speed", inverseScale(settings.trialTimeMs ?? 3000, 1500, 5000)),
      factor("Interference", scale(settings.interference ?? 0, 0, 0.75)),
      factor("Match balance", scale(Math.abs((settings.matchChance ?? 0.25) - 0.25), 0, 0.25)),
      factor("Session length", scale(settings.sessionTimerSeconds ?? 300, 30, 3600))
    ]);
  }

  if (exerciseId === "rrt") {
    const modeWeights = { distinction: 0.2, linear: 0.4, space2d: 0.7, space3d: 1 };
    const modes = Object.entries(settings.modeSettings ?? {})
      .filter(([, value]) => value?.enabled)
      .map(([mode]) => modeWeights[mode] ?? 0.2);
    const vocabularyWeight = (settings.vocabularies ?? [settings.vocabulary]).reduce((max, item) => {
      return Math.max(max, item === "garbage" || item === "nonsense" ? 1 : item === "emoji" ? 0.45 : 0.65);
    }, 0.2);
    return summarize([
      factor("Premises", scale(settings.premiseCount ?? 2, 2, 6)),
      factor("Trial speed", settings.timerEnabled ? inverseScale(settings.timerSeconds ?? 30, 5, 90) : 0),
      factor("Mode complexity", modes.length ? modes.reduce((sum, value) => sum + value, 0) / modes.length : 0.2),
      factor("Objects", vocabularyWeight),
      factor("Visual noise", scale(settings.visualNoiseSplits ?? 0, 0, 100)),
      factor("Scramble", scale(settings.scrambleFactor ?? 0, 0, 100))
    ]);
  }

  if (exerciseId === "cct") {
    return summarize([
      factor("Session length", scale(settings.durationSeconds ?? 300, 30, 3600)),
      factor("Starting interval", inverseScale(settings.startingIntervalMs ?? 3000, 500, 10000)),
      factor("Minimum interval", inverseScale(settings.minimumIntervalMs ?? 500, 500, 10000)),
      factor("Adaptive pace", settings.adaptive ? 1 : 0.25),
      factor("Cue mode", settings.cueMode === "voice" ? 0.65 : 0.4)
    ]);
  }

  if (exerciseId === "ict") {
    return summarize([
      factor("Blocks", scale(settings.blocks ?? 1, 1, 12)),
      factor("Trials per block", scale(settings.trialsPerBlock ?? 20, 8, 120)),
      factor("Stop probability", scale(settings.stopProbability ?? 0.25, 0.05, 0.5)),
      factor("Stop-signal delay", scale(settings.stopSignalDelayMs ?? 250, 80, 900)),
      factor("Response deadline", settings.softDeadlineEnabled ? inverseScale(settings.softDeadlineMs ?? 1200, 350, 3000) : 0),
      factor("Cue type", settings.cueType === "food" ? 0.7 : 0.35)
    ]);
  }

  if (exerciseId === "mot") {
    return summarize([
      factor("Targets", scale(settings.targetCount ?? 4, 1, 12)),
      factor("Distractors", scale((settings.blueDistractors ?? 0) + (settings.coloredDistractors ?? 0), 0, 60)),
      factor("Ball speed", scale(settings.ballSpeed ?? 0.25, 0.05, 1.5)),
      factor("Tracking time", scale(settings.trackingDurationMs ?? 7500, 2500, 20000)),
      factor("Ball size", inverseScale(settings.ballSize ?? 1.8, 0.6, 4))
    ]);
  }

  if (exerciseId === "ufov") {
    return summarize([
      factor("Trials", scale(settings.trialCount ?? 16, 4, 300)),
      factor("Exposure speed", inverseScale(settings.stimulusDurationMs ?? 900, 120, 1600)),
      factor("Minimum exposure", inverseScale(settings.minStimulusDurationMs ?? 180, 80, 1000)),
      factor("Distractors", scale(settings.distractorCount ?? 20, 0, 80)),
      factor("Auto progression", settings.autoProgression ? 0.75 : 0.25)
    ]);
  }

  return summarize([]);
}
