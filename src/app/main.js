import { createQuadNBackConfig, generateQuadNBackTrials, scoreQuadNBackSession } from "../core/exercises/quadNBack.js";
import {
  createMotTrial,
  createMultipleObjectTrackingConfig,
  nextMotConfig,
  scoreMotTrial
} from "../core/exercises/multipleObjectTracking.js";
import {
  createRelationalReasoningConfig,
  generateRrtTrial,
  nextRrtConfig,
  scoreRrtAnswer
} from "../core/exercises/relationalReasoning.js";
import {
  createCctConfig,
  createCctDigit,
  nextCctInterval,
  scoreCctAnswer
} from "../core/exercises/cognitiveControlTraining.js";
import {
  UFOV_SECTORS,
  createUfovConfig,
  createUfovTrial,
  nextUfovConfig,
  scoreUfovTrial
} from "../core/exercises/usefulFieldOfView.js";
import {
  createIctConfig,
  createIctTrials,
  nextIctStopSignalDelay,
  scoreIctTrial
} from "../core/exercises/inhibitoryControlTraining.js";
import * as THREE from "../../node_modules/three/build/three.module.js";

const modalityKeys = {
  KeyA: "position",
  KeyF: "color",
  KeyJ: "shape",
  KeyL: "audio"
};

const letterAudioBasePath = "/assets/audio/nback-letters";
const audioCache = new Map();
const exerciseProgressStorageKey = "brainer.exerciseProgress.v1";
const routineStorageKey = "cogni.routines.v1";

const routineExerciseMeta = {
  nback: { label: "N-Back", defaultMinutes: 2, secondsPerTrial: 2.5 },
  rrt: { label: "Relational Reasoning", defaultMinutes: 5, secondsPerTrial: 30 },
  cct: { label: "Cognitive Control Training", defaultMinutes: 5, secondsPerTrial: 5 },
  ict: { label: "Inhibitory Control Training", defaultMinutes: 4, secondsPerTrial: 1.8 },
  mot: { label: "3D MOT", defaultMinutes: 4, secondsPerTrial: 10 },
  ufov: { label: "UFOV", defaultMinutes: 3, secondsPerTrial: 1.2 }
};

const shapeLabels = {
  circle: "",
  square: "",
  triangle: "",
  diamond: "",
  cross: "",
  ring: "",
  tee: "T",
  ell: "L",
  zig: "Z",
  bar: "I",
  block: "",
  corner: "C",
  bolt: "bolt",
  moon: "moon",
  plus: "",
  target: "target",
  wave: "wave",
  spark: "spark",
  leaf: "leaf",
  drop: "drop",
  shield: "shield",
  pin: "pin",
  gear: "gear",
  flag: "flag"
};

const elements = {
  appShell: document.querySelector("#app-shell"),
  pageTitle: document.querySelector("#page-title"),
  pageLede: document.querySelector("#page-lede"),
  sideNavButtons: [...document.querySelectorAll("[data-section]")],
  tabExercises: document.querySelector("#tab-exercises"),
  tabStatistics: document.querySelector("#tab-statistics"),
  createRoutine: document.querySelector("#create-routine"),
  loadRoutine: document.querySelector("#load-routine"),
  routineList: document.querySelector("#routine-list"),
  routineEmpty: document.querySelector(".routine-empty"),
  routineDialog: document.querySelector("#routine-dialog"),
  routineDialogTitle: document.querySelector("#routine-dialog-title"),
  closeRoutineDialog: document.querySelector("#close-routine-dialog"),
  routineName: document.querySelector("#routine-name"),
  routineEstimatedTotal: document.querySelector("#routine-estimated-total"),
  routineExerciseSelect: document.querySelector("#routine-exercise-select"),
  addRoutineBlock: document.querySelector("#add-routine-block"),
  routineBlockList: document.querySelector("#routine-block-list"),
  saveRoutine: document.querySelector("#save-routine"),
  deleteRoutine: document.querySelector("#delete-routine"),
  placeholderEyebrow: document.querySelector("#placeholder-eyebrow"),
  placeholderTitle: document.querySelector("#placeholder-title"),
  placeholderCopy: document.querySelector("#placeholder-copy"),
  statsTotalMinutes: document.querySelector("#stats-total-minutes"),
  statsTotalSessions: document.querySelector("#stats-total-sessions"),
  statsTotalTrials: document.querySelector("#stats-total-trials"),
  statsTotalAccuracy: document.querySelector("#stats-total-accuracy"),
  statsTimeframeLabel: document.querySelector("#stats-timeframe-label"),
  statsGrid: document.querySelector("#stats-grid"),
  profileDataPanels: document.querySelector("#profile-data-panels"),
  profileTestsToggle: document.querySelector("#profile-tests-toggle"),
  profileExercisesToggle: document.querySelector("#profile-exercises-toggle"),
  profileTestsPanel: document.querySelector("#profile-tests-panel"),
  profileExercisesPanel: document.querySelector("#profile-exercises-panel"),
  statsExercisePicker: document.querySelector("#exercise-stat-picker"),
  statsExercisePickerButton: document.querySelector("#exercise-stat-trigger"),
  statsExercisePickerLabel: document.querySelector("#exercise-stat-current"),
  statsExerciseTabs: [...document.querySelectorAll("[data-stats-exercise]")],
  statsTimeframeTabs: [...document.querySelectorAll("[data-stats-timeframe]")],
  openNback: document.querySelector("#open-nback"),
  openMot: document.querySelector("#open-mot"),
  openRrt: document.querySelector("#open-rrt"),
  openCct: document.querySelector("#open-cct"),
  openUfov: document.querySelector("#open-ufov"),
  openIct: document.querySelector("#open-ict"),
  backToExercises: document.querySelector("#back-to-exercises"),
  backToExercisesMot: document.querySelector("#back-to-exercises-mot"),
  backToExercisesRrt: document.querySelector("#back-to-exercises-rrt"),
  backToExercisesCct: document.querySelector("#back-to-exercises-cct"),
  backToExercisesUfov: document.querySelector("#back-to-exercises-ufov"),
  backToExercisesIct: document.querySelector("#back-to-exercises-ict"),
  modalityInputs: [...document.querySelectorAll("[data-modality]")],
  nbackLevelPresets: [...document.querySelectorAll("[data-nback-level-preset]")],
  nbackModalityPresets: [...document.querySelectorAll("[data-nback-modality-preset]")],
  nbackModalityToggles: [...document.querySelectorAll("[data-nback-modality-toggle]")],
  nbackDurationPresets: [...document.querySelectorAll("[data-nback-duration-preset]")],
  nLevel: document.querySelector("#n-level"),
  nLevelValue: document.querySelector("#n-level-value"),
  sessionTimer: document.querySelector("#session-timer"),
  sessionTimerValue: document.querySelector("#session-timer-value"),
  trialCount: document.querySelector("#trial-count"),
  trialTime: document.querySelector("#trial-time"),
  trialTimeValue: document.querySelector("#trial-time-value"),
  sessionDuration: document.querySelector("#session-duration"),
  matchChance: document.querySelector("#match-chance"),
  matchChanceValue: document.querySelector("#match-chance-value"),
  interference: document.querySelector("#interference"),
  interferenceValue: document.querySelector("#interference-value"),
  feedbackMode: document.querySelector("#feedback-mode"),
  autoProgression: document.querySelector("#auto-progression"),
  advanceThreshold: document.querySelector("#advance-threshold"),
  advanceThresholdValue: document.querySelector("#advance-threshold-value"),
  advanceStreak: document.querySelector("#advance-streak"),
  advanceStreakValue: document.querySelector("#advance-streak-value"),
  dropThreshold: document.querySelector("#drop-threshold"),
  dropThresholdValue: document.querySelector("#drop-threshold-value"),
  dropStreak: document.querySelector("#drop-streak"),
  dropStreakValue: document.querySelector("#drop-streak-value"),
  start: document.querySelector("#start-session"),
  quit: document.querySelector("#quit-session"),
  quitDialog: document.querySelector("#quit-dialog"),
  cancelQuit: document.querySelector("#cancel-quit"),
  confirmQuit: document.querySelector("#confirm-quit"),
  responseButtons: [...document.querySelectorAll("[data-response]")],
  stage: document.querySelector("#stage"),
  board: document.querySelector("#grid-board"),
  countdown: document.querySelector("#countdown"),
  audioCue: document.querySelector("#audio-cue"),
  state: document.querySelector("#session-state"),
  progress: document.querySelector("#session-progress"),
  hits: document.querySelector("#hits"),
  misses: document.querySelector("#misses"),
  falseAlarms: document.querySelector("#false-alarms"),
  dPrime: document.querySelector("#d-prime"),
  feedback: document.querySelector("#feedback-line"),
  output: document.querySelector("#session-output"),
  motTargetCount: document.querySelector("#mot-target-count"),
  motBlueDistractors: document.querySelector("#mot-blue-distractors"),
  motColoredDistractors: document.querySelector("#mot-colored-distractors"),
  motBallSpeed: document.querySelector("#mot-ball-speed"),
  motBallSpeedValue: document.querySelector("#mot-ball-speed-value"),
  motBallSize: document.querySelector("#mot-ball-size"),
  motBallSizeValue: document.querySelector("#mot-ball-size-value"),
  motTrialCount: document.querySelector("#mot-trial-count"),
  motTrackingDuration: document.querySelector("#mot-tracking-duration"),
  motTrackingDurationValue: document.querySelector("#mot-tracking-duration-value"),
  motHighlightDuration: document.querySelector("#mot-highlight-duration"),
  motHighlightDurationValue: document.querySelector("#mot-highlight-duration-value"),
  motAutoContinue: document.querySelector("#mot-auto-continue"),
  motStageFullscreen: document.querySelector("#mot-stage-fullscreen"),
  motBoxWidth: document.querySelector("#mot-box-width"),
  motBoxHeight: document.querySelector("#mot-box-height"),
  motBoxDepth: document.querySelector("#mot-box-depth"),
  motFov: document.querySelector("#mot-fov"),
  motGraphics: document.querySelector("#mot-graphics"),
  motBallOpacity: document.querySelector("#mot-ball-opacity"),
  motBallOpacityValue: document.querySelector("#mot-ball-opacity-value"),
  motCameraRotation: document.querySelector("#mot-camera-rotation"),
  motCameraRotationSpeed: document.querySelector("#mot-camera-rotation-speed"),
  motCameraRotationSpeedValue: document.querySelector("#mot-camera-rotation-speed-value"),
  motCameraDistance: document.querySelector("#mot-camera-distance"),
  motCameraDistanceValue: document.querySelector("#mot-camera-distance-value"),
  motDivider: document.querySelector("#mot-divider"),
  motFeedbackMode: document.querySelector("#mot-feedback-mode"),
  motAutoProgression: document.querySelector("#mot-auto-progression"),
  motSpeedStepCorrect: document.querySelector("#mot-speed-step-correct"),
  motSpeedStepIncorrect: document.querySelector("#mot-speed-step-incorrect"),
  startMot: document.querySelector("#start-mot-session"),
  quitMot: document.querySelector("#quit-mot-session"),
  nextMotTrial: document.querySelector("#next-mot-trial"),
  motState: document.querySelector("#mot-session-state"),
  motProgress: document.querySelector("#mot-session-progress"),
  motCanvasWrap: document.querySelector("#mot-canvas-wrap"),
  motOverlay: document.querySelector("#mot-overlay"),
  motCorrect: document.querySelector("#mot-correct"),
  motMisses: document.querySelector("#mot-misses"),
  motFalseAlarms: document.querySelector("#mot-false-alarms"),
  motSpeedStat: document.querySelector("#mot-speed-stat"),
  motFeedback: document.querySelector("#mot-feedback-line"),
  motOutput: document.querySelector("#mot-session-output"),
  rrtProfile: document.querySelector("#rrt-profile"),
  rrtPremiseCount: document.querySelector("#rrt-premise-count"),
  rrtPremiseCountValue: document.querySelector("#rrt-premise-count-value"),
  rrtTrialCount: document.querySelector("#rrt-trial-count"),
  rrtTimerSeconds: document.querySelector("#rrt-timer-seconds"),
  rrtTimerSecondsValue: document.querySelector("#rrt-timer-seconds-value"),
  rrtTimerEnabled: document.querySelector("#rrt-timer-enabled"),
  rrtAutoProgression: document.querySelector("#rrt-auto-progression"),
  rrtDailyTarget: document.querySelector("#rrt-daily-target"),
  rrtWeeklyTarget: document.querySelector("#rrt-weekly-target"),
  rrtVocabularyChoices: [...document.querySelectorAll("[name='rrt-vocabulary-choice']")],
  rrtNonsenseLength: document.querySelector("#rrt-nonsense-length"),
  rrtNonsenseLengthValue: document.querySelector("#rrt-nonsense-length-value"),
  rrtGarbageLength: document.querySelector("#rrt-garbage-length"),
  rrtGarbageLengthValue: document.querySelector("#rrt-garbage-length-value"),
  rrtUseNouns: document.querySelector("#rrt-use-nouns"),
  rrtUseAdjectives: document.querySelector("#rrt-use-adjectives"),
  rrtUseVoronoiEmoji: document.querySelector("#rrt-use-voronoi-emoji"),
  rrtVisualNoise: document.querySelector("#rrt-visual-noise"),
  rrtScrambleFactor: document.querySelector("#rrt-scramble-factor"),
  rrtConnectionBranching: document.querySelector("#rrt-connection-branching"),
  rrtSpoilerConclusion: document.querySelector("#rrt-spoiler-conclusion"),
  rrtEnableDistinction: document.querySelector("#rrt-enable-distinction"),
  rrtDistinctionPremises: document.querySelector("#rrt-distinction-premises"),
  rrtDistinctionTime: document.querySelector("#rrt-distinction-time"),
  rrtDistinctionPriority: document.querySelector("#rrt-distinction-priority"),
  rrtEnableLinear: document.querySelector("#rrt-enable-linear"),
  rrtLinearPremises: document.querySelector("#rrt-linear-premises"),
  rrtLinearTime: document.querySelector("#rrt-linear-time"),
  rrtLinearPriority: document.querySelector("#rrt-linear-priority"),
  rrtLinear180: document.querySelector("#rrt-linear-180"),
  rrtEnableSpace2d: document.querySelector("#rrt-enable-space2d"),
  rrtSpace2dPremises: document.querySelector("#rrt-space2d-premises"),
  rrtSpace2dTime: document.querySelector("#rrt-space2d-time"),
  rrtSpace2dPriority: document.querySelector("#rrt-space2d-priority"),
  rrtEnableSpace3d: document.querySelector("#rrt-enable-space3d"),
  rrtSpace3dPremises: document.querySelector("#rrt-space3d-premises"),
  rrtSpace3dTime: document.querySelector("#rrt-space3d-time"),
  rrtSpace3dPriority: document.querySelector("#rrt-space3d-priority"),
  startRrt: document.querySelector("#start-rrt-session"),
  quitRrt: document.querySelector("#quit-rrt-session"),
  rrtState: document.querySelector("#rrt-session-state"),
  rrtProgress: document.querySelector("#rrt-session-progress"),
  rrtModeLabel: document.querySelector("#rrt-mode-label"),
  rrtHeading: document.querySelector("#rrt-heading"),
  rrtPremises: document.querySelector("#rrt-premises"),
  rrtConclusion: document.querySelector("#rrt-conclusion"),
  rrtTrue: document.querySelector("#rrt-true"),
  rrtFalse: document.querySelector("#rrt-false"),
  rrtCorrect: document.querySelector("#rrt-correct"),
  rrtWrong: document.querySelector("#rrt-wrong"),
  rrtSessionTotal: document.querySelector("#rrt-session-total"),
  rrtPremiseStat: document.querySelector("#rrt-premise-stat"),
  rrtTimeLeft: document.querySelector("#rrt-time-left"),
  rrtTimerUnit: document.querySelector("#rrt-timer-unit"),
  rrtFeedback: document.querySelector("#rrt-feedback-line"),
  rrtOutput: document.querySelector("#rrt-session-output"),
  rrtStageCard: document.querySelector(".rrt-stage-card"),
  cctDurationPresets: [...document.querySelectorAll("[data-cct-duration]")],
  cctStartIntervalPresets: [...document.querySelectorAll("[data-cct-start-preset]")],
  cctMinIntervalPresets: [...document.querySelectorAll("[data-cct-min-preset]")],
  cctDuration: document.querySelector("#cct-duration"),
  cctDurationValue: document.querySelector("#cct-duration-value"),
  cctStartInterval: document.querySelector("#cct-start-interval"),
  cctStartIntervalValue: document.querySelector("#cct-start-interval-value"),
  cctMinInterval: document.querySelector("#cct-min-interval"),
  cctMinIntervalValue: document.querySelector("#cct-min-interval-value"),
  cctAdaptive: document.querySelector("#cct-adaptive"),
  cctCorrectStep: document.querySelector("#cct-correct-step"),
  cctWrongStep: document.querySelector("#cct-wrong-step"),
  startCct: document.querySelector("#start-cct-session"),
  quitCct: document.querySelector("#quit-cct-session"),
  cctState: document.querySelector("#cct-session-state"),
  cctProgress: document.querySelector("#cct-session-progress"),
  cctDigit: document.querySelector("#cct-digit"),
  cctInstruction: document.querySelector("#cct-instruction"),
  cctAnswerInput: document.querySelector("#cct-answer-input"),
  cctSubmitAnswer: document.querySelector("#cct-submit-answer"),
  cctKeypadButtons: [...document.querySelectorAll("[data-cct-key]")],
  cctCorrect: document.querySelector("#cct-correct"),
  cctWrong: document.querySelector("#cct-wrong"),
  cctIntervalStat: document.querySelector("#cct-interval-stat"),
  cctTimeLeft: document.querySelector("#cct-time-left"),
  cctFeedback: document.querySelector("#cct-feedback-line"),
  cctOutput: document.querySelector("#cct-session-output"),
  cctStageCard: document.querySelector(".cct-stage-card"),
  ufovTrialCount: document.querySelector("#ufov-trial-count"),
  ufovDuration: document.querySelector("#ufov-duration"),
  ufovDurationValue: document.querySelector("#ufov-duration-value"),
  ufovDistractors: document.querySelector("#ufov-distractors"),
  ufovAutoProgression: document.querySelector("#ufov-auto-progression"),
  ufovMinDuration: document.querySelector("#ufov-min-duration"),
  ufovAdvanceStreak: document.querySelector("#ufov-advance-streak"),
  ufovRegressStreak: document.querySelector("#ufov-regress-streak"),
  startUfov: document.querySelector("#start-ufov-session"),
  quitUfov: document.querySelector("#quit-ufov-session"),
  ufovState: document.querySelector("#ufov-session-state"),
  ufovProgress: document.querySelector("#ufov-session-progress"),
  ufovStageCard: document.querySelector(".ufov-stage-card"),
  ufovStage: document.querySelector("#ufov-stage"),
  ufovCenter: document.querySelector("#ufov-center"),
  ufovCenterChoices: document.querySelector("#ufov-center-choices"),
  ufovSectorGrid: document.querySelector("#ufov-sector-grid"),
  ufovCorrect: document.querySelector("#ufov-correct"),
  ufovWrong: document.querySelector("#ufov-wrong"),
  ufovDurationStat: document.querySelector("#ufov-duration-stat"),
  ufovAccuracy: document.querySelector("#ufov-accuracy"),
  ufovFeedback: document.querySelector("#ufov-feedback-line"),
  ufovOutput: document.querySelector("#ufov-session-output"),
  ictBlocks: document.querySelector("#ict-blocks"),
  ictTrialsPerBlock: document.querySelector("#ict-trials-per-block"),
  ictStopProbability: document.querySelector("#ict-stop-probability"),
  ictStopProbabilityValue: document.querySelector("#ict-stop-probability-value"),
  ictCueType: document.querySelector("#ict-cue-type"),
  ictCalibrationTrials: document.querySelector("#ict-calibration-trials"),
  ictFixationMs: document.querySelector("#ict-fixation-ms"),
  ictSsd: document.querySelector("#ict-ssd"),
  ictSsdValue: document.querySelector("#ict-ssd-value"),
  ictSsdStep: document.querySelector("#ict-ssd-step"),
  ictStopSignalMode: document.querySelector("#ict-stop-signal-mode"),
  ictSoftDeadlineEnabled: document.querySelector("#ict-soft-deadline-enabled"),
  ictSoftDeadline: document.querySelector("#ict-soft-deadline"),
  startIct: document.querySelector("#start-ict-session"),
  quitIct: document.querySelector("#quit-ict-session"),
  ictState: document.querySelector("#ict-session-state"),
  ictProgress: document.querySelector("#ict-session-progress"),
  ictStageCard: document.querySelector(".ict-stage-card"),
  ictStage: document.querySelector("#ict-stage"),
  ictFixation: document.querySelector("#ict-fixation"),
  ictCue: document.querySelector("#ict-cue"),
  ictStopSignal: document.querySelector("#ict-stop-signal"),
  ictResponseButtons: [...document.querySelectorAll("[data-ict-response]")],
  ictGoCorrect: document.querySelector("#ict-go-correct"),
  ictStopCorrect: document.querySelector("#ict-stop-correct"),
  ictStopFail: document.querySelector("#ict-stop-fail"),
  ictSsdStat: document.querySelector("#ict-ssd-stat"),
  ictFeedback: document.querySelector("#ict-feedback-line"),
  ictOutput: document.querySelector("#ict-session-output")
};

const session = {
  running: false,
  timers: [],
  config: null,
  trials: [],
  results: [],
  trialIndex: 0,
  trialStartedAt: 0,
  startedAt: 0,
  countingDown: false,
  responses: {},
  reactionTimesMs: {},
  winStreak: 0,
  loseStreak: 0
};

const mot = {
  running: false,
  phase: "idle",
  timers: [],
  config: null,
  balls: [],
  selectedIds: new Set(),
  selectionStartedAt: 0,
  selectionReactionTimesMs: [],
  results: [],
  trialIndex: 0,
  startedAt: 0,
  scene: null,
  camera: null,
  renderer: null,
  raycaster: null,
  pointer: null,
  group: null,
  box: null,
  divider: null,
  animationFrame: null,
  lastFrameAt: 0
};

const rrt = {
  running: false,
  timers: [],
  config: null,
  trial: null,
  results: [],
  trialIndex: 0,
  trialStartedAt: 0,
  startedAt: 0,
  timeLeft: 0
};

const cct = {
  running: false,
  timers: [],
  config: null,
  results: [],
  currentDigit: null,
  previousDigit: null,
  currentIntervalMs: 5000,
  digitStartedAt: 0,
  startedAt: 0,
  endsAt: 0,
  answeredCurrent: true,
  digitsShown: 0
};

