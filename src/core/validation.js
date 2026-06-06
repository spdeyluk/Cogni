export function validateSessionTiming(session) {
  const issues = [];
  const reactionTimes = session.trials
    .map((trial) => trial.reactionTimeMs)
    .filter((value) => Number.isFinite(value));

  if (reactionTimes.some((value) => value < 120)) {
    issues.push("Reaction time below plausible human threshold.");
  }

  if (reactionTimes.some((value) => value > 10000)) {
    issues.push("Reaction time above expected task window.");
  }

  if (session.trials.length < session.config.minTrials) {
    issues.push("Session has fewer trials than required.");
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

