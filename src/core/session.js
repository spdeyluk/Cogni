export function createSession({ id, config, trials, startedAt = new Date() }) {
  return {
    id,
    config,
    trials,
    startedAt,
    completedAt: null
  };
}

export function completeSession(session, trialResults, completedAt = new Date()) {
  return {
    ...session,
    trials: trialResults,
    completedAt
  };
}