const ufov = {
  running: false,
  timers: [],
  config: null,
  trial: null,
  results: [],
  trialIndex: 0,
  trialStartedAt: 0,
  startedAt: 0,
  selectedCenter: null,
  selectedSector: null,
  acceptingAnswers: false
};

const ict = {
  running: false,
  timers: [],
  config: null,
  trials: [],
  results: [],
  trialIndex: 0,
  currentTrial: null,
  currentSsdMs: 250,
  startedAt: 0,
  trialStartedAt: 0,
  acceptingResponse: false,
  stopSignalShown: false
};

let selectedStatsExercise = "nback";
let selectedStatsTimeframe = "daily";
let selectedNBackStatsLevel = "all";
let selectedNBackStatsMode = "all";
let routineDraft = createEmptyRoutine();

renderBoard();
syncSettingLabels();
updateTrialCountFromSessionTimer();
syncMotSettingLabels();
syncRrtSettingLabels();
syncCctSettingLabels();
syncUfovSettingLabels();
syncIctSettingLabels();
updateFeedbackVisibility();
updateResponseButtons();
resetOutput();
resetMotOutput();
resetRrtOutput();
resetCctOutput();
resetUfovOutput();
resetIctOutput();
renderRoutineList();

[
  elements.nLevel,
  elements.matchChance,
  elements.interference,
  elements.advanceThreshold,
  elements.advanceStreak,
  elements.dropThreshold,
  elements.dropStreak
].forEach((input) => input.addEventListener("input", syncSettingLabels));
elements.sessionTimer.addEventListener("input", updateTrialCountFromSessionTimer);
elements.trialTime.addEventListener("input", updateTrialCountFromSessionTimer);
elements.trialCount.addEventListener("input", updateSessionTimerFromTrialCount);
[
  elements.rrtPremiseCount,
  elements.rrtTimerSeconds,
  elements.rrtNonsenseLength,
  elements.rrtGarbageLength
].forEach((input) => input.addEventListener("input", syncRrtSettingLabels));
elements.rrtTimerEnabled.addEventListener("change", syncRrtSettingLabels);
[
  elements.cctDuration,
  elements.cctStartInterval,
  elements.cctMinInterval
].forEach((input) => input.addEventListener("input", syncCctSettingLabels));
[
  elements.ufovDuration,
  elements.ufovTrialCount,
  elements.ufovDistractors,
  elements.ufovMinDuration,
  elements.ufovAdvanceStreak,
  elements.ufovRegressStreak
].forEach((input) => input.addEventListener("input", syncUfovSettingLabels));
[
  elements.ictBlocks,
  elements.ictTrialsPerBlock,
  elements.ictStopProbability,
  elements.ictCalibrationTrials,
  elements.ictFixationMs,
  elements.ictSsd,
  elements.ictSsdStep,
  elements.ictSoftDeadline
].forEach((input) => input.addEventListener("input", syncIctSettingLabels));
elements.cctDurationPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.cctDuration.value = button.dataset.cctDuration;
    syncCctSettingLabels();
  });
});
elements.cctStartIntervalPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.cctStartInterval.value = button.dataset.cctStartPreset;
    syncCctSettingLabels();
  });
});
elements.cctMinIntervalPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.cctMinInterval.value = button.dataset.cctMinPreset;
    syncCctSettingLabels();
  });
});
[
  elements.motBallSpeed,
  elements.motBallSize,
  elements.motTrackingDuration,
  elements.motHighlightDuration,
  elements.motBallOpacity,
  elements.motCameraRotationSpeed,
  elements.motCameraDistance
].forEach((input) => input.addEventListener("input", syncMotSettingLabels));
elements.feedbackMode.addEventListener("change", updateFeedbackVisibility);
elements.modalityInputs.forEach((input) => input.addEventListener("change", () => {
  syncNBackPresetButtons();
  updateResponseButtons();
}));
elements.nbackLevelPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.nLevel.value = button.dataset.nbackLevelPreset;
    syncSettingLabels();
  });
});
elements.nbackModalityPresets.forEach((button) => {
  button.addEventListener("click", () => {
    applyNBackModalityPreset(button.dataset.nbackModalityPreset);
  });
});
elements.nbackModalityToggles.forEach((button) => {
  button.addEventListener("click", () => {
    toggleNBackModality(button.dataset.nbackModalityToggle);
  });
});
elements.nbackDurationPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.sessionTimer.value = button.dataset.nbackDurationPreset;
    updateTrialCountFromSessionTimer();
  });
});
elements.openNback.addEventListener("click", openNBackSettings);
elements.openMot.addEventListener("click", openMotSettings);
elements.openRrt.addEventListener("click", openRrtSettings);
elements.openCct.addEventListener("click", openCctSettings);
elements.openUfov.addEventListener("click", openUfovSettings);
elements.openIct.addEventListener("click", openIctSettings);
elements.tabExercises.addEventListener("click", showExerciseHub);
elements.tabStatistics?.addEventListener("click", showStatistics);
elements.profileTestsToggle?.addEventListener("click", () => toggleProfileDataPanel("tests"));
elements.profileExercisesToggle?.addEventListener("click", () => toggleProfileDataPanel("exercises"));
elements.createRoutine.addEventListener("click", () => openRoutineBuilder());
elements.loadRoutine.addEventListener("click", () => openRoutineLoader());
elements.closeRoutineDialog.addEventListener("click", closeRoutineDialog);
elements.addRoutineBlock.addEventListener("click", () => {
  addRoutineBlock(elements.routineExerciseSelect.value);
});
elements.saveRoutine.addEventListener("click", saveRoutineDraft);
elements.deleteRoutine.addEventListener("click", deleteRoutineDraft);
elements.routineName.addEventListener("input", () => {
  routineDraft.name = elements.routineName.value;
  renderRoutineDraft();
});
elements.routineBlockList.addEventListener("input", handleRoutineBlockInput);
elements.routineBlockList.addEventListener("change", handleRoutineBlockInput);
elements.routineBlockList.addEventListener("click", handleRoutineBlockClick);
elements.routineBlockList.addEventListener("dragstart", handleRoutineBlockDragStart);
elements.routineBlockList.addEventListener("dragover", handleRoutineBlockDragOver);
elements.routineBlockList.addEventListener("drop", handleRoutineBlockDrop);
elements.routineBlockList.addEventListener("dragend", handleRoutineBlockDragEnd);
elements.routineList.addEventListener("click", handleSavedRoutineClick);
elements.statsExerciseTabs.forEach((button) => {
  button.addEventListener("click", () => {
    closeStatsExercisePicker();
    if (selectedStatsExercise === button.dataset.statsExercise) return;
    selectedStatsExercise = button.dataset.statsExercise;
    renderStatistics();
  });
});
elements.statsExercisePickerButton?.addEventListener("click", () => {
  const isOpen = elements.statsExercisePicker.classList.toggle("open");
  elements.statsExercisePickerButton.setAttribute("aria-expanded", String(isOpen));
});
elements.statsTimeframeTabs.forEach((button) => {
  button.addEventListener("click", () => {
    if (selectedStatsTimeframe === button.dataset.statsTimeframe) return;
    selectedStatsTimeframe = button.dataset.statsTimeframe;
    renderStatistics();
  });
});
elements.statsGrid?.addEventListener("click", (event) => {
  const levelButton = event.target.closest("[data-nback-stats-level]");
  const modeButton = event.target.closest("[data-nback-stats-mode]");
  if (!levelButton && !modeButton) return;
  if (levelButton) selectedNBackStatsLevel = levelButton.dataset.nbackStatsLevel;
  if (modeButton) selectedNBackStatsMode = modeButton.dataset.nbackStatsMode;
  renderStatistics();
});
document.addEventListener("click", (event) => {
  if (elements.statsExercisePicker && !elements.statsExercisePicker.contains(event.target)) closeStatsExercisePicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeStatsExercisePicker();
});
window.addEventListener("resize", updateSegmentedControls);
elements.sideNavButtons.forEach((button) => {
  const section = button.dataset.section;
  if (["exercises", "statistics"].includes(section)) return;
  button.addEventListener("click", () => showPlaceholderSection(section));
});
elements.backToExercises.addEventListener("click", showExerciseHub);
elements.backToExercisesMot.addEventListener("click", showExerciseHub);
elements.backToExercisesRrt.addEventListener("click", showExerciseHub);
elements.backToExercisesCct.addEventListener("click", showExerciseHub);
elements.backToExercisesUfov.addEventListener("click", showExerciseHub);
elements.backToExercisesIct.addEventListener("click", showExerciseHub);
elements.start.addEventListener("click", startSession);
elements.quit.addEventListener("click", requestQuitSession);
elements.startRrt.addEventListener("click", startRrtSession);
elements.quitRrt.addEventListener("click", requestQuitRrtSession);
elements.rrtTrue.addEventListener("click", () => answerRrt(true));
elements.rrtFalse.addEventListener("click", () => answerRrt(false));
elements.startCct.addEventListener("click", startCctSession);
elements.quitCct.addEventListener("click", requestQuitCctSession);
elements.cctSubmitAnswer.addEventListener("click", submitCctAnswer);
elements.cctAnswerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitCctAnswer();
});
elements.cctAnswerInput.addEventListener("input", () => {
  elements.cctAnswerInput.value = elements.cctAnswerInput.value.replace(/\D/g, "").slice(0, 2);
});
elements.cctKeypadButtons.forEach((button) => {
  button.addEventListener("click", () => pressCctKey(button.dataset.cctKey));
});
elements.startUfov.addEventListener("click", startUfovSession);
elements.quitUfov.addEventListener("click", requestQuitUfovSession);
elements.startIct.addEventListener("click", startIctSession);
elements.quitIct.addEventListener("click", requestQuitIctSession);
elements.ictResponseButtons.forEach((button) => {
  button.addEventListener("click", () => answerIct(button.dataset.ictResponse));
});
elements.startMot.addEventListener("click", startMotSession);
elements.quitMot.addEventListener("click", requestQuitMotSession);
elements.nextMotTrial.addEventListener("click", startMotTrial);
elements.motStageFullscreen.addEventListener("click", toggleMotFullscreen);
elements.cancelQuit.addEventListener("click", closeQuitDialog);
elements.confirmQuit.addEventListener("click", () => {
  if (mot.running) {
    quitMotSession();
    return;
  }
  if (rrt.running) {
    quitRrtSession();
    return;
  }
  if (cct.running) {
    quitCctSession();
    return;
  }
  if (ufov.running) {
    quitUfovSession();
    return;
  }
  if (ict.running) {
    quitIctSession();
    return;
  }
  quitSession();
});
elements.responseButtons.forEach((button) => {
  button.addEventListener("click", () => markModality(button.dataset.response));
});

document.addEventListener("keydown", (event) => {
  if (ict.running && ["ArrowLeft", "ArrowRight", "KeyF", "KeyJ"].includes(event.code)) {
    event.preventDefault();
    answerIct(["ArrowLeft", "KeyF"].includes(event.code) ? "left" : "right");
    return;
  }
  const modality = modalityKeys[event.code];
  if (!modality) return;
  if (!session.running) return;
  event.preventDefault();
  markModality(modality);
});

function syncSettingLabels() {
  const trialTimeMs = clampNumber(elements.trialTime.value, 700, 5000);
  const trialCount = clampNumber(elements.trialCount.value, 12, 2400);
  const sessionTimerMinutes = clampNumber(elements.sessionTimer.value, 0.5, 60);
  elements.nLevelValue.textContent = `${elements.nLevel.value}-back`;
  elements.sessionTimerValue.textContent = formatDuration(sessionTimerMinutes * 60 * 1000);
  elements.trialTimeValue.textContent = `${trialTimeMs} ms`;
  elements.sessionDuration.textContent = formatDuration(
    trialCount * trialTimeMs
  );
  elements.matchChanceValue.textContent = `${elements.matchChance.value}%`;
  elements.interferenceValue.textContent = `${elements.interference.value}%`;
  elements.advanceThresholdValue.textContent = `${elements.advanceThreshold.value}%`;
  elements.advanceStreakValue.textContent = elements.advanceStreak.value;
  elements.dropThresholdValue.textContent = `${elements.dropThreshold.value}%`;
  elements.dropStreakValue.textContent = elements.dropStreak.value;
  syncNBackPresetButtons();
}

function applyNBackModalityPreset(preset) {
  const modalityPresets = {
    single: ["position"],
    dual: ["position", "audio"],
    triple: ["position", "color", "audio"],
    quad: ["position", "color", "shape", "audio"]
  };
  const selected = new Set(modalityPresets[preset] ?? modalityPresets.quad);
  elements.modalityInputs.forEach((input) => {
    input.checked = selected.has(input.dataset.modality);
  });
  syncNBackPresetButtons();
  updateResponseButtons();
}

function toggleNBackModality(modality) {
  const input = elements.modalityInputs.find((item) => item.dataset.modality === modality);
  if (!input) return;
  const activeCount = elements.modalityInputs.filter((item) => item.checked).length;
  if (input.checked && activeCount <= 1) return;
  input.checked = !input.checked;
  syncNBackPresetButtons();
  updateResponseButtons();
}

function syncNBackPresetButtons() {
  const nValue = String(elements.nLevel.value);
  elements.nbackLevelPresets.forEach((button) => {
    button.classList.toggle("active", button.dataset.nbackLevelPreset === nValue);
  });

  const selected = elements.modalityInputs
    .filter((input) => input.checked)
    .map((input) => input.dataset.modality);
  const presetBySignature = {
    position: "single",
    "audio,position": "dual",
    "audio,color,position": "triple",
    "audio,color,position,shape": "quad"
  };
  const signature = [...selected].sort().join(",");
  const activePreset = presetBySignature[signature] ?? "";
  elements.nbackModalityPresets.forEach((button) => {
    button.classList.toggle("active", button.dataset.nbackModalityPreset === activePreset);
  });
  elements.nbackModalityToggles.forEach((button) => {
    button.classList.toggle("active", selected.includes(button.dataset.nbackModalityToggle));
  });
  const sessionMinutes = Number(elements.sessionTimer.value);
  elements.nbackDurationPresets.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.nbackDurationPreset) === sessionMinutes);
  });
}

function updateTrialCountFromSessionTimer() {
  const sessionTimerMs = clampNumber(elements.sessionTimer.value, 0.5, 60) * 60 * 1000;
  const trialTimeMs = clampNumber(elements.trialTime.value, 700, 5000);
  elements.trialCount.value = clampNumber(Math.round(sessionTimerMs / trialTimeMs), 12, 2400);
  syncSettingLabels();
}

function updateSessionTimerFromTrialCount() {
  const durationSeconds = Math.round(
    clampNumber(elements.trialCount.value, 12, 2400) * clampNumber(elements.trialTime.value, 700, 5000) / 1000
  );
  elements.sessionTimer.value = clampNumber(durationSeconds / 60, 0.5, 60);
  syncSettingLabels();
}

function syncMotSettingLabels() {
  elements.motBallSpeedValue.textContent = Number(elements.motBallSpeed.value).toFixed(2);
  elements.motBallSizeValue.textContent = Number(elements.motBallSize.value).toFixed(1);
  elements.motTrackingDurationValue.textContent = `${elements.motTrackingDuration.value} ms`;
  elements.motHighlightDurationValue.textContent = `${elements.motHighlightDuration.value} ms`;
  elements.motBallOpacityValue.textContent = Number(elements.motBallOpacity.value).toFixed(2);
  elements.motCameraRotationSpeedValue.textContent = Number(elements.motCameraRotationSpeed.value).toFixed(3);
  elements.motCameraDistanceValue.textContent = elements.motCameraDistance.value;
  elements.motSpeedStat.textContent = Number(elements.motBallSpeed.value).toFixed(2);
}

function syncRrtSettingLabels() {
  elements.rrtPremiseCountValue.textContent = `${elements.rrtPremiseCount.value} qty`;
  elements.rrtTimerSecondsValue.textContent = `${elements.rrtTimerSeconds.value} sec`;
  elements.rrtNonsenseLengthValue.textContent = `${elements.rrtNonsenseLength.value} letters`;
  elements.rrtGarbageLengthValue.textContent = `${elements.rrtGarbageLength.value} letters`;
  elements.rrtPremiseStat.textContent = `${elements.rrtPremiseCount.value}p`;
  elements.rrtTimeLeft.textContent = elements.rrtTimerEnabled.checked ? elements.rrtTimerSeconds.value : "--";
  elements.rrtTimerUnit.textContent = elements.rrtTimerEnabled.checked ? "sec" : "off";
  elements.rrtTimerSeconds.disabled = !elements.rrtTimerEnabled.checked;
  elements.appShell.classList.toggle("rrt-timer-off", !elements.rrtTimerEnabled.checked);
}

function syncCctSettingLabels() {
  const durationSeconds = clampNumber(elements.cctDuration.value, 30, 3600);
  elements.cctDurationValue.textContent = formatSecondsDuration(durationSeconds);
  elements.cctStartIntervalValue.textContent = `${Number(elements.cctStartInterval.value).toFixed(1)} sec`;
  elements.cctMinIntervalValue.textContent = `${Number(elements.cctMinInterval.value).toFixed(1)} sec`;
  elements.cctDurationPresets.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.cctDuration) === durationSeconds);
  });
  elements.cctStartIntervalPresets.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.cctStartPreset) === Number(elements.cctStartInterval.value));
  });
  elements.cctMinIntervalPresets.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.cctMinPreset) === Number(elements.cctMinInterval.value));
  });
}

function syncUfovSettingLabels() {
  elements.ufovDurationValue.textContent = `${elements.ufovDuration.value} ms`;
  elements.ufovDurationStat.textContent = elements.ufovDuration.value;
}

function syncIctSettingLabels() {
  elements.ictStopProbabilityValue.textContent = `${elements.ictStopProbability.value}%`;
  elements.ictSsdValue.textContent = `${elements.ictSsd.value} ms`;
  elements.ictSsdStat.textContent = Math.round(Number(elements.ictSsd.value));
}

function openNBackSettings() {
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("nback-open");
  elements.pageTitle.textContent = "Quad N-Back";
  elements.pageLede.textContent = "Track position, color, shape, and audio. Press the matching modality when the current cue matches N steps back.";
}

function openMotSettings() {
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("mot-open");
  elements.pageTitle.textContent = "3D MOT";
  elements.pageLede.textContent = "Track highlighted targets in a 3D field. The targets are shown while everything is still, then all balls move and become identical.";
  initMotScene();
  renderMotStatic();
}

function openRrtSettings() {
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "mot-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("rrt-open");
  elements.pageTitle.textContent = "Relational Reasoning";
  elements.pageLede.textContent = "Read the premises, build the relation mentally, then judge whether the conclusion is true or false.";
}

function openCctSettings() {
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("cct-open");
  elements.pageTitle.textContent = "Cognitive Control Training";
  elements.pageLede.textContent = "Hear or see each digit, then enter the sum of that digit and the one immediately before it.";
}

function openUfovSettings() {
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ict-open", "stats-open", "profile-open", "placeholder-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("ufov-open");
  elements.pageTitle.textContent = "UFOV";
  elements.pageLede.textContent = "Identify the center symbol and locate a brief peripheral target among distractors.";
  renderUfovPreview();
}

function openIctSettings() {
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "stats-open", "profile-open", "placeholder-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("ict-open");
  elements.pageTitle.textContent = "Inhibitory Control Training";
  elements.pageLede.textContent = "Respond quickly to go cues, but withhold your response when the stop signal appears.";
  renderIctPreview();
}

function showExerciseHub() {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  elements.appShell.classList.remove("dashboard-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("exercises-open");
  setActiveTab("exercises");
  elements.pageTitle.textContent = "Training";
  elements.pageLede.textContent = "Build routines first, or open a standalone cognitive training module below.";
  elements.start.disabled = false;
  elements.quit.disabled = true;
  elements.startMot.disabled = false;
  elements.quitMot.disabled = true;
  elements.startRrt.disabled = false;
  elements.quitRrt.disabled = true;
  elements.startCct.disabled = false;
  elements.quitCct.disabled = true;
  elements.startUfov.disabled = false;
  elements.quitUfov.disabled = true;
  elements.startIct.disabled = false;
  elements.quitIct.disabled = true;
  updateResponseButtons();
}

function showStatistics() {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "placeholder-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("profile-open");
  setActiveTab("statistics");
  elements.pageTitle.textContent = "Profile";
  elements.pageLede.textContent = "";
}

function toggleProfileDataPanel(panel) {
  const isTests = panel === "tests";
  const targetPanel = isTests ? elements.profileTestsPanel : elements.profileExercisesPanel;
  const targetButton = isTests ? elements.profileTestsToggle : elements.profileExercisesToggle;
  const otherPanel = isTests ? elements.profileExercisesPanel : elements.profileTestsPanel;
  const otherButton = isTests ? elements.profileExercisesToggle : elements.profileTestsToggle;
  const shouldOpen = targetPanel.hidden;

  targetPanel.hidden = !shouldOpen;
  otherPanel.hidden = true;
  elements.profileDataPanels.hidden = !shouldOpen;
  targetButton.classList.toggle("active", shouldOpen);
  otherButton.classList.remove("active");
  targetButton.setAttribute("aria-expanded", String(shouldOpen));
  otherButton.setAttribute("aria-expanded", "false");
  if (shouldOpen) renderStatistics();
  updateSegmentedControls();
}

function setActiveTab(tab) {
  elements.sideNavButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === tab);
  });
}

