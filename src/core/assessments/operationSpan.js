import { CognitiveDomain } from "../domains.js";
import { scoreCriterionAssessment } from "../scoring.js";

const MEMORY_ITEMS = ["K", "M", "R", "T", "L", "S", "P", "F", "N", "B"];

export function createOperationSpanAssessmentConfig(overrides = {}) {
  return {
    id: "operation-span-v1",
    title: "Operation Span",
    domain: CognitiveDomain.WORKING_MEMORY,
    minTrials: 4,
    roundsPerSetSize: 1,
    startSetSize: 2,
    maxSetSize: 6,
    memoryDisplayMs: 1000,
    expectedMedianMs: 2600,
    ...overrides
  };
}

export function generateOperationSpanTrials(config = createOperationSpanAssessmentConfig(), random = Math.random) {
  const trials = [];
  let trialIndex = 0;

  for (let setSize = config.startSetSize; setSize <= config.maxSetSize; setSize += 1) {
    for (let round = 0; round < config.roundsPerSetSize; round += 1) {
      trials.push({
        trialIndex,
        setSize,
        memoryItems: createMemoryItems(setSize, random),
        operations: Array.from({ length: setSize }, () => createOperation(random)),
        domain: config.domain
      });
      trialIndex += 1;
    }
  }

  return trials;
}

export function scoreOperationSpanAssessment(config, trialResults) {
  const totalMemoryItems = trialResults.reduce((sum, trial) => sum + trial.memoryItems.length, 0);
  const correctMemoryItems = trialResults.reduce((sum, trial) => {
    return sum + trial.memoryItems.filter((item, index) => trial.recalledItems[index] === item).length;
  }, 0);
  const totalOperations = trialResults.reduce((sum, trial) => sum + trial.operations.length, 0);
  const correctOperations = trialResults.reduce((sum, trial) => {
    return sum + trial.operations.filter((operation, index) => trial.operationResponses[index] === operation.isCorrect).length;
  }, 0);
  const perfectTrials = trialResults.filter((trial) => {
    const memoryPerfect = trial.memoryItems.every((item, index) => trial.recalledItems[index] === item);
    const operationsGood = trial.operations.every((operation, index) => trial.operationResponses[index] === operation.isCorrect);
    return memoryPerfect && operationsGood;
  });
  const highestCorrectSetSize = perfectTrials.reduce((max, trial) => Math.max(max, trial.setSize), 0);
  const reactionTimesMs = trialResults
    .flatMap((trial) => trial.reactionTimesMs)
    .filter((value) => Number.isFinite(value));

  const criterion = scoreCriterionAssessment({
    correct: correctMemoryItems,
    total: totalMemoryItems,
    difficultyRatio: highestCorrectSetSize / config.maxSetSize,
    reactionTimesMs,
    expectedMedianMs: config.expectedMedianMs,
    weights: {
      accuracy: 0.6,
      difficulty: 0.25,
      speed: 0.05,
      consistency: 0.1
    }
  });

  return {
    assessmentId: config.id,
    domain: config.domain,
    highestCorrectSetSize,
    correctMemoryItems,
    incorrectMemoryItems: totalMemoryItems - correctMemoryItems,
    correctOperations,
    incorrectOperations: totalOperations - correctOperations,
    operationAccuracy: totalOperations > 0 ? Math.round((correctOperations / totalOperations) * 100) / 100 : 0,
    memoryAccuracy: totalMemoryItems > 0 ? Math.round((correctMemoryItems / totalMemoryItems) * 100) / 100 : 0,
    ...criterion
  };
}

function createMemoryItems(length, random) {
  const pool = [...MEMORY_ITEMS];
  return Array.from({ length }, () => {
    const index = Math.floor(random() * pool.length);
    return pool.splice(index, 1)[0];
  });
}

function createOperation(random) {
  const left = 2 + Math.floor(random() * 8);
  const right = 1 + Math.floor(random() * 7);
  const actual = left + right;
  const isCorrect = random() >= 0.5;
  const shown = isCorrect ? actual : actual + (random() >= 0.5 ? 1 : -1);

  return {
    prompt: `${left} + ${right} = ${shown}`,
    isCorrect
  };
}