function showPlaceholderSection(section) {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  const copy = {
    daily: ["Daily", "Daily tasks, puzzles, and streak work will live here."],
    leaderboard: ["Leaderboard", "Progress rankings and competition systems will live here."],
    assessments: ["Assessments", "Formal cognitive tests and cooldown rules will live here."]
  };
  const [title, description] = copy[section] ?? ["Section", "This area is reserved for the next production system."];
  elements.appShell.classList.remove("dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("placeholder-open");
  setActiveTab(section);
  elements.pageTitle.textContent = title;
  elements.pageLede.textContent = description;
  elements.placeholderTitle.textContent = title;
  elements.placeholderCopy.textContent = description;
}

function showRoutineNotice(message) {
  const emptyState = document.querySelector(".routine-empty");
  if (!emptyState) return;
  emptyState.querySelector("p").textContent = message;
}

function createEmptyRoutine() {
  return {
    id: `routine-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "Focus stack",
    blocks: []
  };
}

function createRoutineBlock(exerciseId = "nback") {
  return {
    id: `block-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    exerciseId,
    timeMinutes: routineExerciseMeta[exerciseId]?.defaultMinutes ?? 3,
    trialCount: "",
    settings: defaultRoutineSettings(exerciseId)
  };
}

function defaultRoutineSettings(exerciseId) {
  const defaults = {
    nback: { n: 2, modalities: ["position", "color", "shape", "audio"], trialTimeMs: 2500, matchChance: 25, interference: 20, feedback: "show", autoProgression: true },
    rrt: { premiseCount: 2, timerSeconds: 30, timerEnabled: true, vocabulary: "nonsense", useNouns: true, useAdjectives: false, visualNoise: 5, scrambleFactor: 80 },
    cct: { durationMinutes: 5, startingIntervalSeconds: 5, minimumIntervalSeconds: 0.5, adaptive: true, correctStepMs: 120, wrongStepMs: 220 },
    ict: { cueType: "arrows", stopProbability: 25, calibrationTrials: 8, fixationMs: 500, stopSignalDelayMs: 250, stopSignalStepMs: 50, stopSignalMode: "triangle", softDeadlineMs: 1200 },
    mot: { targetCount: 4, blueDistractors: 4, coloredDistractors: 0, ballSpeed: 0.25, ballSize: 1.8, trackingDurationMs: 7500, highlightDurationMs: 1800, autoContinue: true },
    ufov: { trialCount: 16, stimulusDurationMs: 900, minStimulusDurationMs: 180, distractors: 20, autoProgression: true }
  };
  return structuredClone(defaults[exerciseId] ?? {});
}

function openRoutineBuilder(routine = null) {
  routineDraft = routine ? structuredClone(routine) : createEmptyRoutine();
  if (!routineDraft.blocks.length) routineDraft.blocks.push(createRoutineBlock("nback"));
  elements.routineDialogTitle.textContent = routine ? "Edit routine" : "Create routine";
  elements.deleteRoutine.hidden = !routine;
  renderRoutineDraft();
  if (typeof elements.routineDialog.showModal === "function") {
    elements.routineDialog.showModal();
  }
}

function openRoutineLoader() {
  const routines = loadRoutines();
  if (!routines.length) {
    openRoutineBuilder();
    return;
  }
  openRoutineBuilder(routines[0]);
}

function closeRoutineDialog() {
  elements.routineDialog.close();
}

function addRoutineBlock(exerciseId) {
  routineDraft.blocks.push(createRoutineBlock(exerciseId));
  renderRoutineDraft();
}

function renderRoutineDraft() {
  elements.routineName.value = routineDraft.name ?? "";
  elements.routineEstimatedTotal.textContent = formatRoutineDuration(estimateRoutineSeconds(routineDraft));
  elements.routineBlockList.innerHTML = routineDraft.blocks.length
    ? routineDraft.blocks.map((block, index) => routineBlockTemplate(block, index)).join("")
    : `<div class="routine-block-empty">Add an exercise to start building the routine.</div>`;
}

function routineBlockTemplate(block, index) {
  const meta = routineExerciseMeta[block.exerciseId] ?? routineExerciseMeta.nback;
  return `
    <article class="routine-block" data-block-id="${escapeHtml(block.id)}" draggable="true">
      <div class="routine-block-header">
        <div class="routine-block-title">
          <button class="routine-drag-handle" type="button" aria-label="Drag ${escapeHtml(meta.label)} block" title="Drag to reorder">::</button>
          <div>
            <strong>${index + 1}. ${escapeHtml(meta.label)}</strong>
            <span data-routine-block-estimate>${formatRoutineDuration(estimateRoutineBlockSeconds(block))}</span>
          </div>
        </div>
        <div class="routine-block-actions">
          <button class="routine-icon-button" type="button" data-routine-action="toggle-settings" aria-label="Edit ${escapeHtml(meta.label)} settings">${routineIcon("edit")}</button>
          <button class="routine-icon-button" type="button" data-routine-action="duplicate" aria-label="Duplicate ${escapeHtml(meta.label)} block">${routineIcon("duplicate")}</button>
          <button class="routine-icon-button" type="button" data-routine-action="remove" aria-label="Remove ${escapeHtml(meta.label)} block">${routineIcon("trash")}</button>
        </div>
      </div>
      <details class="routine-settings">
        <summary>Edit block</summary>
        <div class="routine-settings-grid">
          ${routineSettingsTemplate(block)}
        </div>
      </details>
    </article>
  `;
}

function routineIcon(name) {
  const icons = {
    edit: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
    duplicate: `<svg aria-hidden="true" viewBox="0 0 24 24"><rect width="13" height="13" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2"/></svg>`,
    trash: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`
  };
  return icons[name] ?? "";
}

function routineSettingsTemplate(block) {
  const settings = block.settings ?? {};
  const baseControls = routineBaseSettingsTemplate(block);
  if (block.exerciseId === "nback") {
    const modalities = settings.modalities ?? [];
    return `
      ${baseControls}
      <label><span>N level</span><input data-setting-field="n" type="number" min="1" max="8" value="${settings.n ?? 2}"></label>
      <label><span>Trial time</span><input data-setting-field="trialTimeMs" type="number" min="700" max="5000" step="100" value="${settings.trialTimeMs ?? 2500}"></label>
      <label><span>Match chance</span><input data-setting-field="matchChance" type="number" min="5" max="60" step="5" value="${settings.matchChance ?? 25}"></label>
      <label><span>Interference</span><input data-setting-field="interference" type="number" min="0" max="60" step="5" value="${settings.interference ?? 20}"></label>
      <label><span>Feedback</span><select data-setting-field="feedback"><option value="show" ${settings.feedback !== "hide" ? "selected" : ""}>Show</option><option value="hide" ${settings.feedback === "hide" ? "selected" : ""}>Hide</option></select></label>
      <label><span>Progression</span><select data-setting-field="autoProgression"><option value="true" ${settings.autoProgression !== false ? "selected" : ""}>On</option><option value="false" ${settings.autoProgression === false ? "selected" : ""}>Off</option></select></label>
      <div class="routine-setting-checks">
        ${["position", "color", "shape", "audio"].map((item) => (
          `<label><input data-setting-modality="${item}" type="checkbox" ${modalities.includes(item) ? "checked" : ""}> ${item}</label>`
        )).join("")}
      </div>
    `;
  }
  if (block.exerciseId === "rrt") {
    return `
      ${baseControls}
      <label><span>Premises</span><input data-setting-field="premiseCount" type="number" min="2" max="6" value="${settings.premiseCount ?? 2}"></label>
      <label><span>Timer sec</span><input data-setting-field="timerSeconds" type="number" min="5" max="120" value="${settings.timerSeconds ?? 30}"></label>
      <label><span>Timer</span><select data-setting-field="timerEnabled"><option value="true" ${settings.timerEnabled !== false ? "selected" : ""}>On</option><option value="false" ${settings.timerEnabled === false ? "selected" : ""}>Off</option></select></label>
      <label><span>Vocabulary</span><select data-setting-field="vocabulary"><option value="nonsense" ${settings.vocabulary === "nonsense" ? "selected" : ""}>Nonsense</option><option value="meaningful" ${settings.vocabulary === "meaningful" ? "selected" : ""}>Meaningful</option><option value="emoji" ${settings.vocabulary === "emoji" ? "selected" : ""}>Emoji</option></select></label>
      <label><span>Visual noise</span><input data-setting-field="visualNoise" type="number" min="0" max="20" value="${settings.visualNoise ?? 5}"></label>
      <label><span>Scramble</span><input data-setting-field="scrambleFactor" type="number" min="0" max="100" value="${settings.scrambleFactor ?? 80}"></label>
    `;
  }
  if (block.exerciseId === "cct") {
    return `
      ${baseControls}
      <label><span>Duration</span><input data-setting-field="durationMinutes" type="number" min="0.5" max="60" step="0.5" value="${settings.durationMinutes ?? 5}"></label>
      <label><span>Start interval</span><input data-setting-field="startingIntervalSeconds" type="number" min="0.5" max="10" step="0.5" value="${settings.startingIntervalSeconds ?? 5}"></label>
      <label><span>Min interval</span><input data-setting-field="minimumIntervalSeconds" type="number" min="0.5" max="10" step="0.5" value="${settings.minimumIntervalSeconds ?? 0.5}"></label>
      <label><span>Adaptive</span><select data-setting-field="adaptive"><option value="true" ${settings.adaptive !== false ? "selected" : ""}>On</option><option value="false" ${settings.adaptive === false ? "selected" : ""}>Off</option></select></label>
      <label><span>Correct step</span><input data-setting-field="correctStepMs" type="number" min="0" max="1000" step="20" value="${settings.correctStepMs ?? 120}"></label>
      <label><span>Wrong step</span><input data-setting-field="wrongStepMs" type="number" min="0" max="1500" step="20" value="${settings.wrongStepMs ?? 220}"></label>
    `;
  }
  if (block.exerciseId === "ict") {
    return `
      ${baseControls}
      <label><span>Cue type</span><select data-setting-field="cueType"><option value="arrows" ${settings.cueType !== "food" ? "selected" : ""}>Arrows</option><option value="food" ${settings.cueType === "food" ? "selected" : ""}>Food cues</option></select></label>
      <label><span>Stop %</span><input data-setting-field="stopProbability" type="number" min="5" max="50" step="5" value="${settings.stopProbability ?? 25}"></label>
      <label><span>Calibration</span><input data-setting-field="calibrationTrials" type="number" min="0" max="40" value="${settings.calibrationTrials ?? 8}"></label>
      <label><span>Fixation</span><input data-setting-field="fixationMs" type="number" min="100" max="2000" step="50" value="${settings.fixationMs ?? 500}"></label>
      <label><span>Initial SSD</span><input data-setting-field="stopSignalDelayMs" type="number" min="80" max="900" step="10" value="${settings.stopSignalDelayMs ?? 250}"></label>
      <label><span>SSD step</span><input data-setting-field="stopSignalStepMs" type="number" min="10" max="150" step="10" value="${settings.stopSignalStepMs ?? 50}"></label>
      <label><span>Stop signal</span><select data-setting-field="stopSignalMode"><option value="triangle" ${settings.stopSignalMode !== "text" && settings.stopSignalMode !== "sound" ? "selected" : ""}>Triangle</option><option value="text" ${settings.stopSignalMode === "text" ? "selected" : ""}>STOP text</option><option value="sound" ${settings.stopSignalMode === "sound" ? "selected" : ""}>Sound</option></select></label>
      <label><span>Deadline</span><input data-setting-field="softDeadlineMs" type="number" min="350" max="3000" step="50" value="${settings.softDeadlineMs ?? 1200}"></label>
    `;
  }
  if (block.exerciseId === "mot") {
    return `
      ${baseControls}
      <label><span>Targets</span><input data-setting-field="targetCount" type="number" min="1" max="12" value="${settings.targetCount ?? 4}"></label>
      <label><span>Blue distractors</span><input data-setting-field="blueDistractors" type="number" min="0" max="30" value="${settings.blueDistractors ?? 4}"></label>
      <label><span>Color distractors</span><input data-setting-field="coloredDistractors" type="number" min="0" max="30" value="${settings.coloredDistractors ?? 0}"></label>
      <label><span>Speed</span><input data-setting-field="ballSpeed" type="number" min="0.05" max="1.5" step="0.01" value="${settings.ballSpeed ?? 0.25}"></label>
      <label><span>Ball size</span><input data-setting-field="ballSize" type="number" min="0.6" max="4" step="0.1" value="${settings.ballSize ?? 1.8}"></label>
      <label><span>Track ms</span><input data-setting-field="trackingDurationMs" type="number" min="2500" max="20000" step="500" value="${settings.trackingDurationMs ?? 7500}"></label>
      <label><span>Highlight ms</span><input data-setting-field="highlightDurationMs" type="number" min="500" max="5000" step="100" value="${settings.highlightDurationMs ?? 1800}"></label>
      <label><span>Flow</span><select data-setting-field="autoContinue"><option value="true" ${settings.autoContinue !== false ? "selected" : ""}>Auto</option><option value="false" ${settings.autoContinue === false ? "selected" : ""}>Manual</option></select></label>
    `;
  }
  return `
    ${baseControls}
    <label><span>Trials</span><input data-setting-field="trialCount" type="number" min="4" max="80" value="${settings.trialCount ?? 16}"></label>
    <label><span>Duration ms</span><input data-setting-field="stimulusDurationMs" type="number" min="120" max="1600" step="20" value="${settings.stimulusDurationMs ?? 900}"></label>
    <label><span>Min duration</span><input data-setting-field="minStimulusDurationMs" type="number" min="80" max="1000" step="20" value="${settings.minStimulusDurationMs ?? 180}"></label>
    <label><span>Distractors</span><input data-setting-field="distractors" type="number" min="0" max="80" value="${settings.distractors ?? 20}"></label>
    <label><span>Progression</span><select data-setting-field="autoProgression"><option value="true" ${settings.autoProgression !== false ? "selected" : ""}>On</option><option value="false" ${settings.autoProgression === false ? "selected" : ""}>Off</option></select></label>
  `;
}

function routineBaseSettingsTemplate(block) {
  return `
    <label>
      <span>Exercise</span>
      <select data-routine-field="exerciseId">
        ${Object.entries(routineExerciseMeta).map(([id, item]) => (
          `<option value="${id}" ${id === block.exerciseId ? "selected" : ""}>${escapeHtml(item.label)}</option>`
        )).join("")}
      </select>
    </label>
    <label>
      <span>Time amount</span>
      <input data-routine-field="timeMinutes" type="number" min="0" max="180" step="0.5" value="${escapeHtml(block.timeMinutes)}" placeholder="minutes">
    </label>
    <label>
      <span>Trial amount</span>
      <input data-routine-field="trialCount" type="number" min="0" max="300" step="1" value="${escapeHtml(block.trialCount)}" placeholder="optional">
    </label>
  `;
}

function handleRoutineBlockInput(event) {
  const blockElement = event.target.closest("[data-block-id]");
  if (!blockElement) return;
  const block = routineDraft.blocks.find((item) => item.id === blockElement.dataset.blockId);
  if (!block) return;
  if (event.target.dataset.routineField) {
    const field = event.target.dataset.routineField;
    if (field === "exerciseId") {
      block.exerciseId = event.target.value;
      block.settings = defaultRoutineSettings(block.exerciseId);
      renderRoutineDraft();
      return;
    } else {
      block[field] = event.target.value;
    }
    refreshRoutineEstimateOnly();
    return;
  }
  if (event.target.dataset.settingField) {
    block.settings[event.target.dataset.settingField] = parseRoutineSettingValue(event.target.value);
    refreshRoutineEstimateOnly();
    return;
  }
  if (event.target.dataset.settingModality) {
    const selected = new Set(block.settings.modalities ?? []);
    if (event.target.checked) selected.add(event.target.dataset.settingModality);
    else selected.delete(event.target.dataset.settingModality);
    block.settings.modalities = [...selected];
    refreshRoutineEstimateOnly();
  }
}

function handleRoutineBlockClick(event) {
  const action = event.target.closest("[data-routine-action]")?.dataset.routineAction;
  if (!action) return;
  const blockElement = event.target.closest("[data-block-id]");
  const index = routineDraft.blocks.findIndex((item) => item.id === blockElement?.dataset.blockId);
  if (index < 0) return;
  if (action === "toggle-settings") {
    const details = blockElement.querySelector(".routine-settings");
    if (details) details.open = !details.open;
    return;
  }
  if (action === "remove") routineDraft.blocks.splice(index, 1);
  if (action === "duplicate") routineDraft.blocks.splice(index + 1, 0, structuredClone({ ...routineDraft.blocks[index], id: `block-${Date.now()}-${Math.random().toString(16).slice(2)}` }));
  renderRoutineDraft();
}

function refreshRoutineEstimateOnly() {
  elements.routineEstimatedTotal.textContent = formatRoutineDuration(estimateRoutineSeconds(routineDraft));
  elements.routineBlockList.querySelectorAll("[data-block-id]").forEach((blockElement) => {
    const block = routineDraft.blocks.find((item) => item.id === blockElement.dataset.blockId);
    const estimate = blockElement.querySelector("[data-routine-block-estimate]");
    if (block && estimate) estimate.textContent = formatRoutineDuration(estimateRoutineBlockSeconds(block));
  });
}

function handleRoutineBlockDragStart(event) {
  const blockElement = event.target.closest("[data-block-id]");
  if (!blockElement) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", blockElement.dataset.blockId);
  blockElement.classList.add("dragging");
}

function handleRoutineBlockDragOver(event) {
  const target = event.target.closest("[data-block-id]");
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  elements.routineBlockList.querySelectorAll(".routine-block").forEach((block) => {
    block.classList.toggle("drag-over", block === target);
  });
}

function handleRoutineBlockDrop(event) {
  const target = event.target.closest("[data-block-id]");
  const sourceId = event.dataTransfer.getData("text/plain");
  if (!target || !sourceId || target.dataset.blockId === sourceId) return;
  event.preventDefault();
  const fromIndex = routineDraft.blocks.findIndex((item) => item.id === sourceId);
  const toIndex = routineDraft.blocks.findIndex((item) => item.id === target.dataset.blockId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = routineDraft.blocks.splice(fromIndex, 1);
  routineDraft.blocks.splice(toIndex, 0, moved);
  renderRoutineDraft();
}

function handleRoutineBlockDragEnd() {
  elements.routineBlockList.querySelectorAll(".routine-block").forEach((block) => {
    block.classList.remove("dragging", "drag-over");
  });
}

function handleSavedRoutineClick(event) {
  const action = event.target.dataset.routineAction;
  const id = event.target.closest("[data-routine-id]")?.dataset.routineId;
  if (!action || !id) return;
  const routine = loadRoutines().find((item) => item.id === id);
  if (!routine) return;
  openRoutineBuilder(routine);
}

function saveRoutineDraft() {
  const routines = loadRoutines();
  const normalized = {
    ...routineDraft,
    name: elements.routineName.value.trim() || "Untitled routine",
    updatedAt: new Date().toISOString()
  };
  const existingIndex = routines.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) routines[existingIndex] = normalized;
  else routines.unshift(normalized);
  saveRoutines(routines);
  routineDraft = structuredClone(normalized);
  renderRoutineList();
  renderRoutineDraft();
}

function deleteRoutineDraft() {
  saveRoutines(loadRoutines().filter((item) => item.id !== routineDraft.id));
  closeRoutineDialog();
  renderRoutineList();
}

function renderRoutineList() {
  const routines = loadRoutines();
  elements.routineEmpty.hidden = routines.length > 0;
  elements.routineList.innerHTML = routines.map((routine) => `
    <article class="routine-card" data-routine-id="${escapeHtml(routine.id)}">
      <div>
        <h3>${escapeHtml(routine.name)}</h3>
        <p>${routine.blocks.length} exercises • ${formatRoutineDuration(estimateRoutineSeconds(routine))}</p>
      </div>
      <div class="routine-card-actions">
        <button type="button" data-routine-action="edit">Load</button>
      </div>
    </article>
  `).join("");
}

function loadRoutines() {
  try {
    return JSON.parse(localStorage.getItem(routineStorageKey)) ?? [];
  } catch {
    return [];
  }
}

function saveRoutines(routines) {
  localStorage.setItem(routineStorageKey, JSON.stringify(routines));
}

function estimateRoutineSeconds(routine) {
  return routine.blocks.reduce((sum, block) => sum + estimateRoutineBlockSeconds(block), 0);
}

function estimateRoutineBlockSeconds(block) {
  const meta = routineExerciseMeta[block.exerciseId] ?? routineExerciseMeta.nback;
  const timeSeconds = Number(block.timeMinutes) > 0 ? Number(block.timeMinutes) * 60 : 0;
  const trialSeconds = Number(block.trialCount) > 0 ? Number(block.trialCount) * routineSecondsPerTrial(block) : 0;
  return Math.max(timeSeconds, trialSeconds, meta.defaultMinutes * 60);
}

function routineSecondsPerTrial(block) {
  const settings = block.settings ?? {};
  if (block.exerciseId === "nback") return Math.max(0.7, Number(settings.trialTimeMs ?? 2500) / 1000);
  if (block.exerciseId === "rrt") return Math.max(5, Number(settings.timerSeconds ?? 30));
  if (block.exerciseId === "cct") return Math.max(0.5, Number(settings.startingIntervalSeconds ?? 5));
  if (block.exerciseId === "ict") return Math.max(0.45, (Number(settings.fixationMs ?? 500) + Number(settings.softDeadlineMs ?? 1200)) / 1000);
  if (block.exerciseId === "mot") {
    return Math.max(2, (Number(settings.highlightDurationMs ?? 1800) + Number(settings.trackingDurationMs ?? 7500) + 1200) / 1000);
  }
  if (block.exerciseId === "ufov") return Math.max(0.3, Number(settings.stimulusDurationMs ?? 900) / 1000 + 0.4);
  return routineExerciseMeta[block.exerciseId]?.secondsPerTrial ?? 2;
}

function formatRoutineDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function parseRoutineSettingValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  const number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function startSession() {
  clearTimers();
  renderBoard();
  const n = clampNumber(elements.nLevel.value, 1, 8);
  const trialCount = clampNumber(elements.trialCount.value, 12, 2400);
  session.config = createQuadNBackConfig({
    n,
    trialCount,
    activeModalities: activeModalities(),
    matchChance: clampNumber(elements.matchChance.value, 5, 60) / 100,
    interferenceChance: clampNumber(elements.interference.value, 0, 60) / 100
  });
  session.trials = generateQuadNBackTrials(session.config);
  session.results = [];
  session.trialIndex = 0;
  session.startedAt = Date.now();
  session.responses = {};
  session.reactionTimesMs = {};
  session.running = false;
  session.countingDown = true;
  elements.appShell.classList.add("nback-open", "game-active", "nback-game-active");
  elements.start.disabled = true;
  elements.quit.disabled = false;
  updateResponseButtons();
  elements.output.textContent = "";
  elements.feedback.textContent = feedbackEnabled() ? "Get ready." : "";
  elements.state.textContent = `${session.config.activeModalities.length}-modality ${n}-back`;
  elements.progress.textContent = `0 / ${session.trials.length}`;
  updateLiveStats();
  startCountdown();
}

function requestQuitSession() {
  if (!session.running && !session.countingDown) return;
  if (typeof elements.quitDialog.showModal === "function") {
    elements.quitDialog.showModal();
    return;
  }
  quitSession();
}

function closeQuitDialog() {
  elements.quitDialog.close();
}

function quitSession() {
  clearTimers();
  const savedProgress = saveNBackProgress("quit");
  session.running = false;
  session.countingDown = false;
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "nback-game-active");
  elements.start.disabled = false;
  elements.quit.disabled = true;
  updateResponseButtons();
  elements.state.textContent = "Ready";
  elements.progress.textContent = "0 / 0";
  elements.countdown.textContent = "";
  elements.countdown.hidden = true;
  elements.stage.classList.remove("countdown-active");
  clearBoard();
  clearResponseFeedback();
  elements.output.textContent = JSON.stringify(savedProgress, null, 2);
}

function startCountdown() {
  const steps = ["3", "2", "1"];
  let index = 0;
  elements.stage.classList.add("countdown-active");
  elements.countdown.hidden = false;
  clearBoard();
  showCountdownStep();

  function showCountdownStep() {
    if (index >= steps.length) {
      elements.countdown.textContent = "";
      elements.countdown.hidden = true;
      elements.stage.classList.remove("countdown-active");
      session.countingDown = false;
      session.running = true;
      updateResponseButtons();
      showTrial();
      return;
    }

    elements.countdown.textContent = steps[index];
    elements.countdown.classList.remove("countdown-pop");
    void elements.countdown.offsetWidth;
    elements.countdown.classList.add("countdown-pop");
    index += 1;
    schedule(showCountdownStep, 850);
  }
}

function startExerciseCountdown(stageElement, scheduleFn, isActive, onComplete) {
  const steps = ["3", "2", "1"];
  let index = 0;
  const countdown = document.createElement("div");
  countdown.className = "exercise-countdown-overlay";
  stageElement.append(countdown);
  showStep();

  function showStep() {
    if (!isActive()) {
      countdown.remove();
      return;
    }

    if (index >= steps.length) {
      countdown.remove();
      onComplete();
      return;
    }

    countdown.textContent = steps[index];
    countdown.classList.remove("countdown-pop");
    void countdown.offsetWidth;
    countdown.classList.add("countdown-pop");
    index += 1;
    scheduleFn(showStep, 850);
  }
}

function clearExerciseCountdown(stageElement) {
  stageElement?.querySelector(".exercise-countdown-overlay")?.remove();
}

function showTrial() {
  if (!session.running) return;
  if (session.trialIndex >= session.trials.length) {
    finishSession();
    return;
  }

  const trial = session.trials[session.trialIndex];
  session.responses = {};
  session.reactionTimesMs = {};
  session.trialStartedAt = performance.now();
  clearResponseFeedback();
  elements.progress.textContent = `${session.trialIndex + 1} / ${session.trials.length}`;
  elements.state.textContent = trial.trialIndex < session.config.n
    ? "Load sequence"
    : "Watch for matches";
  updateResponseButtons();
  showCues(trial);

  schedule(() => {
    finishTrial();
  }, Number(elements.trialTime.value));
}

function markModality(modality) {
  if (!session.running || !session.config.activeModalities.includes(modality)) return;
  if (session.responses[modality]) return;
  const trial = session.trials[session.trialIndex];
  session.responses[modality] = true;
  session.reactionTimesMs[modality] = Math.round(performance.now() - session.trialStartedAt);
  const button = elements.responseButtons.find((item) => item.dataset.response === modality);
  button?.classList.add(trial.targets[modality] ? "correct" : "wrong");
}

function finishTrial() {
  if (!session.running) return;
  const trial = session.trials[session.trialIndex];
  if (!trial || session.results.some((result) => result.trialIndex === trial.trialIndex)) return;

  const feedback = trialFeedback(trial, session.responses);
  session.results.push({
    ...trial,
    responses: { ...session.responses },
    reactionTimesMs: { ...session.reactionTimesMs }
  });
  session.trialIndex += 1;
  updateLiveStats();
  showFeedback(feedback);
  clearBoard();
  schedule(showTrial, feedbackEnabled() ? 360 : 80);
}

function finishSession() {
  clearTimers();
  session.running = false;
  session.countingDown = false;
  elements.start.disabled = false;
  elements.quit.disabled = true;
  updateResponseButtons();
  clearBoard();
  elements.stage.classList.remove("countdown-active");

  if (session.results.length === 0) {
    elements.output.textContent = JSON.stringify(saveNBackProgress("complete"), null, 2);
    return;
  }

  const score = scoreQuadNBackSession(session.results, session.config.activeModalities);
  const nextLevel = progressionResult(score.accuracy);
  if (nextLevel !== session.config.n) {
    elements.nLevel.value = nextLevel;
    syncSettingLabels();
  }

  elements.state.textContent = "Complete";
  elements.progress.textContent = `${session.results.length} / ${session.trials.length}`;
  if (feedbackEnabled()) {
    elements.feedback.textContent = nextLevel > session.config.n
      ? `Auto progression: advanced to ${nextLevel}-back.`
      : nextLevel < session.config.n
        ? `Auto progression: moved down to ${nextLevel}-back.`
        : "Session complete.";
  }
  const savedProgress = saveNBackProgress("complete", score);
  elements.output.textContent = JSON.stringify({
    n: session.config.n,
    nextN: nextLevel,
    activeModalities: session.config.activeModalities,
    completedTrials: session.results.length,
    score,
    settings: settingsSummary(),
    today: savedProgress.today
  }, null, 2);
  elements.appShell.classList.remove("game-active", "nback-game-active");
}

function updateLiveStats() {
  const score = scoreQuadNBackSession(session.results, session.config?.activeModalities ?? activeModalities());
  elements.hits.textContent = score.hits;
  elements.misses.textContent = score.misses;
  elements.falseAlarms.textContent = score.falseAlarms;
  elements.dPrime.textContent = score.dPrime;
}

function saveNBackProgress(status, score = null) {
  const activeScore = score ?? scoreQuadNBackSession(session.results, session.config?.activeModalities ?? activeModalities());
  const settings = settingsSummary();
  const difficultyScore = calculateNBackDifficulty(settings);
  return recordExerciseProgress("nback", {
    status,
    durationMs: elapsedSessionMs(session.startedAt),
    completedTrials: session.results.length,
    correct: activeScore.hits,
    incorrect: activeScore.misses + activeScore.falseAlarms,
    accuracy: activeScore.accuracy,
    avgAnswerSpeedMs: averageNBackReactionTime(),
    difficultyScore,
    weightedScore: calculateWeightedScore(activeScore.accuracy, difficultyScore),
    settings,
    trialData: session.results
  });
}

function saveRrtProgress(status) {
  const correct = rrt.results.filter((result) => result.correct).length;
  const incorrect = rrt.results.length - correct;
  const settings = rrtSettingsSummary();
  const difficultyScore = calculateRrtDifficulty(settings, rrt.results);
  return recordExerciseProgress("rrt", {
    status,
    durationMs: elapsedSessionMs(rrt.startedAt),
    completedTrials: rrt.results.length,
    correct,
    incorrect,
    accuracy: rrt.results.length ? correct / rrt.results.length : 0,
    avgAnswerSpeedMs: meanRrtReactionTime(),
    difficultyScore,
    weightedScore: calculateWeightedScore(rrt.results.length ? correct / rrt.results.length : 0, difficultyScore),
    settings,
    trialData: rrt.results
  });
}

function saveMotProgress(status) {
  const correct = mot.results.filter((result) => result.correct).length;
  const incorrect = mot.results.length - correct;
  const settings = motSettingsSummary();
  const difficultyScore = calculateMotDifficulty(settings);
  return recordExerciseProgress("mot", {
    status,
    durationMs: elapsedSessionMs(mot.startedAt),
    completedTrials: mot.results.length,
    correct,
    incorrect,
    accuracy: mot.results.length ? correct / mot.results.length : 0,
    avgAnswerSpeedMs: mean(mot.selectionReactionTimesMs),
    difficultyScore,
    weightedScore: calculateWeightedScore(mot.results.length ? correct / mot.results.length : 0, difficultyScore),
    settings,
    trialData: mot.results
  });
}

function saveCctProgress(status) {
  const correct = cct.results.filter((result) => result.correct).length;
  const incorrect = cct.results.length - correct;
  const settings = cctSettingsSummary();
  const difficultyScore = calculateCctDifficulty(settings, cct.results);
  const accuracy = cct.results.length ? correct / cct.results.length : 0;
  return recordExerciseProgress("cct", {
    status,
    durationMs: elapsedSessionMs(cct.startedAt),
    completedTrials: cct.results.length,
    correct,
    incorrect,
    accuracy,
    avgAnswerSpeedMs: mean(cct.results.map((result) => result.reactionTimeMs)),
    difficultyScore,
    weightedScore: calculateWeightedScore(accuracy, difficultyScore),
    settings,
    trialData: cct.results
  });
}

function saveUfovProgress(status) {
  const correct = ufov.results.filter((result) => result.correct).length;
  const incorrect = ufov.results.length - correct;
  const settings = ufovSettingsSummary();
  const difficultyScore = calculateUfovDifficulty(settings);
  const accuracy = ufov.results.length ? correct / ufov.results.length : 0;
  return recordExerciseProgress("ufov", {
    status,
    durationMs: elapsedSessionMs(ufov.startedAt),
    completedTrials: ufov.results.length,
    correct,
    incorrect,
    accuracy,
    avgAnswerSpeedMs: mean(ufov.results.map((result) => result.reactionTimeMs)),
    difficultyScore,
    weightedScore: calculateWeightedScore(accuracy, difficultyScore),
    settings,
    trialData: ufov.results
  });
}

function saveIctProgress(status) {
  const correct = ict.results.filter((result) => result.correct).length;
  const incorrect = ict.results.length - correct;
  const settings = ictSettingsSummary();
  const difficultyScore = calculateIctDifficulty(settings, ict.results);
  const accuracy = ict.results.length ? correct / ict.results.length : 0;
  return recordExerciseProgress("ict", {
    status,
    durationMs: elapsedSessionMs(ict.startedAt),
    completedTrials: ict.results.length,
    correct,
    incorrect,
    accuracy,
    avgAnswerSpeedMs: mean(ict.results.filter((result) => !result.stopTrial).map((result) => result.reactionTimeMs)),
    difficultyScore,
    weightedScore: calculateWeightedScore(accuracy, difficultyScore),
    settings,
    trialData: ict.results
  });
}

function startRrtSession() {
  clearRrtTimers();
  clearExerciseCountdown(elements.rrtStageCard);
  rrt.config = readRrtConfig();
  rrt.running = true;
  rrt.results = [];
  rrt.trialIndex = 0;
  rrt.startedAt = Date.now();
  elements.appShell.classList.add("rrt-open", "game-active", "rrt-game-active");
  elements.startRrt.disabled = true;
  elements.quitRrt.disabled = false;
  elements.rrtTrue.disabled = true;
  elements.rrtFalse.disabled = true;
  elements.rrtOutput.textContent = "";
  elements.rrtSessionTotal.textContent = rrt.config.trialCount;
  elements.rrtState.textContent = "Get ready";
  elements.rrtProgress.textContent = `0 / ${rrt.config.trialCount}`;
  elements.rrtHeading.textContent = "Get ready.";
  elements.rrtPremises.innerHTML = "";
  elements.rrtConclusion.textContent = "First trial starts after the countdown.";
  elements.rrtFeedback.textContent = "Get ready.";
  startExerciseCountdown(elements.rrtStageCard, scheduleRrt, () => rrt.running, showRrtTrial);
}

function requestQuitRrtSession() {
  if (!rrt.running) return;
  if (typeof elements.quitDialog.showModal === "function") {
    elements.quitDialog.showModal();
    return;
  }
  quitRrtSession();
}

function quitRrtSession() {
  clearRrtTimers();
  clearExerciseCountdown(elements.rrtStageCard);
  const savedProgress = saveRrtProgress("quit");
  rrt.running = false;
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "rrt-game-active");
  elements.startRrt.disabled = false;
  elements.quitRrt.disabled = true;
  elements.rrtTrue.disabled = true;
  elements.rrtFalse.disabled = true;
  elements.rrtState.textContent = "Ready";
  elements.rrtProgress.textContent = "0 / 0";
  elements.rrtSessionTotal.textContent = "0";
  elements.rrtOutput.textContent = JSON.stringify(savedProgress, null, 2);
}

function showRrtTrial() {
  if (!rrt.running) return;
  if (rrt.trialIndex >= rrt.config.trialCount) {
    finishRrtSession();
    return;
  }
  rrt.trial = generateRrtTrial(rrt.config);
  rrt.trialStartedAt = performance.now();
  elements.rrtState.textContent = "Judge conclusion";
  elements.rrtProgress.textContent = `${rrt.trialIndex + 1} / ${rrt.config.trialCount}`;
  elements.rrtModeLabel.textContent = rrt.trial.mode;
  elements.rrtHeading.textContent = `${rrt.trial.premiseCount} premise ${rrt.trial.mode}`;
  elements.rrtPremiseStat.textContent = `${rrt.trial.premiseCount}p`;
  elements.rrtPremises.innerHTML = rrt.trial.premises.map((premise) => `<li>${premise}</li>`).join("");
  elements.rrtConclusion.textContent = rrt.trial.conclusion;
  elements.rrtFeedback.textContent = "True or false?";
  elements.rrtTrue.disabled = false;
  elements.rrtFalse.disabled = false;
  startRrtTimer();
}

function answerRrt(answer) {
  if (!rrt.running || !rrt.trial) return;
  clearRrtTimers();
  const result = scoreRrtAnswer(rrt.trial, answer, Math.round(performance.now() - rrt.trialStartedAt));
  rrt.results.push(result);
  rrt.trialIndex += 1;
  rrt.config = nextRrtConfig(rrt.config, rrt.results);
  elements.rrtPremiseCount.value = rrt.config.premiseCount;
  syncRrtSettingLabels();
  updateRrtStats();
  elements.rrtFeedback.textContent = result.correct
    ? "Correct."
    : `Wrong. Expected ${result.expected ? "TRUE" : "FALSE"}.`;
  elements.rrtTrue.disabled = true;
  elements.rrtFalse.disabled = true;
  scheduleRrt(showRrtTrial, 700);
}

function finishRrtSession() {
  clearRrtTimers();
  clearExerciseCountdown(elements.rrtStageCard);
  rrt.running = false;
  elements.startRrt.disabled = false;
  elements.quitRrt.disabled = true;
  elements.rrtTrue.disabled = true;
  elements.rrtFalse.disabled = true;
  elements.appShell.classList.remove("game-active", "rrt-game-active");
  elements.rrtState.textContent = "Complete";
  elements.rrtProgress.textContent = `${rrt.results.length} / ${rrt.config.trialCount}`;
  elements.rrtSessionTotal.textContent = rrt.config.trialCount;
  elements.rrtFeedback.textContent = "Session complete.";
  const savedProgress = saveRrtProgress("complete");
  elements.rrtOutput.textContent = JSON.stringify({
    completedTrials: rrt.results.length,
    correct: rrt.results.filter((result) => result.correct).length,
    meanReactionTimeMs: meanRrtReactionTime(),
    settings: rrtSettingsSummary(),
    today: savedProgress.today
  }, null, 2);
}

function startRrtTimer() {
  if (!rrt.config.timerEnabled) {
    rrt.timeLeft = null;
    elements.rrtTimeLeft.textContent = "--";
    elements.rrtTimerUnit.textContent = "off";
    return;
  }
  rrt.timeLeft = rrt.trial.timerSeconds ?? rrt.config.timerSeconds;
  elements.rrtTimeLeft.textContent = rrt.timeLeft;
  elements.rrtTimerUnit.textContent = "sec";
  scheduleRrt(tickRrtTimer, 1000);
}

function tickRrtTimer() {
  if (!rrt.running) return;
  rrt.timeLeft -= 1;
  elements.rrtTimeLeft.textContent = rrt.timeLeft;
  if (rrt.timeLeft <= 0) {
    answerRrt(!rrt.trial.isTrue);
    return;
  }
  scheduleRrt(tickRrtTimer, 1000);
}

function updateRrtStats() {
  elements.rrtCorrect.textContent = rrt.results.filter((result) => result.correct).length;
  elements.rrtWrong.textContent = rrt.results.filter((result) => !result.correct).length;
  elements.rrtPremiseStat.textContent = `${rrt.config.premiseCount}p`;
}

function readRrtConfig() {
  return createRelationalReasoningConfig({
    mode: "mixed",
    premiseCount: clampNumber(elements.rrtPremiseCount.value, 2, 6),
    trialCount: clampNumber(elements.rrtTrialCount.value, 1, 60),
    timerEnabled: elements.rrtTimerEnabled.checked,
    timerSeconds: clampNumber(elements.rrtTimerSeconds.value, 5, 90),
    vocabulary: selectedRrtVocabulary(),
    nonsenseLength: clampNumber(elements.rrtNonsenseLength.value, 2, 8),
    garbageLength: clampNumber(elements.rrtGarbageLength.value, 2, 12),
    autoProgression: elements.rrtAutoProgression.checked,
    dailyTargetMinutes: clampNumber(elements.rrtDailyTarget.value, 0, 240),
    weeklyTargetMinutes: clampNumber(elements.rrtWeeklyTarget.value, 0, 1200),
    visualNoiseSplits: clampNumber(elements.rrtVisualNoise.value, 0, 20),
    scrambleFactor: clampNumber(elements.rrtScrambleFactor.value, 0, 100),
    connectionBranching: elements.rrtConnectionBranching.checked,
    spoilerConclusion: elements.rrtSpoilerConclusion.checked,
    modeSettings: readRrtModeSettings()
  });
}

function rrtSettingsSummary() {
  return {
    profile: elements.rrtProfile.value,
    mode: "mixed",
    premiseCount: Number(elements.rrtPremiseCount.value),
    trialCount: Number(elements.rrtTrialCount.value),
    timerEnabled: elements.rrtTimerEnabled.checked,
    timerSeconds: Number(elements.rrtTimerSeconds.value),
    vocabulary: selectedRrtVocabulary(),
    nonsenseLength: Number(elements.rrtNonsenseLength.value),
    garbageLength: Number(elements.rrtGarbageLength.value),
    autoProgression: elements.rrtAutoProgression.checked,
    progressTargets: {
      dailyMinutes: Number(elements.rrtDailyTarget.value),
      weeklyMinutes: Number(elements.rrtWeeklyTarget.value)
    },
    visualNoiseSplits: Number(elements.rrtVisualNoise.value),
    scrambleFactor: Number(elements.rrtScrambleFactor.value),
    connectionBranching: elements.rrtConnectionBranching.checked,
    spoilerConclusion: elements.rrtSpoilerConclusion.checked,
    meaningfulWords: {
      nouns: elements.rrtUseNouns.checked,
      adjectives: elements.rrtUseAdjectives.checked
    },
    voronoiEmoji: elements.rrtUseVoronoiEmoji.checked,
    modeSettings: readRrtModeSettings()
  };
}

function selectedRrtVocabulary() {
  return elements.rrtVocabularyChoices.find((choice) => choice.checked)?.value ?? "nonsense";
}

function readRrtModeSettings() {
  return {
    distinction: readRrtModeSetting("Distinction", true),
    linear: {
      ...readRrtModeSetting("Linear", true),
      rotate180: elements.rrtLinear180.checked
    },
    space2d: readRrtModeSetting("Space2d", true),
    space3d: readRrtModeSetting("Space3d", false)
  };
}

function readRrtModeSetting(name, defaultEnabled) {
  const key = `rrt${name}`;
  const enabledElement = elements[`rrtEnable${name}`];
  const premiseElement = elements[`${key}Premises`];
  const timeElement = elements[`${key}Time`];
  const priorityElement = elements[`${key}Priority`];
  return {
    enabled: enabledElement ? enabledElement.checked : defaultEnabled,
    premiseCount: readOptionalNumber(premiseElement, 2, 6),
    timerSeconds: readOptionalNumber(timeElement, 5, 90),
    priority: clampNumber(priorityElement?.value ?? 100, 1, 300)
  };
}

function readOptionalNumber(input, min, max) {
  if (!input || input.value === "") return null;
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampNumber(value, min, max);
}

function resetRrtOutput() {
  elements.rrtOutput.textContent = JSON.stringify({
    input: "Press Start Session. Read the premises, infer the relation, then answer TRUE or FALSE.",
    settings: rrtSettingsSummary(),
    score: { correct: 0, wrong: 0 }
  }, null, 2);
}

function scheduleRrt(callback, delayMs) {
  const timer = setTimeout(() => {
    rrt.timers = rrt.timers.filter((item) => item !== timer);
    callback();
  }, delayMs);
  rrt.timers.push(timer);
}

function clearRrtTimers() {
  rrt.timers.forEach((timer) => clearTimeout(timer));
  rrt.timers = [];
}

function meanRrtReactionTime() {
  const times = rrt.results.map((result) => result.reactionTimeMs).filter(Number.isFinite);
  if (!times.length) return null;
  return Math.round(times.reduce((sum, time) => sum + time, 0) / times.length);
}

function startCctSession() {
  clearCctTimers();
  clearExerciseCountdown(elements.cctStageCard);
  cct.config = readCctConfig();
  cct.running = true;
  cct.results = [];
  cct.currentDigit = null;
  cct.previousDigit = null;
  cct.currentIntervalMs = cct.config.startingIntervalMs;
  cct.digitStartedAt = 0;
  cct.startedAt = Date.now();
  cct.endsAt = cct.startedAt + cct.config.durationSeconds * 1000;
  cct.answeredCurrent = true;
  cct.digitsShown = 0;
  elements.appShell.classList.add("cct-open", "game-active", "cct-game-active");
  elements.startCct.disabled = true;
  elements.quitCct.disabled = false;
  elements.cctSubmitAnswer.disabled = true;
  elements.cctAnswerInput.disabled = true;
  elements.cctAnswerInput.value = "";
  elements.cctDigit.textContent = "-";
  elements.cctState.textContent = "Get ready";
  elements.cctProgress.textContent = "0 answered";
  elements.cctFeedback.textContent = "First digit starts after the countdown.";
  elements.cctOutput.textContent = "";
  updateCctStats();
  startExerciseCountdown(elements.cctStageCard, scheduleCct, () => cct.running, () => {
    cct.startedAt = Date.now();
    cct.endsAt = cct.startedAt + cct.config.durationSeconds * 1000;
    elements.cctSubmitAnswer.disabled = false;
    elements.cctAnswerInput.disabled = false;
    showCctDigit();
  });
}

function requestQuitCctSession() {
  if (!cct.running) return;
  if (typeof elements.quitDialog.showModal === "function") {
    elements.quitDialog.showModal();
    return;
  }
  quitCctSession();
}

function quitCctSession() {
  clearCctTimers();
  clearExerciseCountdown(elements.cctStageCard);
  const savedProgress = saveCctProgress("quit");
  cct.running = false;
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "cct-game-active");
  elements.startCct.disabled = false;
  elements.quitCct.disabled = true;
  elements.cctSubmitAnswer.disabled = true;
  elements.cctAnswerInput.disabled = true;
  elements.cctState.textContent = "Ready";
  elements.cctProgress.textContent = "0 / 0";
  elements.cctDigit.textContent = "-";
  elements.cctFeedback.textContent = "Session saved.";
  elements.cctOutput.textContent = JSON.stringify(savedProgress, null, 2);
}

function showCctDigit() {
  if (!cct.running) return;
  if (Date.now() >= cct.endsAt) {
    finishCctSession();
    return;
  }
  if (cct.previousDigit !== null && !cct.answeredCurrent) {
    const result = scoreCctAnswer(cct.previousDigit, cct.currentDigit, null, null);
    cct.results.push({ ...result, timedOut: true, intervalMs: cct.currentIntervalMs });
    cct.currentIntervalMs = nextCctInterval(cct.config, cct.currentIntervalMs, result);
  }

  cct.previousDigit = cct.currentDigit;
  cct.currentDigit = createCctDigit();
  cct.digitsShown += 1;
  cct.answeredCurrent = cct.previousDigit === null;
  cct.digitStartedAt = performance.now();
  elements.cctDigit.textContent = cct.config.showDigits ? cct.currentDigit : "•";
  elements.cctAnswerInput.value = "";
  elements.cctState.textContent = cct.previousDigit === null ? "Listen" : "Add previous + current";
  elements.cctProgress.textContent = `${cct.results.length} answered`;
  elements.cctFeedback.textContent = cct.previousDigit === null ? "First digit. No answer yet." : "Enter the sum.";
  updateCctStats();
  if (cct.config.speakDigits) speakCue(String(cct.currentDigit));
  scheduleCct(showCctDigit, cct.currentIntervalMs);
}

function submitCctAnswer() {
  if (!cct.running || cct.previousDigit === null || cct.answeredCurrent) return;
  const value = elements.cctAnswerInput.value;
  if (!value) return;
  const result = scoreCctAnswer(cct.previousDigit, cct.currentDigit, value, Math.round(performance.now() - cct.digitStartedAt));
  cct.results.push({ ...result, intervalMs: cct.currentIntervalMs });
  cct.answeredCurrent = true;
  cct.currentIntervalMs = nextCctInterval(cct.config, cct.currentIntervalMs, result);
  elements.cctFeedback.textContent = result.correct ? "Correct." : `Wrong. Expected ${result.expected}.`;
  updateCctStats();
}

function pressCctKey(key) {
  if (key === "enter") {
    submitCctAnswer();
    return;
  }
  if (key === "back") {
    elements.cctAnswerInput.value = elements.cctAnswerInput.value.slice(0, -1);
    return;
  }
  elements.cctAnswerInput.value = `${elements.cctAnswerInput.value}${key}`.slice(0, 2);
}

function finishCctSession() {
  clearCctTimers();
  clearExerciseCountdown(elements.cctStageCard);
  cct.running = false;
  elements.startCct.disabled = false;
  elements.quitCct.disabled = true;
  elements.cctSubmitAnswer.disabled = true;
  elements.cctAnswerInput.disabled = true;
  elements.appShell.classList.remove("game-active", "cct-game-active");
  elements.cctState.textContent = "Complete";
  elements.cctFeedback.textContent = "Session complete.";
  const savedProgress = saveCctProgress("complete");
  elements.cctOutput.textContent = JSON.stringify({
    completedTrials: cct.results.length,
    correct: cct.results.filter((result) => result.correct).length,
    meanReactionTimeMs: mean(cct.results.map((result) => result.reactionTimeMs)),
    finalIntervalMs: cct.currentIntervalMs,
    settings: cctSettingsSummary(),
    today: savedProgress.today
  }, null, 2);
  updateCctStats();
}

function updateCctStats() {
  const correct = cct.results.filter((result) => result.correct).length;
  elements.cctCorrect.textContent = correct;
  elements.cctWrong.textContent = cct.results.length - correct;
  elements.cctIntervalStat.textContent = (cct.currentIntervalMs / 1000).toFixed(1);
  elements.cctTimeLeft.textContent = cct.running ? formatClock(Math.max(0, cct.endsAt - Date.now())) : formatClock(Number(elements.cctDuration.value) * 1000);
}

function readCctConfig() {
  return createCctConfig({
    durationSeconds: clampNumber(elements.cctDuration.value, 30, 3600),
    startingIntervalMs: clampNumber(elements.cctStartInterval.value, 0.5, 10) * 1000,
    minimumIntervalMs: clampNumber(elements.cctMinInterval.value, 0.5, 10) * 1000,
    speakDigits: true,
    showDigits: false,
    adaptive: elements.cctAdaptive.checked,
    correctStepMs: clampNumber(elements.cctCorrectStep.value, 0, 1000),
    wrongStepMs: clampNumber(elements.cctWrongStep.value, 0, 1500)
  });
}

function cctSettingsSummary() {
  return {
    durationSeconds: Number(elements.cctDuration.value),
    startingIntervalMs: Number(elements.cctStartInterval.value) * 1000,
    minimumIntervalMs: Number(elements.cctMinInterval.value) * 1000,
    speakDigits: true,
    showDigits: false,
    adaptive: elements.cctAdaptive.checked,
    correctStepMs: Number(elements.cctCorrectStep.value),
    wrongStepMs: Number(elements.cctWrongStep.value)
  };
}

function resetCctOutput() {
  elements.cctOutput.textContent = JSON.stringify({
    input: "Press Start Session. Add each new digit to the digit immediately before it.",
    settings: cctSettingsSummary(),
    score: { correct: 0, wrong: 0 }
  }, null, 2);
}

function scheduleCct(callback, delayMs) {
  const timer = setTimeout(() => {
    cct.timers = cct.timers.filter((item) => item !== timer);
    callback();
  }, delayMs);
  cct.timers.push(timer);
}

function clearCctTimers() {
  cct.timers.forEach((timer) => clearTimeout(timer));
  cct.timers = [];
}

function startUfovSession() {
  clearUfovTimers();
  clearExerciseCountdown(elements.ufovStageCard);
  ufov.config = readUfovConfig();
  ufov.running = true;
  ufov.results = [];
  ufov.trialIndex = 0;
  ufov.startedAt = Date.now();
  ufov.selectedCenter = null;
  ufov.selectedSector = null;
  ufov.acceptingAnswers = false;
  elements.appShell.classList.add("ufov-open", "game-active", "ufov-game-active");
  elements.startUfov.disabled = true;
  elements.quitUfov.disabled = false;
  elements.ufovOutput.textContent = "";
  elements.ufovState.textContent = "Get ready";
  elements.ufovProgress.textContent = `0 / ${ufov.config.trialCount}`;
  elements.ufovFeedback.textContent = "First trial starts after the countdown.";
  updateUfovStats();
  startExerciseCountdown(elements.ufovStageCard, scheduleUfov, () => ufov.running, showUfovTrial);
}

function requestQuitUfovSession() {
  if (!ufov.running) return;
  if (typeof elements.quitDialog.showModal === "function") {
    elements.quitDialog.showModal();
    return;
  }
  quitUfovSession();
}

function quitUfovSession() {
  clearUfovTimers();
  clearExerciseCountdown(elements.ufovStageCard);
  const savedProgress = saveUfovProgress("quit");
  ufov.running = false;
  ufov.acceptingAnswers = false;
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "ufov-game-active");
  elements.startUfov.disabled = false;
  elements.quitUfov.disabled = true;
  elements.ufovState.textContent = "Ready";
  elements.ufovProgress.textContent = "0 / 0";
  elements.ufovFeedback.textContent = "Session saved.";
  elements.ufovOutput.textContent = JSON.stringify(savedProgress, null, 2);
  renderUfovPreview();
}

function showUfovTrial() {
  if (!ufov.running) return;
  if (ufov.trialIndex >= ufov.config.trialCount) {
    finishUfovSession();
    return;
  }

  clearUfovTimers();
  ufov.trial = createUfovTrial(ufov.config);
  ufov.selectedCenter = null;
  ufov.selectedSector = null;
  ufov.acceptingAnswers = false;
  ufov.trialStartedAt = performance.now();
  elements.ufovState.textContent = "Stimulus";
  elements.ufovProgress.textContent = `${ufov.trialIndex + 1} / ${ufov.config.trialCount}`;
  elements.ufovFeedback.textContent = "Identify the center and locate the peripheral X.";
  renderUfovStimulus(ufov.trial);
  renderUfovAnswerChoices(ufov.trial);
  setUfovAnswerDisabled(true);

  scheduleUfov(() => {
    if (!ufov.running) return;
    clearUfovStimulus();
    ufov.acceptingAnswers = true;
    elements.ufovState.textContent = "Answer";
    elements.ufovFeedback.textContent = "Choose the center symbol and target direction.";
    setUfovAnswerDisabled(false);
  }, ufov.config.stimulusDurationMs);
}

function renderUfovPreview() {
  renderUfovStimulus(createUfovTrial(readUfovConfig(), () => 0.33));
  elements.ufovState.textContent = "Ready";
  elements.ufovProgress.textContent = "0 / 0";
  elements.ufovFeedback.textContent = "Press Start Session.";
  renderUfovAnswerChoices({ centerChoices: UFOV_CENTER_SYMBOLS, targetSector: "N" });
  setUfovAnswerDisabled(true);
  updateUfovStats();
}

function renderUfovStimulus(trial) {
  elements.ufovStage.querySelectorAll(".ufov-target, .ufov-distractor").forEach((item) => item.remove());
  elements.ufovCenter.textContent = trial.centerSymbol;
  trial.distractors.forEach((distractor) => {
    const marker = document.createElement("div");
    marker.className = "ufov-distractor";
    marker.textContent = distractor.symbol;
    marker.style.left = `${distractor.x}%`;
    marker.style.top = `${distractor.y}%`;
    elements.ufovStage.append(marker);
  });
  const target = document.createElement("div");
  target.className = "ufov-target";
  target.textContent = "X";
  const position = ufovSectorPosition(trial.targetSector);
  target.style.left = `${position.x}%`;
  target.style.top = `${position.y}%`;
  elements.ufovStage.append(target);
}

function clearUfovStimulus() {
  elements.ufovStage.querySelectorAll(".ufov-target, .ufov-distractor").forEach((item) => item.remove());
  elements.ufovCenter.textContent = "?";
}

function renderUfovAnswerChoices(trial) {
  elements.ufovCenterChoices.innerHTML = trial.centerChoices.map((choice) => (
    `<button type="button" data-ufov-center="${choice}">${choice}</button>`
  )).join("");
  elements.ufovSectorGrid.innerHTML = UFOV_SECTORS.map((sector) => (
    `<button type="button" data-ufov-sector="${sector}">${sector}</button>`
  )).join("");
  elements.ufovCenterChoices.querySelectorAll("[data-ufov-center]").forEach((button) => {
    button.addEventListener("click", () => selectUfovCenter(button.dataset.ufovCenter));
  });
  elements.ufovSectorGrid.querySelectorAll("[data-ufov-sector]").forEach((button) => {
    button.addEventListener("click", () => selectUfovSector(button.dataset.ufovSector));
  });
}

function selectUfovCenter(centerSymbol) {
  if (!ufov.acceptingAnswers) return;
  ufov.selectedCenter = centerSymbol;
  elements.ufovCenterChoices.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.ufovCenter === centerSymbol);
  });
  maybeSubmitUfovAnswer();
}

function selectUfovSector(targetSector) {
  if (!ufov.acceptingAnswers) return;
  ufov.selectedSector = targetSector;
  elements.ufovSectorGrid.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.ufovSector === targetSector);
  });
  maybeSubmitUfovAnswer();
}

function maybeSubmitUfovAnswer() {
  if (!ufov.selectedCenter || !ufov.selectedSector) return;
  const result = scoreUfovTrial(
    ufov.trial,
    { centerSymbol: ufov.selectedCenter, targetSector: ufov.selectedSector },
    Math.round(performance.now() - ufov.trialStartedAt)
  );
  ufov.results.push(result);
  ufov.trialIndex += 1;
  ufov.config = nextUfovConfig(ufov.config, ufov.results);
  elements.ufovDuration.value = ufov.config.stimulusDurationMs;
  syncUfovSettingLabels();
  ufov.acceptingAnswers = false;
  setUfovAnswerDisabled(true);
  updateUfovStats();
  elements.ufovFeedback.textContent = result.correct
    ? "Correct."
    : `Wrong. Center ${result.expectedCenter}, target ${result.expectedSector}.`;
  scheduleUfov(showUfovTrial, 650);
}

function finishUfovSession() {
  clearUfovTimers();
  clearExerciseCountdown(elements.ufovStageCard);
  ufov.running = false;
  ufov.acceptingAnswers = false;
  elements.startUfov.disabled = false;
  elements.quitUfov.disabled = true;
  elements.appShell.classList.remove("game-active", "ufov-game-active");
  elements.ufovState.textContent = "Complete";
  elements.ufovFeedback.textContent = "Session complete.";
  const savedProgress = saveUfovProgress("complete");
  elements.ufovOutput.textContent = JSON.stringify({
    completedTrials: ufov.results.length,
    correct: ufov.results.filter((result) => result.correct).length,
    meanReactionTimeMs: mean(ufov.results.map((result) => result.reactionTimeMs)),
    finalDurationMs: ufov.config.stimulusDurationMs,
    settings: ufovSettingsSummary(),
    today: savedProgress.today
  }, null, 2);
  updateUfovStats();
}

function updateUfovStats() {
  const correct = ufov.results.filter((result) => result.correct).length;
  elements.ufovCorrect.textContent = correct;
  elements.ufovWrong.textContent = ufov.results.length - correct;
  elements.ufovDurationStat.textContent = Math.round(Number(elements.ufovDuration.value));
  elements.ufovAccuracy.textContent = `${Math.round((ufov.results.length ? correct / ufov.results.length : 0) * 100)}%`;
}

function setUfovAnswerDisabled(disabled) {
  elements.ufovCenterChoices.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
  elements.ufovSectorGrid.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
}

function readUfovConfig() {
  return createUfovConfig({
    trialCount: clampNumber(elements.ufovTrialCount.value, 4, 80),
    stimulusDurationMs: clampNumber(elements.ufovDuration.value, 120, 1600),
    minStimulusDurationMs: clampNumber(elements.ufovMinDuration.value, 80, 1000),
    distractorCount: clampNumber(elements.ufovDistractors.value, 0, 80),
    autoProgression: elements.ufovAutoProgression.checked,
    advanceStreak: clampNumber(elements.ufovAdvanceStreak.value, 1, 12),
    regressStreak: clampNumber(elements.ufovRegressStreak.value, 1, 12)
  });
}

function ufovSettingsSummary() {
  return {
    trialCount: Number(elements.ufovTrialCount.value),
    stimulusDurationMs: Number(elements.ufovDuration.value),
    minStimulusDurationMs: Number(elements.ufovMinDuration.value),
    distractorCount: Number(elements.ufovDistractors.value),
    autoProgression: elements.ufovAutoProgression.checked,
    advanceStreak: Number(elements.ufovAdvanceStreak.value),
    regressStreak: Number(elements.ufovRegressStreak.value)
  };
}

function scheduleUfov(callback, delayMs) {
  const timer = setTimeout(() => {
    ufov.timers = ufov.timers.filter((item) => item !== timer);
    callback();
  }, delayMs);
  ufov.timers.push(timer);
}

function clearUfovTimers() {
  ufov.timers.forEach((timer) => clearTimeout(timer));
  ufov.timers = [];
}

function startIctSession() {
  clearIctTimers();
  clearExerciseCountdown(elements.ictStageCard);
  ict.config = readIctConfig();
  ict.trials = createIctTrials(ict.config);
  ict.results = [];
  ict.trialIndex = 0;
  ict.currentSsdMs = ict.config.stopSignalDelayMs;
  ict.running = true;
  ict.acceptingResponse = false;
  ict.stopSignalShown = false;
  ict.startedAt = Date.now();
  elements.appShell.classList.add("ict-open", "game-active", "ict-game-active");
  elements.startIct.disabled = true;
  elements.quitIct.disabled = false;
  elements.ictOutput.textContent = "";
  elements.ictState.textContent = "Get ready";
  elements.ictProgress.textContent = `0 / ${ict.trials.length}`;
  elements.ictFeedback.textContent = "First trial starts after the countdown.";
  updateIctStats();
  setIctResponseDisabled(true);
  startExerciseCountdown(elements.ictStageCard, scheduleIct, () => ict.running, showIctTrial);
}

function requestQuitIctSession() {
  if (!ict.running) return;
  if (typeof elements.quitDialog.showModal === "function") {
    elements.quitDialog.showModal();
    return;
  }
  quitIctSession();
}

function quitIctSession() {
  clearIctTimers();
  clearExerciseCountdown(elements.ictStageCard);
  const savedProgress = saveIctProgress("quit");
  ict.running = false;
  ict.acceptingResponse = false;
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "ict-game-active");
  elements.startIct.disabled = false;
  elements.quitIct.disabled = true;
  elements.ictState.textContent = "Ready";
  elements.ictProgress.textContent = "0 / 0";
  elements.ictFeedback.textContent = "Session saved.";
  setIctResponseDisabled(true);
  renderIctPreview();
  elements.ictOutput.textContent = JSON.stringify(savedProgress, null, 2);
}

function showIctTrial() {
  if (!ict.running) return;
  if (ict.trialIndex >= ict.trials.length) {
    finishIctSession();
    return;
  }

  clearIctTimers();
  ict.currentTrial = ict.trials[ict.trialIndex];
  ict.acceptingResponse = false;
  ict.stopSignalShown = false;
  elements.ictState.textContent = ict.currentTrial.calibration ? "Calibration" : ict.currentTrial.stopTrial ? "Stop possible" : "Go";
  elements.ictProgress.textContent = `${ict.trialIndex + 1} / ${ict.trials.length}`;
  elements.ictFeedback.textContent = ict.currentTrial.calibration ? "Calibration trial. Respond quickly." : "Respond quickly, but stop if signaled.";
  elements.ictFixation.hidden = false;
  elements.ictCue.hidden = true;
  elements.ictStopSignal.hidden = true;
  setIctResponseDisabled(true);

  scheduleIct(() => {
    if (!ict.running) return;
    ict.trialStartedAt = performance.now();
    ict.acceptingResponse = true;
    elements.ictFixation.hidden = true;
    elements.ictCue.hidden = false;
    renderIctCue(ict.currentTrial);
    setIctResponseDisabled(false);

    if (ict.currentTrial.stopTrial) {
      scheduleIct(showIctStopSignal, ict.currentSsdMs);
    }

    const responseWindow = Math.max(
      ict.config.softDeadlineEnabled ? ict.config.softDeadlineMs : 1600,
      ict.currentTrial.stopTrial ? ict.currentSsdMs + 850 : 600
    );
    scheduleIct(() => finishIctTrial(null), responseWindow);
  }, ict.config.fixationMs);
}

function showIctStopSignal() {
  if (!ict.running || !ict.acceptingResponse || !ict.currentTrial?.stopTrial) return;
  ict.stopSignalShown = true;
  elements.ictStopSignal.hidden = false;
  elements.ictStopSignal.className = `ict-stop-signal ${ict.config.stopSignalMode === "triangle" ? "triangle-signal" : ""}`;
  elements.ictStopSignal.textContent = ict.config.stopSignalMode === "text" ? "STOP" : "";
  if (ict.config.stopSignalMode === "sound") speakCueWithBrowserVoice("stop");
}

function answerIct(response) {
  if (!ict.running || !ict.acceptingResponse) return;
  finishIctTrial(response);
}

function finishIctTrial(response) {
  if (!ict.running || !ict.acceptingResponse) return;
  clearIctTimers();
  ict.acceptingResponse = false;
  setIctResponseDisabled(true);
  const reactionTimeMs = response ? Math.round(performance.now() - ict.trialStartedAt) : null;
  const result = scoreIctTrial(ict.currentTrial, response, reactionTimeMs, {
    ...ict.config,
    stopSignalDelayMs: ict.currentSsdMs
  });
  result.stopSignalDelayMs = ict.currentTrial.stopTrial ? ict.currentSsdMs : null;
  result.calibration = ict.currentTrial.calibration;
  result.direction = ict.currentTrial.direction;
  ict.results.push(result);
  if (ict.currentTrial.stopTrial) {
    ict.currentSsdMs = nextIctStopSignalDelay(ict.config, ict.currentSsdMs, result);
    elements.ictSsd.value = ict.currentSsdMs;
    syncIctSettingLabels();
  }
  ict.trialIndex += 1;
  elements.ictStopSignal.hidden = true;
  elements.ictCue.hidden = false;
  elements.ictFeedback.textContent = ictFeedbackText(result);
  updateIctStats();
  scheduleIct(showIctTrial, result.correct ? 520 : 820);
}

function finishIctSession() {
  clearIctTimers();
  clearExerciseCountdown(elements.ictStageCard);
  ict.running = false;
  ict.acceptingResponse = false;
  elements.startIct.disabled = false;
  elements.quitIct.disabled = true;
  elements.appShell.classList.remove("game-active", "ict-game-active");
  elements.ictState.textContent = "Complete";
  elements.ictFeedback.textContent = "Session complete.";
  setIctResponseDisabled(true);
  const savedProgress = saveIctProgress("complete");
  elements.ictOutput.textContent = JSON.stringify({
    completedTrials: ict.results.length,
    correct: ict.results.filter((result) => result.correct).length,
    stopSuccessRate: ictStopSuccessRate(),
    meanGoReactionTimeMs: mean(ict.results.filter((result) => !result.stopTrial).map((result) => result.reactionTimeMs)),
    finalStopSignalDelayMs: ict.currentSsdMs,
    settings: ictSettingsSummary(),
    today: savedProgress.today
  }, null, 2);
  updateIctStats();
}

function renderIctPreview() {
  elements.ictState.textContent = "Ready";
  elements.ictProgress.textContent = "0 / 0";
  elements.ictFixation.hidden = true;
  elements.ictCue.hidden = false;
  elements.ictCue.textContent = elements.ictCueType.value === "food" ? "Junk food" : "←";
  elements.ictCue.classList.toggle("food-cue", elements.ictCueType.value === "food");
  elements.ictStopSignal.hidden = true;
  elements.ictFeedback.textContent = "Press Start Session.";
  setIctResponseDisabled(true);
  updateIctStats();
}

function renderIctCue(trial) {
  elements.ictCue.textContent = trial.cue;
  elements.ictCue.classList.toggle("food-cue", ict.config.cueType === "food");
}

function setIctResponseDisabled(disabled) {
  elements.ictResponseButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function updateIctStats() {
  const goCorrect = ict.results.filter((result) => !result.stopTrial && result.correct).length;
  const stopCorrect = ict.results.filter((result) => result.stopTrial && result.correct).length;
  const stopFail = ict.results.filter((result) => result.stopTrial && !result.correct).length;
  elements.ictGoCorrect.textContent = goCorrect;
  elements.ictStopCorrect.textContent = stopCorrect;
  elements.ictStopFail.textContent = stopFail;
  elements.ictSsdStat.textContent = Math.round(ict.currentSsdMs || Number(elements.ictSsd.value));
}

function readIctConfig() {
  const ssd = clampNumber(elements.ictSsd.value, 80, 900);
  return createIctConfig({
    blocks: clampNumber(elements.ictBlocks.value, 1, 8),
    trialsPerBlock: clampNumber(elements.ictTrialsPerBlock.value, 8, 80),
    calibrationTrials: clampNumber(elements.ictCalibrationTrials.value, 0, 40),
    cueType: elements.ictCueType.value,
    fixationMs: clampNumber(elements.ictFixationMs.value, 100, 2000),
    stopProbability: clampNumber(elements.ictStopProbability.value, 5, 50) / 100,
    stopSignalDelayMs: ssd,
    minStopSignalDelayMs: 80,
    maxStopSignalDelayMs: 900,
    stopSignalStepMs: clampNumber(elements.ictSsdStep.value, 10, 150),
    stopSignalMode: elements.ictStopSignalMode.value,
    softDeadlineEnabled: elements.ictSoftDeadlineEnabled.checked,
    softDeadlineMs: clampNumber(elements.ictSoftDeadline.value, 350, 3000)
  });
}

function ictSettingsSummary() {
  return {
    blocks: Number(elements.ictBlocks.value),
    trialsPerBlock: Number(elements.ictTrialsPerBlock.value),
    calibrationTrials: Number(elements.ictCalibrationTrials.value),
    cueType: elements.ictCueType.value,
    fixationMs: Number(elements.ictFixationMs.value),
    stopProbability: Number(elements.ictStopProbability.value) / 100,
    stopSignalDelayMs: Number(elements.ictSsd.value),
    stopSignalStepMs: Number(elements.ictSsdStep.value),
    stopSignalMode: elements.ictStopSignalMode.value,
    softDeadlineEnabled: elements.ictSoftDeadlineEnabled.checked,
    softDeadlineMs: Number(elements.ictSoftDeadline.value)
  };
}

function ictFeedbackText(result) {
  if (result.stopTrial) return result.correct ? "Stopped successfully." : "Failed stop. Try to withhold when signaled.";
  if (!result.response) return "Too slow. Respond on go trials.";
  if (result.deadlineMiss) return "Correct key, but too slow.";
  return result.correct ? "Correct go response." : `Wrong key. Expected ${result.expected}.`;
}

function ictStopSuccessRate() {
  const stopTrials = ict.results.filter((result) => result.stopTrial);
  if (!stopTrials.length) return 0;
  return roundMetric(stopTrials.filter((result) => result.correct).length / stopTrials.length);
}

function scheduleIct(callback, delayMs) {
  const timer = setTimeout(() => {
    ict.timers = ict.timers.filter((item) => item !== timer);
    callback();
  }, delayMs);
  ict.timers.push(timer);
}

function clearIctTimers() {
  ict.timers.forEach((timer) => clearTimeout(timer));
  ict.timers = [];
}

function resetIctOutput() {
  elements.ictOutput.textContent = JSON.stringify({
    input: "Press F/Left for left cues and J/Right for right cues. Withhold response when the stop signal appears.",
    settings: ictSettingsSummary(),
    score: { goCorrect: 0, stopCorrect: 0, failedStops: 0 }
  }, null, 2);
}

function resetUfovOutput() {
  elements.ufovOutput.textContent = JSON.stringify({
    input: "Press Start Session. Identify the center symbol, then choose the peripheral target direction.",
    settings: ufovSettingsSummary(),
    score: { correct: 0, wrong: 0 }
  }, null, 2);
}

function ufovSectorPosition(sector) {
  const positions = {
    N: { x: 50, y: 16 },
    NE: { x: 76, y: 24 },
    E: { x: 84, y: 50 },
    SE: { x: 76, y: 76 },
    S: { x: 50, y: 84 },
    SW: { x: 24, y: 76 },
    W: { x: 16, y: 50 },
    NW: { x: 24, y: 24 }
  };
  return positions[sector] ?? positions.N;
}

function recordExerciseProgress(exerciseId, sessionData) {
  selectedStatsExercise = exerciseId;
  const progress = loadExerciseProgress();
  const dateKey = localDateKey();
  progress.days ??= {};
  progress.days[dateKey] ??= {};
  progress.days[dateKey][exerciseId] ??= emptyExerciseProgress();

  const exercise = progress.days[dateKey][exerciseId];
  const durationMs = Math.max(0, Math.round(sessionData.durationMs ?? 0));
  const completedTrials = Math.max(0, Math.round(sessionData.completedTrials ?? 0));
  const correct = Math.max(0, Math.round(sessionData.correct ?? 0));
  const incorrect = Math.max(0, Math.round(sessionData.incorrect ?? 0));
  const avgAnswerSpeedMs = roundMetric(sessionData.avgAnswerSpeedMs);
  const difficultyScore = roundMetric(sessionData.difficultyScore ?? 1);
  const weightedScore = roundMetric(sessionData.weightedScore ?? calculateWeightedScore(sessionData.accuracy, difficultyScore));
  const microMetrics = deriveMicroMetrics(exerciseId, sessionData);
  const sessionRecord = {
    id: `${exerciseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    exerciseId,
    status: sessionData.status,
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs,
    completedTrials,
    correct,
    incorrect,
    rawAccuracy: roundMetric(sessionData.accuracy),
    avgAnswerSpeedMs,
    difficultyScore,
    weightedScore,
    microMetrics,
    settingsSnapshot: sessionData.settings,
    trialData: sessionData.trialData ?? []
  };

  exercise.sessions += 1;
  exercise.durationMs += durationMs;
  exercise.completedTrials += completedTrials;
  exercise.correct += correct;
  exercise.incorrect += incorrect;
  exercise.weightedScoreTotal = (exercise.weightedScoreTotal ?? 0) + (weightedScore ?? 0);
  exercise.difficultyScoreTotal = (exercise.difficultyScoreTotal ?? 0) + (difficultyScore ?? 0);
  exercise.answerSpeedTotalMs = (exercise.answerSpeedTotalMs ?? 0) + (avgAnswerSpeedMs ?? 0);
  exercise.answerSpeedSessions = (exercise.answerSpeedSessions ?? 0) + (avgAnswerSpeedMs == null ? 0 : 1);
  exercise.lastStatus = sessionData.status;
  exercise.lastUpdatedAt = sessionRecord.endedAt;

  progress.sessions ??= [];
  progress.sessions.push(sessionRecord);
  progress.sessions = progress.sessions.slice(-1000);

  exercise.history.push(sessionRecord);
  exercise.history = exercise.history.slice(-30);

  saveExerciseProgress(progress);
  renderStatistics();
  return {
    session: {
      status: sessionData.status,
      durationMinutes: roundMetric(durationMs / 60000),
      completedTrials,
      correct,
      incorrect,
      accuracy: roundMetric(sessionData.accuracy),
      avgAnswerSpeedMs,
      difficultyScore,
      weightedScore
    },
    today: formatExerciseProgress(exercise)
  };
}

function deriveMicroMetrics(exerciseId, sessionData) {
  const trialData = sessionData.trialData ?? [];
  const settings = sessionData.settings ?? {};
  const reactionTimes = extractReactionTimes(trialData);
  const base = {
    rtMedianMs: medianMetric(reactionTimes),
    rtSdMs: standardDeviationMetric(reactionTimes),
    breakdownTrial: detectBreakdownTrial(trialData),
    confidence95: confidenceInterval95(sessionData.accuracy, sessionData.completedTrials)
  };

  if (exerciseId === "nback") {
    const score = scoreQuadNBackSession(trialData, settings.activeModalities ?? ["position"]);
    return {
      ...base,
      hits: score.hits,
      misses: score.misses,
      falseAlarms: score.falseAlarms,
      correctRejections: score.correctRejections,
      dPrime: score.dPrime,
      fidelity: score.dPrime,
      cognitiveLoad: (settings.n ?? 1) * (settings.activeModalities?.length ?? 1)
    };
  }

  if (exerciseId === "ict") {
    const goTrials = trialData.filter((trial) => !trial.stopTrial);
    const stopTrials = trialData.filter((trial) => trial.stopTrial);
    const meanGoRt = mean(goTrials.map((trial) => trial.reactionTimeMs));
    const meanSsd = mean(stopTrials.map((trial) => trial.stopSignalDelayMs)) ?? settings.stopSignalDelayMs;
    const stopSuccess = stopTrials.length ? stopTrials.filter((trial) => trial.correct).length / stopTrials.length : 0;
    return {
      ...base,
      ssrtMs: Number.isFinite(meanGoRt) && Number.isFinite(meanSsd) ? Math.max(0, Math.round(meanGoRt - meanSsd)) : null,
      noGoAccuracy: roundMetric(stopSuccess),
      postErrorRecoveryTrials: postErrorRecoveryTrials(trialData),
      failedStops: stopTrials.filter((trial) => !trial.correct).length
    };
  }

  if (exerciseId === "cct") {
    return {
      ...base,
      neuralStabilityRtSdMs: standardDeviationMetric(reactionTimes),
      postErrorRecoveryTrials: postErrorRecoveryTrials(trialData),
      minIntervalMs: Math.min(...trialData.map((trial) => trial.intervalMs).filter(Number.isFinite), settings.minimumIntervalMs ?? Infinity)
    };
  }

  if (exerciseId === "rrt") {
    const neighborSlips = trialData.filter((trial) => !trial.correct && ["space2d", "space3d", "linear"].includes(trial.mode)).length;
    return {
      ...base,
      inferenceLatencyMs: medianMetric(reactionTimes),
      neighborSlips,
      relationalPremiseLoad: mean(trialData.map((trial) => trial.premiseCount).filter(Number.isFinite)) ?? settings.premiseCount
    };
  }

  if (exerciseId === "mot") {
    return {
      ...base,
      speedThreshold: sessionData.accuracy >= 0.5 ? settings.ballSpeed : roundMetric((settings.ballSpeed ?? 0) * Math.max(0.25, sessionData.accuracy ?? 0)),
      occlusionRecovery: roundMetric(sessionData.accuracy),
      targetLoad: settings.targetCount
    };
  }

  if (exerciseId === "ufov") {
    return {
      ...base,
      msThreshold: sessionData.accuracy >= 0.5 ? settings.stimulusDurationMs : null,
      peripheralDepth: estimatePeripheralDepth(trialData),
      distractorLoad: settings.distractorCount
    };
  }

  return base;
}

function renderStatistics() {
  if (!elements.statsGrid) return;
  const storedProgress = loadExerciseProgress();
  const exerciseIds = ["nback", "rrt", "cct", "ict", "mot", "ufov"];
  const labels = {
    nback: "N-Back",
    rrt: "Relational Reasoning",
    cct: "Cognitive Control Training",
    ict: "Inhibitory Control Training",
    mot: "3D MOT",
    ufov: "UFOV"
  };

  if (!exerciseIds.includes(selectedStatsExercise)) selectedStatsExercise = "nback";
  if (!["daily", "weekly", "monthly", "all"].includes(selectedStatsTimeframe)) selectedStatsTimeframe = "daily";
  const allExercises = formatExerciseProgress(aggregateAllExerciseProgress(storedProgress, exerciseIds, selectedStatsTimeframe));
  const rawSelectedSessions = filteredProgressSessions(storedProgress, selectedStatsExercise, selectedStatsTimeframe);
  const nbackLevelOptions = selectedStatsExercise === "nback" ? nBackLevelOptions(rawSelectedSessions) : [];
  const nbackModeOptions = selectedStatsExercise === "nback" ? nBackModeOptions(rawSelectedSessions) : [];
  if (selectedStatsExercise !== "nback") {
    selectedNBackStatsLevel = "all";
    selectedNBackStatsMode = "all";
  }
  if (selectedStatsExercise === "nback" && !nbackLevelOptions.some((option) => option.key === selectedNBackStatsLevel)) {
    selectedNBackStatsLevel = "all";
  }
  if (selectedStatsExercise === "nback" && !nbackModeOptions.some((option) => option.key === selectedNBackStatsMode)) {
    selectedNBackStatsMode = "all";
  }
  const selectedSessions = selectedStatsExercise === "nback"
    ? filterNBackSessions(rawSelectedSessions, selectedNBackStatsLevel, selectedNBackStatsMode)
    : rawSelectedSessions;
  const item = selectedStatsExercise === "nback"
    ? formatExerciseProgress(progressFromSessions(selectedSessions))
    : formatExerciseProgress(aggregateExerciseProgress(storedProgress, selectedStatsExercise, selectedStatsTimeframe));
  const allSessions = filteredProgressSessions(storedProgress, null, selectedStatsTimeframe);
  const labSummary = summarizeLabSessions(selectedSessions, selectedStatsExercise);
  const cognitiveMap = summarizeCognitiveMap(allSessions);
  elements.statsExerciseTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.statsExercise === selectedStatsExercise);
  });
  elements.statsExercisePickerLabel.textContent = labels[selectedStatsExercise];
  elements.statsTimeframeTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.statsTimeframe === selectedStatsTimeframe);
  });

  elements.statsTimeframeLabel.textContent = formatTimeframeLabel(selectedStatsTimeframe);
  elements.statsTotalMinutes.textContent = `${allExercises.durationMinutes ?? 0} min`;
  elements.statsTotalSessions.textContent = allExercises.sessions;
  elements.statsTotalTrials.textContent = allExercises.completedTrials;
  elements.statsTotalAccuracy.textContent = `${Math.round(allExercises.accuracy * 100)}%`;

  elements.statsGrid.innerHTML = `
    ${selectedStatsExercise === "nback" ? renderNBackSettingsFilter(nbackLevelOptions, nbackModeOptions) : ""}
    <article class="stat-card selected-stat-card">
      <div>
        <span>Selected Exercise</span>
        <h2>${labels[selectedStatsExercise]}${selectedStatsExercise === "nback" ? ` · ${escapeHtml(nBackFilterLabel(selectedNBackStatsLevel, selectedNBackStatsMode))}` : ""}</h2>
        <p>${item.sessions ? `Last saved ${formatStatTime(item.lastUpdatedAt)}.` : `No sessions recorded for ${formatTimeframeLabel(selectedStatsTimeframe).toLowerCase()}.`}</p>
      </div>
      <dl class="stat-metrics">
        <div><dt>Time</dt><dd>${item.durationMinutes} min</dd></div>
        <div><dt>Sessions</dt><dd>${item.sessions}</dd></div>
        <div><dt>Trials</dt><dd>${item.completedTrials}</dd></div>
        <div><dt>Accuracy</dt><dd>${Math.round(item.accuracy * 100)}%</dd></div>
        <div><dt>Speed</dt><dd>${formatSpeed(item.avgAnswerSpeedMs)}</dd></div>
        <div><dt>Difficulty</dt><dd>${item.avgDifficultyScore}</dd></div>
        ${selectedStatsExercise === "nback" ? "" : `<div><dt>Weighted</dt><dd>${item.avgWeightedScore}</dd></div>`}
      </dl>
    </article>
    <article class="stat-card level-progress-card">
      <div>
        <span>Level Progress</span>
        <h2>${formatLevelProgressLabel(selectedStatsExercise, item.avgDifficultyScore)}</h2>
        <p>Simple progress view based on recent accuracy and task difficulty.</p>
      </div>
      <div class="level-progress-track"><span style="width: ${Math.round(clamp01(item.accuracy) * 100)}%"></span></div>
    </article>
  `;
  updateSegmentedControls();
  window.requestAnimationFrame(updateSegmentedControls);
  animateStatisticsRefresh();
}

function closeStatsExercisePicker() {
  if (!elements.statsExercisePicker || !elements.statsExercisePickerButton) return;
  elements.statsExercisePicker.classList.remove("open");
  elements.statsExercisePickerButton.setAttribute("aria-expanded", "false");
}

function updateSegmentedControls() {
  document.querySelectorAll(".segmented-control").forEach((control) => {
    const active = control.querySelector("button.active");
    if (!active) {
      control.style.setProperty("--active-opacity", "0");
      return;
    }
    control.style.setProperty("--active-left", `${active.offsetLeft}px`);
    control.style.setProperty("--active-width", `${active.offsetWidth}px`);
    control.style.setProperty("--active-opacity", "1");
  });
}

function animateStatisticsRefresh() {
  [document.querySelector(".stats-summary"), elements.statsGrid].forEach((node) => {
    if (!node) return;
    node.classList.remove("stats-refreshing");
    void node.offsetWidth;
    node.classList.add("stats-refreshing");
    window.setTimeout(() => node.classList.remove("stats-refreshing"), 170);
  });
}

function aggregateExerciseProgress(progress, exerciseId, timeframe) {
  const days = progress.days ?? {};
  return Object.entries(days).reduce((summary, [dateKey, day]) => {
    if (!isDateInStatsTimeframe(dateKey, timeframe)) return summary;
    return mergeExerciseProgress(summary, day[exerciseId] ?? emptyExerciseProgress());
  }, emptyExerciseProgress());
}

function aggregateAllExerciseProgress(progress, exerciseIds, timeframe) {
  return exerciseIds.reduce((summary, exerciseId) => {
    return mergeExerciseProgress(summary, aggregateExerciseProgress(progress, exerciseId, timeframe));
  }, emptyExerciseProgress());
}

function mergeExerciseProgress(summary, item) {
  summary.sessions += item.sessions ?? 0;
  summary.durationMs += item.durationMs ?? 0;
  summary.completedTrials += item.completedTrials ?? 0;
  summary.correct += item.correct ?? 0;
  summary.incorrect += item.incorrect ?? 0;
  summary.weightedScoreTotal += item.weightedScoreTotal ?? 0;
  summary.difficultyScoreTotal += item.difficultyScoreTotal ?? 0;
  summary.answerSpeedTotalMs += item.answerSpeedTotalMs ?? 0;
  summary.answerSpeedSessions += item.answerSpeedSessions ?? 0;
  summary.history.push(...(item.history ?? []));
  if (item.lastUpdatedAt && (!summary.lastUpdatedAt || new Date(item.lastUpdatedAt) > new Date(summary.lastUpdatedAt))) {
    summary.lastUpdatedAt = item.lastUpdatedAt;
    summary.lastStatus = item.lastStatus;
  }
  return summary;
}

function isDateInStatsTimeframe(dateKey, timeframe) {
  if (timeframe === "all") return true;
  const today = new Date(localDateKey());
  const date = new Date(dateKey);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = Math.floor((today - date) / 86400000);
  if (timeframe === "daily") return diffDays === 0;
  if (timeframe === "weekly") return diffDays >= 0 && diffDays < 7;
  if (timeframe === "monthly") return diffDays >= 0 && diffDays < 30;
  return false;
}

function formatTimeframeLabel(timeframe) {
  const labels = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    all: "All time"
  };
  return labels[timeframe] ?? "Daily";
}

function formatSpeed(value) {
  return value == null ? "--" : `${Math.round(value)} ms`;
}

function formatStatTime(value) {
  if (!value) return "never";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function emptyExerciseProgress() {
  return {
    sessions: 0,
    durationMs: 0,
    completedTrials: 0,
    correct: 0,
    incorrect: 0,
    weightedScoreTotal: 0,
    difficultyScoreTotal: 0,
    answerSpeedTotalMs: 0,
    answerSpeedSessions: 0,
    lastStatus: null,
    lastUpdatedAt: null,
    history: []
  };
}

function formatExerciseProgress(progress) {
  const attempts = progress.correct + progress.incorrect;
  return {
    sessions: progress.sessions,
    durationMinutes: roundMetric(progress.durationMs / 60000),
    completedTrials: progress.completedTrials,
    correct: progress.correct,
    incorrect: progress.incorrect,
    accuracy: attempts ? roundMetric(progress.correct / attempts) : 0,
    avgAnswerSpeedMs: progress.answerSpeedSessions ? Math.round(progress.answerSpeedTotalMs / progress.answerSpeedSessions) : null,
    avgDifficultyScore: progress.sessions ? roundMetric((progress.difficultyScoreTotal ?? 0) / progress.sessions) : 0,
    avgWeightedScore: progress.sessions ? roundMetric((progress.weightedScoreTotal ?? 0) / progress.sessions) : 0,
    lastStatus: progress.lastStatus,
    lastUpdatedAt: progress.lastUpdatedAt
  };
}

function progressFromSessions(sessions) {
  return sessions.reduce((summary, sessionRecord) => {
    const completedTrials = Math.max(0, Number(sessionRecord.completedTrials) || 0);
    const accuracy = clamp01(Number(sessionRecord.rawAccuracy) || 0);
    const correct = Math.round(completedTrials * accuracy);
    summary.sessions += 1;
    summary.durationMs += Math.max(0, Number(sessionRecord.durationMs) || 0);
    summary.completedTrials += completedTrials;
    summary.correct += correct;
    summary.incorrect += Math.max(0, completedTrials - correct);
    summary.weightedScoreTotal += Number(sessionRecord.weightedScore) || 0;
    summary.difficultyScoreTotal += Number(sessionRecord.difficultyScore) || 0;
    if (Number.isFinite(sessionRecord.avgAnswerSpeedMs)) {
      summary.answerSpeedTotalMs += Number(sessionRecord.avgAnswerSpeedMs);
      summary.answerSpeedSessions += 1;
    }
    summary.history.push(sessionRecord);
    if (sessionRecord.endedAt && (!summary.lastUpdatedAt || new Date(sessionRecord.endedAt) > new Date(summary.lastUpdatedAt))) {
      summary.lastUpdatedAt = sessionRecord.endedAt;
      summary.lastStatus = sessionRecord.status;
    }
    return summary;
  }, emptyExerciseProgress());
}

function nBackLevelOptions(sessions) {
  const options = new Map([
    ["all", { key: "all", label: "All levels", sessions: sessions.length }],
    ["1", { key: "1", label: "1-back", sessions: 0 }],
    ["2", { key: "2", label: "2-back", sessions: 0 }],
    ["3", { key: "3", label: "3-back", sessions: 0 }],
    ["4", { key: "4", label: "4-back", sessions: 0 }]
  ]);
  sessions.forEach((sessionRecord) => {
    const key = nBackLevelKey(sessionRecord);
    const current = options.get(key) ?? { key, label: nBackLevelLabel(key), sessions: 0 };
    current.sessions += 1;
    options.set(key, current);
  });
  return [...options.values()];
}

function nBackModeOptions(sessions) {
  const options = new Map([
    ["all", { key: "all", label: "All modes", sessions: sessions.length }],
    ["1", { key: "1", label: "Single", sessions: 0 }],
    ["2", { key: "2", label: "Dual", sessions: 0 }],
    ["3", { key: "3", label: "Triple", sessions: 0 }],
    ["4", { key: "4", label: "Quad", sessions: 0 }]
  ]);
  sessions.forEach((sessionRecord) => {
    const key = nBackModeKey(sessionRecord);
    const current = options.get(key) ?? { key, label: nBackModeLabel(key), sessions: 0 };
    current.sessions += 1;
    options.set(key, current);
  });
  return [...options.values()];
}

function filterNBackSessions(sessions, levelKey, modeKey) {
  return sessions.filter((sessionRecord) => {
    const levelMatch = levelKey === "all" || nBackLevelKey(sessionRecord) === levelKey;
    const modeMatch = modeKey === "all" || nBackModeKey(sessionRecord) === modeKey;
    return levelMatch && modeMatch;
  });
}

function nBackLevelKey(sessionRecord) {
  const n = Math.round(Number(sessionRecord.settingsSnapshot?.n ?? 0));
  return n > 0 ? String(n) : "unknown";
}

function nBackLevelLabel(levelKey) {
  if (levelKey === "all") return "All levels";
  if (levelKey === "unknown") return "Unknown";
  return `${levelKey}-back`;
}

function nBackModeKey(sessionRecord) {
  const count = Math.max(1, Math.min(4, (sessionRecord.settingsSnapshot?.activeModalities ?? []).length || 1));
  return String(count);
}

function nBackModeLabel(modeKey) {
  const labels = {
    all: "All modes",
    "1": "Single",
    "2": "Dual",
    "3": "Triple",
    "4": "Quad"
  };
  return labels[modeKey] ?? "Custom";
}

function nBackFilterLabel(levelKey, modeKey) {
  return `${nBackLevelLabel(levelKey)} · ${nBackModeLabel(modeKey)}`;
}

function renderNBackSettingsFilter(levelOptions, modeOptions) {
  return `
    <article class="nback-mode-filter" aria-label="N-back settings dashboard selector">
      <div>
        <span>N-Back Dashboard</span>
        <strong>Specific settings</strong>
      </div>
      <div class="nback-filter-stack">
        <div class="nback-filter-row" aria-label="N-back level stats">
          ${levelOptions.map((option) => `
            <button class="${option.key === selectedNBackStatsLevel ? "active" : ""}" data-nback-stats-level="${escapeHtml(option.key)}" type="button">
              ${escapeHtml(option.label)}
              <small>${option.sessions}</small>
            </button>
          `).join("")}
        </div>
        <div class="nback-filter-row" aria-label="N-back mode stats">
          ${modeOptions.map((option) => `
            <button class="${option.key === selectedNBackStatsMode ? "active" : ""}" data-nback-stats-mode="${escapeHtml(option.key)}" type="button">
              ${escapeHtml(option.label)}
              <small>${option.sessions}</small>
            </button>
          `).join("")}
        </div>
      </div>
    </article>
  `;
}

function filteredProgressSessions(progress, exerciseId, timeframe) {
  return (progress.sessions ?? []).filter((sessionRecord) => {
    if (exerciseId && sessionRecord.exerciseId !== exerciseId) return false;
    return isDateInStatsTimeframe(localDateKey(new Date(sessionRecord.endedAt ?? sessionRecord.startedAt)), timeframe);
  });
}

function summarizeLabSessions(sessions, exerciseId) {
  const metrics = sessions.map((sessionRecord) => sessionRecord.microMetrics ?? deriveMicroMetrics(sessionRecord.exerciseId, {
    ...sessionRecord,
    accuracy: sessionRecord.rawAccuracy,
    settings: sessionRecord.settingsSnapshot,
    trialData: sessionRecord.trialData ?? []
  }));
  const rtValues = sessions.flatMap((sessionRecord) => extractReactionTimes(sessionRecord.trialData ?? []));
  const accuracySeries = sessions.map((sessionRecord, index) => ({
    index: index + 1,
    accuracy: sessionRecord.rawAccuracy ?? 0,
    difficulty: sessionRecord.difficultyScore ?? 0,
    endedAt: sessionRecord.endedAt
  }));
  return {
    exerciseId,
    sessions,
    metrics,
    rtValues,
    accuracySeries,
    rtSdMs: standardDeviationMetric(rtValues),
    rtMedianMs: medianMetric(rtValues),
    dPrime: mean(metrics.map((metric) => metric.dPrime ?? metric.fidelity).filter(Number.isFinite)),
    breakdownTrial: firstFinite(metrics.map((metric) => metric.breakdownTrial)),
    confidence95: confidenceInterval95(mean(sessions.map((sessionRecord) => sessionRecord.rawAccuracy).filter(Number.isFinite)) ?? 0, sessions.reduce((sum, sessionRecord) => sum + (sessionRecord.completedTrials ?? 0), 0)),
    primary: summarizePrimaryLabMetric(exerciseId, metrics)
  };
}

function summarizePrimaryLabMetric(exerciseId, metrics) {
  const specs = {
    nback: ["d-Prime Fidelity", "dPrime", "Signal/noise separation"],
    rrt: ["Inference Latency", "inferenceLatencyMs", "Thinking time after premises"],
    cct: ["Neural Stability", "neuralStabilityRtSdMs", "Reaction-time standard deviation"],
    ict: ["SSRT", "ssrtMs", "Mental brake speed"],
    mot: ["Speed Threshold", "speedThreshold", "Estimated 50% tracking speed"],
    ufov: ["ms Threshold", "msThreshold", "Minimum useful exposure"]
  };
  const [label, key, caption] = specs[exerciseId] ?? specs.nback;
  const value = mean(metrics.map((metric) => metric[key]).filter(Number.isFinite));
  return { label, key, caption, value: roundMetric(value) };
}

function summarizeCognitiveMap(sessions) {
  const byExercise = Object.groupBy ? Object.groupBy(sessions, (item) => item.exerciseId) : groupByExercise(sessions);
  return {
    "Fluid Reasoning": cognitiveAxisScore(byExercise.rrt ?? []),
    "Working Memory": cognitiveAxisScore(byExercise.nback ?? []),
    "Processing Speed": cognitiveAxisScore([...(byExercise.cct ?? []), ...(byExercise.ufov ?? [])]),
    "Relational Fluency": cognitiveAxisScore([...(byExercise.rrt ?? []), ...(byExercise.mot ?? [])])
  };
}

function groupByExercise(sessions) {
  return sessions.reduce((groups, sessionRecord) => {
    groups[sessionRecord.exerciseId] ??= [];
    groups[sessionRecord.exerciseId].push(sessionRecord);
    return groups;
  }, {});
}

function cognitiveAxisScore(sessions) {
  if (!sessions.length) return 0;
  const weighted = mean(sessions.map((sessionRecord) => sessionRecord.weightedScore).filter(Number.isFinite)) ?? 0;
  return Math.round(clamp01(weighted / 160) * 100);
}

function renderLabStats({ item, labSummary, cognitiveMap, exerciseLabel, exerciseId, timeframeLabel }) {
  const metric = labSummary.primary;
  const ci = labSummary.confidence95;
  return `
    <article class="stat-card selected-stat-card lab-selected-card">
      <div>
        <span>Pro Lab</span>
        <h2>${escapeHtml(exerciseLabel)}</h2>
        <p>${labSummary.sessions.length ? `${labSummary.sessions.length} lab sessions in ${timeframeLabel.toLowerCase()}.` : `No lab records yet for ${timeframeLabel.toLowerCase()}.`}</p>
      </div>
      <dl class="stat-metrics">
        <div><dt>${escapeHtml(metric.label)}</dt><dd>${formatLabMetric(metric)}</dd></div>
        <div><dt>RTSD</dt><dd>${formatSpeed(labSummary.rtSdMs)}</dd></div>
        <div><dt>RT Median</dt><dd>${formatSpeed(labSummary.rtMedianMs)}</dd></div>
        <div><dt>95% CI</dt><dd>${ci ? `${Math.round(ci.low * 100)}-${Math.round(ci.high * 100)}%` : "--"}</dd></div>
        <div><dt>Breakdown</dt><dd>${labSummary.breakdownTrial ? `Trial ${labSummary.breakdownTrial}` : "--"}</dd></div>
        ${exerciseId === "nback" ? "" : `<div><dt>Weighted</dt><dd>${item.avgWeightedScore}</dd></div>`}
      </dl>
    </article>
    <article class="stat-card lab-chart-card">
      <div>
        <span>Neural Stability Histogram</span>
        <h2>Reaction-Time Distribution</h2>
        <p>A narrower curve means responses are becoming more consistent under load.</p>
      </div>
      ${renderRtHistogram(labSummary.rtValues)}
    </article>
    <article class="stat-card lab-chart-card">
      <div>
        <span>d-Prime Fidelity</span>
        <h2>Signal vs Noise</h2>
        <p>Tracks filtering quality separately from simple accuracy.</p>
      </div>
      ${renderFidelityGraph(labSummary.accuracySeries)}
    </article>
    <article class="stat-card lab-chart-card">
      <div>
        <span>Cognitive Map</span>
        <h2>Training Profile</h2>
        <p>Radar-style profile of current cognitive bottlenecks.</p>
      </div>
      ${renderCognitiveMap(cognitiveMap)}
    </article>
    <article class="stat-card lab-chart-card">
      <div>
        <span>P-FIT Activation Proxy</span>
        <h2>Frontoparietal Load</h2>
        <p>Visual proxy based on task difficulty and progress, not a medical brain scan.</p>
      </div>
      ${renderPfitHeatmap(exerciseId, item.avgDifficultyScore, item.accuracy)}
    </article>
    <article class="stat-card lab-chart-card">
      <div>
        <span>Breakdown Point Detection</span>
        <h2>Neural Fatigue Marker</h2>
        <p>${labSummary.breakdownTrial ? `Accuracy first dropped around trial ${labSummary.breakdownTrial}.` : "No clear fatigue drop detected in the selected window."}</p>
      </div>
      ${renderBreakdownGraph(labSummary.accuracySeries, labSummary.breakdownTrial)}
    </article>
  `;
}

function renderRtHistogram(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return `<div class="lab-empty">No reaction-time samples yet.</div>`;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const bucketCount = 8;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  clean.forEach((value) => {
    const index = max === min ? 0 : Math.min(bucketCount - 1, Math.floor(((value - min) / (max - min)) * bucketCount));
    buckets[index] += 1;
  });
  const peak = Math.max(...buckets, 1);
  return `<div class="rt-histogram">${buckets.map((count, index) => `<span style="height:${Math.max(8, (count / peak) * 100)}%" title="${Math.round(min + ((max - min) * index / bucketCount))} ms"></span>`).join("")}</div>`;
}

function renderFidelityGraph(series) {
  if (!series.length) return `<div class="lab-empty">No learning curve yet.</div>`;
  return `<div class="dual-axis-graph">${series.slice(-16).map((point) => {
    const accuracyHeight = Math.max(4, clamp01(point.accuracy) * 100);
    const difficultyHeight = Math.max(4, clamp01((point.difficulty ?? 0) / 12) * 100);
    return `<span><i style="height:${accuracyHeight}%"></i><b style="height:${difficultyHeight}%"></b></span>`;
  }).join("")}</div>`;
}

function renderCognitiveMap(map) {
  return `<div class="cognitive-map">${Object.entries(map).map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <b>${value}</b>
      <i style="--axis-value:${value}%"></i>
    </div>
  `).join("")}</div>`;
}

function renderPfitHeatmap(exerciseId, difficulty, accuracy) {
  const activation = Math.round(clamp01(((difficulty ?? 0) / 10 + (accuracy ?? 0)) / 2) * 100);
  const frontal = ["nback", "cct", "ict"].includes(exerciseId) ? activation : Math.round(activation * 0.72);
  const parietal = ["nback", "rrt", "mot", "ufov"].includes(exerciseId) ? activation : Math.round(activation * 0.68);
  return `
    <div class="pfit-map" style="--frontal:${frontal}%;--parietal:${parietal}%;--frontal-alpha:${frontal / 280};--parietal-alpha:${parietal / 270};--frontal-blur:${Math.max(8, frontal * 0.18)}px;--parietal-blur:${Math.max(8, parietal * 0.18)}px">
      <span class="pfit-node frontal">dlPFC</span>
      <span class="pfit-node parietal">Precuneus</span>
      <span class="pfit-link"></span>
    </div>
  `;
}

function renderBreakdownGraph(series, breakdownTrial) {
  if (!series.length) return `<div class="lab-empty">No session curve yet.</div>`;
  return `<div class="breakdown-graph">${series.slice(-20).map((point, index) => `
    <span class="${breakdownTrial && index + 1 >= breakdownTrial ? "fatigue" : ""}" style="height:${Math.max(4, clamp01(point.accuracy) * 100)}%"></span>
  `).join("")}</div>`;
}

function formatLabMetric(metric) {
  if (metric.value == null) return "--";
  if (/ms|Latency|SSRT|Threshold|Stability/i.test(metric.label)) return `${Math.round(metric.value)} ms`;
  return String(metric.value);
}

function formatLevelProgressLabel(exerciseId, difficulty) {
  const labels = {
    nback: "Next N-back Level",
    rrt: "Next Premise Load",
    cct: "Tighter Interval",
    ict: "Faster Stop Control",
    mot: "Higher Tracking Speed",
    ufov: "Shorter Exposure"
  };
  return `${labels[exerciseId] ?? "Next Level"} · ${roundMetric(difficulty ?? 0)}`;
}

function loadExerciseProgress() {
  try {
    return JSON.parse(localStorage.getItem(exerciseProgressStorageKey)) || { days: {} };
  } catch {
    return { days: {} };
  }
}

function saveExerciseProgress(progress) {
  try {
    localStorage.setItem(exerciseProgressStorageKey, JSON.stringify(progress));
  } catch {
    // Local progress is best-effort until the backend exists.
  }
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function elapsedSessionMs(startedAt) {
  return startedAt ? Date.now() - startedAt : 0;
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function calculateWeightedScore(accuracy, difficultyScore) {
  if (!Number.isFinite(accuracy)) return 0;
  return roundMetric(accuracy * 100 * Math.max(0.25, difficultyScore || 1));
}

function averageNBackReactionTime() {
  return mean(session.results.flatMap((result) => Object.values(result.reactionTimesMs ?? {})));
}

function calculateNBackDifficulty(settings) {
  const modalities = settings.activeModalities?.length || 1;
  const speedFactor = 3000 / Math.max(500, settings.trialTimeMs || 3000);
  const interferenceFactor = 1 + Number(settings.interference ?? 0);
  const matchFactor = 1 + Math.abs(Number(settings.matchChance ?? 0.25) - 0.25);
  return roundMetric((settings.n || 1) * modalities * speedFactor * interferenceFactor * matchFactor);
}

function calculateRrtDifficulty(settings, results) {
  const modeWeights = { distinction: 1, linear: 1.15, space2d: 1.35, space3d: 1.65 };
  const avgPremises = mean(results.map((result) => result.premiseCount).filter(Number.isFinite))
    ?? settings.premiseCount
    ?? 2;
  const modes = results.map((result) => result.mode).filter(Boolean);
  const avgModeWeight = modes.length
    ? mean(modes.map((mode) => modeWeights[mode] ?? 1)) ?? 1
    : 1;
  const timerFactor = settings.timerEnabled ? 30 / Math.max(5, settings.timerSeconds || 30) : 0.85;
  const vocabFactor = settings.vocabulary === "garbage" ? 1.15 : settings.vocabulary === "emoji" ? 1.08 : 1;
  const visualFactor = 1 + (Number(settings.visualNoiseSplits ?? 0) / 100) + (Number(settings.scrambleFactor ?? 0) / 500);
  return roundMetric(avgPremises * avgModeWeight * timerFactor * vocabFactor * visualFactor);
}

function calculateMotDifficulty(settings) {
  const totalBalls = (settings.targetCount || 0) + (settings.blueDistractors || 0) + (settings.coloredDistractors || 0);
  const distractorFactor = 1 + totalBalls / 12;
  const speedFactor = Math.max(0.1, settings.ballSpeed || 0.1) * 5;
  const trackingFactor = Math.max(0.5, (settings.trackingDurationMs || 8000) / 8000);
  const targetFactor = Math.max(1, settings.targetCount || 1);
  return roundMetric(targetFactor * distractorFactor * speedFactor * trackingFactor);
}

function calculateCctDifficulty(settings, results) {
  const avgInterval = mean(results.map((result) => result.intervalMs).filter(Number.isFinite))
    ?? settings.startingIntervalMs
    ?? 3000;
  const speedFactor = 3000 / Math.max(500, avgInterval);
  const durationFactor = Math.sqrt(Math.max(30, settings.durationSeconds || 300) / 300);
  const adaptiveFactor = settings.adaptive ? 1.12 : 1;
  return roundMetric(speedFactor * durationFactor * adaptiveFactor);
}

function calculateUfovDifficulty(settings) {
  const speedFactor = 900 / Math.max(80, settings.stimulusDurationMs || 900);
  const distractorFactor = 1 + (settings.distractorCount || 0) / 30;
  const adaptiveFactor = settings.autoProgression ? 1.1 : 1;
  return roundMetric(speedFactor * distractorFactor * adaptiveFactor);
}

function calculateIctDifficulty(settings, results) {
  const avgSsd = mean(results.filter((result) => result.stopTrial).map((result) => result.stopSignalDelayMs))
    ?? settings.stopSignalDelayMs
    ?? 250;
  const stopFactor = 1 + Number(settings.stopProbability ?? 0.25);
  const ssdFactor = Math.max(0.4, avgSsd / 250);
  const deadlineFactor = settings.softDeadlineEnabled ? 1200 / Math.max(350, settings.softDeadlineMs || 1200) : 0.9;
  const cueFactor = settings.cueType === "food" ? 1.08 : 1;
  return roundMetric(stopFactor * ssdFactor * deadlineFactor * cueFactor);
}

function mean(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function medianMetric(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : Math.round((clean[middle - 1] + clean[middle]) / 2);
}

function standardDeviationMetric(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return null;
  const avg = mean(clean);
  const variance = mean(clean.map((value) => (value - avg) ** 2));
  return Math.round(Math.sqrt(variance));
}

function extractReactionTimes(trials) {
  return trials.flatMap((trial) => {
    if (Number.isFinite(trial.reactionTimeMs)) return [trial.reactionTimeMs];
    if (trial.reactionTimesMs && typeof trial.reactionTimesMs === "object") return Object.values(trial.reactionTimesMs);
    return [];
  }).filter(Number.isFinite);
}

function detectBreakdownTrial(trials) {
  if (trials.length < 8) return null;
  const windowSize = Math.max(4, Math.min(8, Math.floor(trials.length / 4)));
  for (let index = windowSize; index <= trials.length - windowSize; index += 1) {
    const before = trialAccuracy(trials.slice(index - windowSize, index));
    const after = trialAccuracy(trials.slice(index, index + windowSize));
    if (before >= 0.72 && after <= before - 0.25) return index + 1;
  }
  return null;
}

function trialAccuracy(trials) {
  const scored = trials.map((trial) => {
    if (typeof trial.correct === "boolean") return trial.correct;
    if (trial.targets && trial.responses) {
      const modalities = Object.keys(trial.targets);
      return modalities.every((modality) => Boolean(trial.targets[modality]) === Boolean(trial.responses[modality]));
    }
    return null;
  }).filter((value) => value != null);
  return scored.length ? scored.filter(Boolean).length / scored.length : 0;
}

function postErrorRecoveryTrials(trials) {
  const correctFlags = trials.map((trial) => typeof trial.correct === "boolean" ? trial.correct : null);
  const recovery = [];
  for (let index = 0; index < correctFlags.length; index += 1) {
    if (correctFlags[index] !== false) continue;
    let distance = 0;
    for (let next = index + 1; next < correctFlags.length; next += 1) {
      distance += 1;
      if (correctFlags[next] === true) {
        recovery.push(distance);
        break;
      }
    }
  }
  return recovery.length ? roundMetric(mean(recovery)) : null;
}

function confidenceInterval95(accuracy, trials) {
  if (!Number.isFinite(accuracy) || !Number.isFinite(trials) || trials <= 0) return null;
  const margin = 1.96 * Math.sqrt((accuracy * (1 - accuracy)) / trials);
  return {
    low: clamp01(accuracy - margin),
    high: clamp01(accuracy + margin)
  };
}

function estimatePeripheralDepth(trials) {
  const correctSectors = trials.filter((trial) => trial.correct && (trial.expectedSector || trial.trial?.sector));
  if (!correctSectors.length) return null;
  return roundMetric(correctSectors.length / Math.max(1, trials.length));
}

function firstFinite(values) {
  return values.find(Number.isFinite) ?? null;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function formatSecondsDuration(seconds) {
  if (seconds < 60) return `${seconds} sec`;
  return `${roundMetric(seconds / 60)} min`;
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startMotSession() {
  clearMotTimers();
  initMotScene();
  mot.config = readMotConfig();
  applyMotAdaptiveStartSpeed();
  mot.running = true;
  mot.phase = "countdown";
  mot.results = [];
  mot.selectionReactionTimesMs = [];
  mot.trialIndex = 0;
  mot.startedAt = Date.now();
  elements.appShell.classList.add("mot-open", "game-active", "mot-game-active");
  elements.startMot.disabled = true;
  elements.quitMot.disabled = false;
  elements.nextMotTrial.disabled = true;
  elements.motState.textContent = "Get ready";
  elements.motProgress.textContent = `0 / ${mot.config.trialCount}`;
  prepareMotCountdownScene();
  updateMotStats();
  startMotCountdown();
}

function applyMotAdaptiveStartSpeed() {
  if (!mot.config.autoProgression) return;
  mot.config.ballSpeed = Math.min(mot.config.ballSpeed, mot.config.adaptiveStartSpeed);
  elements.motBallSpeed.value = mot.config.ballSpeed.toFixed(2);
  syncMotSettingLabels();
}

function requestQuitMotSession() {
  if (!mot.running) return;
  if (typeof elements.quitDialog.showModal === "function") {
    elements.quitDialog.showModal();
    return;
  }
  quitMotSession();
}

function quitMotSession() {
  clearMotTimers();
  cancelAnimationFrame(mot.animationFrame);
  const savedProgress = saveMotProgress("quit");
  mot.running = false;
  mot.phase = "idle";
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "mot-game-active");
  elements.startMot.disabled = false;
  elements.quitMot.disabled = true;
  elements.nextMotTrial.disabled = true;
  elements.motState.textContent = "Ready";
  elements.motProgress.textContent = "0 / 0";
  elements.motOverlay.textContent = "Press Start Session.";
  elements.motOutput.textContent = JSON.stringify(savedProgress, null, 2);
  renderMotStatic();
}

function startMotTrial() {
  if (!mot.running) return;
  if (mot.trialIndex >= mot.config.trialCount) {
    finishMotSession();
    return;
  }

  clearMotTimers();
  mot.selectedIds = new Set();
  mot.balls = createMotTrial(mot.config);
  mot.phase = "highlight";
  elements.nextMotTrial.disabled = true;
  elements.motOverlay.classList.remove("countdown-mode");
  elements.motState.textContent = "Memorize targets";
  elements.motProgress.textContent = `${mot.trialIndex + 1} / ${mot.config.trialCount}`;
  elements.motOverlay.textContent = "Targets are highlighted. The scene is still.";
  buildMotObjects();
  setMotBallAppearance("highlight");
  startMotAnimation();

  scheduleMot(() => {
    mot.phase = "tracking";
    elements.motState.textContent = "Tracking";
    elements.motOverlay.textContent = "Track the target balls.";
    setMotBallAppearance("tracking");
  }, mot.config.startDelayMs + mot.config.highlightDurationMs);

  scheduleMot(() => {
    mot.phase = "answer";
    mot.selectionStartedAt = performance.now();
    elements.motState.textContent = "Select targets";
    elements.motOverlay.textContent = `Select ${mot.config.targetCount} target balls.`;
    setMotBallAppearance("answer");
  }, mot.config.startDelayMs + mot.config.highlightDurationMs + mot.config.trackingDurationMs);
}

function startMotCountdown() {
  const steps = ["3", "2", "1"];
  let index = 0;
  elements.motOverlay.classList.add("countdown-mode");
  showMotCountdownStep();

  function showMotCountdownStep() {
    if (!mot.running) return;
    if (index >= steps.length) {
      elements.motOverlay.classList.remove("countdown-mode");
      startMotTrial();
      return;
    }

    elements.motOverlay.textContent = steps[index];
    elements.motOverlay.classList.remove("countdown-mode");
    void elements.motOverlay.offsetWidth;
    elements.motOverlay.classList.add("countdown-mode");
    index += 1;
    scheduleMot(showMotCountdownStep, 850);
  }
}

function prepareMotCountdownScene() {
  if (!mot.group) return;
  mot.group.clear();
  resizeMotRenderer();
  mot.renderer.render(mot.scene, mot.camera);
}

function finishMotSelection() {
  if (mot.phase !== "answer") return;
  const score = scoreMotTrial(mot.balls, [...mot.selectedIds]);
  mot.results.push(score);
  mot.phase = "feedback";
  mot.trialIndex += 1;
  elements.motState.textContent = score.correct ? "Correct" : "Missed";
  elements.motOverlay.textContent = score.correct
    ? "Correct. Nice tracking."
    : `Missed ${score.misses}, false alarms ${score.falseAlarms}.`;
  elements.motFeedback.textContent = elements.motOverlay.textContent;
  colorMotFeedback();
  mot.config = nextMotConfig(mot.config, score);
  elements.motBallSpeed.value = mot.config.ballSpeed.toFixed(2);
  syncMotSettingLabels();
  updateMotStats();
  elements.nextMotTrial.disabled = mot.trialIndex >= mot.config.trialCount;
  if (mot.trialIndex >= mot.config.trialCount) {
    scheduleMot(finishMotSession, mot.config.trialEndDelayMs);
    return;
  }
  if (mot.config.autoContinue) {
    elements.nextMotTrial.disabled = true;
    scheduleMot(startMotTrial, mot.config.trialEndDelayMs);
  }
}

function finishMotSession() {
  clearMotTimers();
  cancelAnimationFrame(mot.animationFrame);
  mot.running = false;
  mot.phase = "complete";
  elements.startMot.disabled = false;
  elements.quitMot.disabled = true;
  elements.nextMotTrial.disabled = true;
  elements.appShell.classList.remove("game-active", "mot-game-active");
  elements.motState.textContent = "Complete";
  elements.motProgress.textContent = `${mot.results.length} / ${mot.config.trialCount}`;
  const correct = mot.results.filter((result) => result.correct).length;
  const total = mot.results.length || 1;
  elements.motOverlay.textContent = `Session complete: ${correct} / ${total} correct.`;
  const savedProgress = saveMotProgress("complete");
  elements.motOutput.textContent = JSON.stringify({
    completedTrials: mot.results.length,
    correct,
    accuracy: Math.round((correct / total) * 100) / 100,
    finalSpeed: mot.config.ballSpeed,
    settings: motSettingsSummary(),
    today: savedProgress.today
  }, null, 2);
  updateMotStats();
}

function initMotScene() {
  if (mot.renderer) {
    resizeMotRenderer();
    return;
  }

  mot.scene = new THREE.Scene();
  mot.scene.background = new THREE.Color(0x000000);
  mot.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  mot.camera.position.set(0, 0, 60);
  mot.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  mot.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  elements.motCanvasWrap.appendChild(mot.renderer.domElement);
  mot.raycaster = new THREE.Raycaster();
  mot.pointer = new THREE.Vector2();
  mot.group = new THREE.Group();
  mot.scene.add(mot.group);
  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(20, 30, 40);
  mot.scene.add(light);
  mot.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  mot.renderer.domElement.addEventListener("pointerdown", handleMotPointerDown);
  window.addEventListener("resize", resizeMotRenderer);
  document.addEventListener("fullscreenchange", handleMotFullscreenChange);
  resizeMotRenderer();
}

function renderMotStatic() {
  if (!mot.renderer) return;
  mot.config = readMotConfig();
  mot.balls = createMotTrial(mot.config, () => 0.5);
  mot.phase = "idle";
  buildMotObjects();
  setMotBallAppearance("idle");
  mot.renderer.render(mot.scene, mot.camera);
}

function buildMotObjects() {
  if (!mot.group) return;
  mot.group.clear();
  mot.camera.fov = mot.config.fov;
  mot.camera.position.set(0, 0, mot.config.cameraDistance);
  mot.camera.updateProjectionMatrix();

  const boxGeometry = new THREE.BoxGeometry(mot.config.boxWidth, mot.config.boxHeight, mot.config.boxDepth);
  const edges = new THREE.EdgesGeometry(boxGeometry);
  mot.box = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x555555 }));
  mot.group.add(mot.box);

  if (mot.config.divider === "vertical") {
    const dividerGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -mot.config.boxHeight / 2, -mot.config.boxDepth / 2),
      new THREE.Vector3(0, mot.config.boxHeight / 2, -mot.config.boxDepth / 2),
      new THREE.Vector3(0, mot.config.boxHeight / 2, mot.config.boxDepth / 2),
      new THREE.Vector3(0, -mot.config.boxHeight / 2, mot.config.boxDepth / 2),
      new THREE.Vector3(0, -mot.config.boxHeight / 2, -mot.config.boxDepth / 2)
    ]);
    mot.divider = new THREE.Line(dividerGeometry, new THREE.LineBasicMaterial({ color: 0x777777 }));
    mot.group.add(mot.divider);
  }

  const segments = mot.config.graphics === "potato" ? 12 : mot.config.graphics === "low" ? 18 : 32;
  const geometry = new THREE.SphereGeometry(mot.config.ballSize, segments, segments);
  mot.balls.forEach((ball) => {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: mot.config.ballOpacity < 1,
      opacity: mot.config.ballOpacity,
      roughness: mot.config.ballRoughness,
      metalness: mot.config.ballMetalness
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(ball.position.x, ball.position.y, ball.position.z);
    mesh.userData.ballId = ball.id;
    ball.mesh = mesh;
    mot.group.add(mesh);
  });
}

function startMotAnimation() {
  cancelAnimationFrame(mot.animationFrame);
  mot.lastFrameAt = performance.now();
  animateMot();
}

function animateMot(now = performance.now()) {
  const delta = Math.min((now - mot.lastFrameAt) / 16.67, 3);
  mot.lastFrameAt = now;
  if (mot.phase === "tracking") moveMotBalls(delta);
  if (mot.config?.cameraRotation) mot.group.rotation.y += mot.config.cameraRotationSpeed * delta * 16.67;
  resizeMotRenderer();
  mot.renderer.render(mot.scene, mot.camera);
  if (mot.running) mot.animationFrame = requestAnimationFrame(animateMot);
}

function moveMotBalls(delta) {
  const bounds = {
    x: mot.config.boxWidth / 2 - mot.config.ballSize,
    y: mot.config.boxHeight / 2 - mot.config.ballSize,
    z: mot.config.boxDepth / 2 - mot.config.ballSize
  };
  mot.balls.forEach((ball) => {
    ball.position.x += ball.velocity.x * delta;
    ball.position.y += ball.velocity.y * delta;
    ball.position.z += ball.velocity.z * delta;
    for (const axis of ["x", "y", "z"]) {
      if (Math.abs(ball.position[axis]) > bounds[axis]) {
        ball.position[axis] = Math.sign(ball.position[axis]) * bounds[axis];
        ball.velocity[axis] *= -1;
      }
    }
  });
  resolveMotBallCollisions(bounds);
  mot.balls.forEach((ball) => {
    ball.mesh.position.set(ball.position.x, ball.position.y, ball.position.z);
  });
}

function resolveMotBallCollisions(bounds) {
  const minDistance = mot.config.ballSize * 2.05;
  for (let i = 0; i < mot.balls.length; i += 1) {
    for (let j = i + 1; j < mot.balls.length; j += 1) {
      const a = mot.balls[i];
      const b = mot.balls[j];
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      if (distance >= minDistance) continue;

      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;
      const overlap = (minDistance - distance) / 2;
      a.position.x -= nx * overlap;
      a.position.y -= ny * overlap;
      a.position.z -= nz * overlap;
      b.position.x += nx * overlap;
      b.position.y += ny * overlap;
      b.position.z += nz * overlap;

      const aNormalVelocity = dotVelocity(a.velocity, nx, ny, nz);
      const bNormalVelocity = dotVelocity(b.velocity, nx, ny, nz);
      const exchange = bNormalVelocity - aNormalVelocity;
      a.velocity.x += exchange * nx;
      a.velocity.y += exchange * ny;
      a.velocity.z += exchange * nz;
      b.velocity.x -= exchange * nx;
      b.velocity.y -= exchange * ny;
      b.velocity.z -= exchange * nz;

      clampMotPosition(a.position, bounds);
      clampMotPosition(b.position, bounds);
    }
  }
}

function dotVelocity(velocity, nx, ny, nz) {
  return velocity.x * nx + velocity.y * ny + velocity.z * nz;
}

function clampMotPosition(position, bounds) {
  position.x = Math.min(Math.max(position.x, -bounds.x), bounds.x);
  position.y = Math.min(Math.max(position.y, -bounds.y), bounds.y);
  position.z = Math.min(Math.max(position.z, -bounds.z), bounds.z);
}

function handleMotPointerDown(event) {
  if (mot.phase !== "answer") return;
  const rect = mot.renderer.domElement.getBoundingClientRect();
  mot.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mot.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  mot.raycaster.setFromCamera(mot.pointer, mot.camera);
  const hits = mot.raycaster.intersectObjects(mot.balls.map((ball) => ball.mesh), false);
  const hit = hits[0]?.object;
  if (!hit) return;
  const id = hit.userData.ballId;
  if (mot.selectedIds.has(id)) mot.selectedIds.delete(id);
  else if (mot.selectedIds.size < mot.config.targetCount) {
    mot.selectedIds.add(id);
    mot.selectionReactionTimesMs.push(Math.round(performance.now() - mot.selectionStartedAt));
  }
  setMotBallAppearance("answer");
  if (mot.selectedIds.size === mot.config.targetCount) finishMotSelection();
}

function setMotBallAppearance(phase) {
  const colors = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xf7f7f7];
  mot.balls.forEach((ball, index) => {
    const selected = mot.selectedIds.has(ball.id);
    let color = 0xd8d8d8;
    if (phase === "highlight") {
      color = ball.isTarget ? 0x45e083 : ball.distractorType === "colored" ? colors[index % colors.length] : 0x9a9a9a;
    } else if (phase === "idle") {
      color = 0xd8d8d8;
    } else if (phase === "answer") {
      color = selected ? 0xffffff : 0x9a9a9a;
    }
    ball.mesh.material.color.setHex(color);
    ball.mesh.scale.setScalar(selected ? 1.18 : 1);
  });
}

function colorMotFeedback() {
  const selected = mot.selectedIds;
  mot.balls.forEach((ball) => {
    const wasSelected = selected.has(ball.id);
    const color = ball.isTarget && wasSelected
      ? 0x45e083
      : !ball.isTarget && wasSelected
        ? 0xff5c5c
        : ball.isTarget
          ? 0xffca3a
          : 0x777777;
    ball.mesh.material.color.setHex(color);
  });
}

function resizeMotRenderer() {
  if (!mot.renderer) return;
  const rect = elements.motCanvasWrap.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (mot.renderer.domElement.width !== width || mot.renderer.domElement.height !== height) {
    mot.renderer.setSize(width, height, false);
    mot.camera.aspect = width / height;
    mot.camera.updateProjectionMatrix();
  }
}

function updateMotStats() {
  const correct = mot.results.filter((result) => result.correct).length;
  const misses = mot.results.reduce((sum, result) => sum + result.misses, 0);
  const falseAlarms = mot.results.reduce((sum, result) => sum + result.falseAlarms, 0);
  elements.motCorrect.textContent = correct;
  elements.motMisses.textContent = misses;
  elements.motFalseAlarms.textContent = falseAlarms;
  elements.motSpeedStat.textContent = Number(mot.config?.ballSpeed ?? elements.motBallSpeed.value).toFixed(2);
}

function readMotConfig() {
  return createMultipleObjectTrackingConfig({
    targetCount: clampNumber(elements.motTargetCount.value, 1, 12),
    blueDistractors: clampNumber(elements.motBlueDistractors.value, 0, 30),
    coloredDistractors: clampNumber(elements.motColoredDistractors.value, 0, 30),
    ballSpeed: clampNumber(elements.motBallSpeed.value, 0.05, 1.5),
    ballSize: clampNumber(elements.motBallSize.value, 0.6, 4),
    trialCount: clampNumber(elements.motTrialCount.value, 1, 40),
    trackingDurationMs: clampNumber(elements.motTrackingDuration.value, 2500, 20000),
    highlightDurationMs: clampNumber(elements.motHighlightDuration.value, 500, 5000),
    boxWidth: clampNumber(elements.motBoxWidth.value, 12, 120),
    boxHeight: clampNumber(elements.motBoxHeight.value, 12, 90),
    boxDepth: clampNumber(elements.motBoxDepth.value, 12, 90),
    fov: clampNumber(elements.motFov.value, 35, 110),
    graphics: elements.motGraphics.value,
    ballOpacity: clampNumber(elements.motBallOpacity.value, 0.35, 1),
    cameraRotation: elements.motCameraRotation.checked,
    cameraRotationSpeed: clampNumber(elements.motCameraRotationSpeed.value, 0, 0.01),
    cameraDistance: clampNumber(elements.motCameraDistance.value, 24, 100),
    divider: elements.motDivider.value,
    feedback: elements.motFeedbackMode.value,
    autoContinue: elements.motAutoContinue.checked,
    autoProgression: elements.motAutoProgression.checked,
    speedStepCorrect: clampNumber(elements.motSpeedStepCorrect.value, 0, 0.25),
    speedStepIncorrect: clampNumber(elements.motSpeedStepIncorrect.value, -0.25, 0)
  });
}

function motSettingsSummary() {
  return {
    targetCount: Number(elements.motTargetCount.value),
    blueDistractors: Number(elements.motBlueDistractors.value),
    coloredDistractors: Number(elements.motColoredDistractors.value),
    ballSpeed: Number(elements.motBallSpeed.value),
    ballSize: Number(elements.motBallSize.value),
    trialCount: Number(elements.motTrialCount.value),
    trackingDurationMs: Number(elements.motTrackingDuration.value),
    highlightDurationMs: Number(elements.motHighlightDuration.value),
    box: {
      width: Number(elements.motBoxWidth.value),
      height: Number(elements.motBoxHeight.value),
      depth: Number(elements.motBoxDepth.value)
    },
    fov: Number(elements.motFov.value),
    graphics: elements.motGraphics.value,
    divider: elements.motDivider.value,
    autoContinue: elements.motAutoContinue.checked,
    autoProgression: elements.motAutoProgression.checked
  };
}

function toggleMotFullscreen() {
  const stage = elements.motCanvasWrap.closest(".mot-stage");
  if (!stage) return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  stage.requestFullscreen?.().then(resizeMotRenderer).catch(() => {});
}

function handleMotFullscreenChange() {
  elements.motStageFullscreen.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
  requestAnimationFrame(resizeMotRenderer);
}

function resetMotOutput() {
  elements.motOutput.textContent = JSON.stringify({
    input: "Press Start Session. Memorize highlighted targets while the scene is still, track them while all balls move, then click the target balls.",
    settings: motSettingsSummary(),
    score: {
      correct: 0,
      misses: 0,
      falseAlarms: 0
    }
  }, null, 2);
}

function scheduleMot(callback, delayMs) {
  const timer = setTimeout(() => {
    mot.timers = mot.timers.filter((item) => item !== timer);
    callback();
  }, delayMs);
  mot.timers.push(timer);
}

function clearMotTimers() {
  mot.timers.forEach((timer) => clearTimeout(timer));
  mot.timers = [];
}

function renderBoard() {
  const cells = Array.from({ length: 9 }, (_, index) => String(index));
  elements.board.innerHTML = cells
    .map((position) => `
      <span class="grid-cell" data-position="${position}">
        ${position === "4" ? '<img class="center-mark" src="/assets/brand/logo-white.png" alt="">' : ""}
      </span>
    `)
    .join("");
}

function showCues(trial) {
  clearBoard();
  const cell = elements.board.querySelector(`[data-position="${trial.cues.position}"]`);
  if (cell) {
    cell.classList.add("active");
    cell.style.setProperty("--shape-color", trial.cues.color);
    cell.innerHTML = `<span class="shape shape-${trial.cues.shape}">${shapeLabels[trial.cues.shape] ?? ""}</span>`;
  }
  elements.audioCue.textContent = session.config.activeModalities.includes("audio") ? "Audio cue" : "Audio off";
  if (session.config.activeModalities.includes("audio")) speakCue(trial.cues.audio);
}

function clearBoard() {
  elements.board.querySelectorAll(".grid-cell").forEach((cell) => {
    cell.classList.remove("active");
    cell.innerHTML = cell.dataset.position === "4" ? '<img class="center-mark" src="/assets/brand/logo-white.png" alt="">' : "";
  });
}

function clearResponseFeedback() {
  elements.responseButtons.forEach((button) => button.classList.remove("pressed", "correct", "wrong"));
}

function schedule(callback, delayMs) {
  const timer = setTimeout(() => {
    session.timers = session.timers.filter((item) => item !== timer);
    callback();
  }, delayMs);
  session.timers.push(timer);
}

function clearTimers() {
  session.timers.forEach((timer) => clearTimeout(timer));
  session.timers = [];
}

function resetOutput() {
  elements.output.textContent = JSON.stringify({
    input: "Press Start Session. Use A for position, F for color, J for shape, and L for audio when that cue matches N steps back.",
    settings: settingsSummary(),
    score: {
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
      accuracy: 0,
      dPrime: 0
    }
  }, null, 2);
}

function activeModalities() {
  const selected = elements.modalityInputs
    .filter((input) => input.checked)
    .map((input) => input.dataset.modality);
  return selected.length ? selected : ["position"];
}

function updateResponseButtons() {
  const active = session.config?.activeModalities ?? activeModalities();
  elements.responseButtons.forEach((button) => {
    const enabled = session.running && active.includes(button.dataset.response);
    button.disabled = !enabled;
    button.classList.toggle("inactive", !active.includes(button.dataset.response));
  });
}

function updateFeedbackVisibility() {
  const mode = elements.feedbackMode.value;
  document.body.classList.toggle("hide-feedback", mode === "hide");
  document.body.classList.toggle("hide-counter", mode === "hide-counter");
  if (mode === "hide") elements.feedback.textContent = "";
  if (mode !== "hide" && !session.running) elements.feedback.textContent = "Feedback will appear here.";
}

function trialFeedback(trial, responses) {
  return session.config.activeModalities.map((modality) => {
    const correct = Boolean(trial.targets[modality]) === Boolean(responses[modality]);
    return { modality, correct, target: Boolean(trial.targets[modality]), responded: Boolean(responses[modality]) };
  });
}

function showFeedback(items) {
  if (!feedbackEnabled()) return;
  elements.responseButtons.forEach((button) => {
    const item = items.find((entry) => entry.modality === button.dataset.response);
    if (!item) return;
    if (item.responded || item.target) button.classList.add(item.correct ? "correct" : "wrong");
  });
  elements.feedback.textContent = items
    .map((item) => `${item.modality}: ${item.correct ? "correct" : item.target ? "miss" : "false alarm"}`)
    .join(" | ");
}

function feedbackEnabled() {
  return elements.feedbackMode.value !== "hide";
}

function progressionResult(accuracy) {
  if (!elements.autoProgression.checked) return session.config.n;
  const percent = accuracy * 100;
  if (percent >= Number(elements.advanceThreshold.value)) {
    session.winStreak += 1;
    session.loseStreak = 0;
  } else if (percent < Number(elements.dropThreshold.value)) {
    session.loseStreak += 1;
    session.winStreak = 0;
  } else {
    session.winStreak = 0;
    session.loseStreak = 0;
  }

  if (session.winStreak >= Number(elements.advanceStreak.value)) {
    session.winStreak = 0;
    return Math.min(session.config.n + 1, Number(elements.nLevel.max));
  }
  if (session.loseStreak >= Number(elements.dropStreak.value)) {
    session.loseStreak = 0;
    return Math.max(session.config.n - 1, Number(elements.nLevel.min));
  }
  return session.config.n;
}

function settingsSummary() {
  return {
    n: Number(elements.nLevel.value),
    sessionTimerSeconds: Number(elements.sessionTimer.value) * 60,
    trialTimeMs: Number(elements.trialTime.value),
    trialCount: Number(elements.trialCount.value),
    matchChance: Number(elements.matchChance.value) / 100,
    interference: Number(elements.interference.value) / 100,
    grid: "2d",
    activeModalities: activeModalities(),
    feedback: elements.feedbackMode.value,
    autoProgression: elements.autoProgression.checked
  };
}

function speakCue(text) {
  const cue = String(text).toLowerCase();
  if (/^[a-z]$/.test(cue)) {
    const audio = audioForCue(cue);
    audio.currentTime = 0;
    audio.play().catch(() => speakCueWithBrowserVoice(text));
    return;
  }
  speakCueWithBrowserVoice(text);
}

function audioForCue(cue) {
  if (!audioCache.has(cue)) {
    audioCache.set(cue, new Audio(`${letterAudioBasePath}/audio-${cue}.mp3`));
  }
  return audioCache.get(cue);
}

function speakCueWithBrowserVoice(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.15;
  utterance.volume = 0.85;
  window.speechSynthesis.speak(utterance);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}
