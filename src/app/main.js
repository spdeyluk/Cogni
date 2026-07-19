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
import { scoreAdhdScreening } from "../core/assessments/adhdScreening.js";
import {
  CAT_MAX_DURATION_MS,
  eapEstimate,
  scoreConfidenceInterval,
  scorePercentile,
  selectNextItem,
  shouldStop,
  thetaToScore
} from "../core/assessments/irt.js";
import { catItemBank, CAT_DOMAIN_LABELS, CAT_DOMAIN_TIME_LIMITS_MS } from "../core/assessments/catItemBank.js";
import { OCD_QUESTIONS, OCD_RATING_LABELS, OCD_SUBSCALE_LABELS, scoreOcdScreening } from "../core/assessments/ocdScreening.js";
import {
  createSustainedAttentionAssessmentConfig,
  generateSustainedAttentionTrials,
  scoreSustainedAttentionAssessment
} from "../core/assessments/sustainedAttention.js";
import {
  createSpatialSpanAssessmentConfig,
  generateSpatialSpanTrials,
  scoreSpatialSpanAssessment
} from "../core/assessments/spatialSpan.js";
import { calculateExerciseWeight } from "../core/exerciseWeight.js";
import * as THREE from "../../node_modules/three/build/three.module.js";

console.info("[Mindcare] main.js loaded");

// Cogni -> Mindcare rename (2026-07-19): migrate any device data still under
// the old key prefix before the first storage read below.
try {
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const oldKey = localStorage.key(i);
    if (oldKey?.startsWith("cogni.")) {
      const newKey = `mindcare.${oldKey.slice(6)}`;
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
      localStorage.removeItem(oldKey);
    }
  }
} catch {
  // Storage unavailable; nothing to migrate.
}

const modalityKeys = {
  KeyA: "position",
  KeyF: "color",
  KeyJ: "shape",
  KeyL: "audio"
};

const letterAudioBasePath = "assets/audio/nback-letters";
const audioCache = new Map();
const exerciseProgressStorageKey = "brainer.exerciseProgress.v1";
const routineStorageKey = "mindcare.routines.v1";
const adhdHistoryStorageKey = "mindcare.adhdAssessmentHistory.v1";
const userProfileStorageKey = "mindcare.userProfile.v1";
const socialApiBaseStorageKey = "mindcare.socialApiBaseUrl.v1";
const xpProgressStorageKey = "mindcare.xpProgress.v1";
const screenTimeWalletStorageKey = "mindcare.screenTimeWallet.v1";
const screenTimeLocalStateStorageKey = "mindcare.screenTimeState.v1";
const screenTimePointsPerMinute = 10;
// Direct earning: every minute of exercise training pays this many coins,
// on top of the daily quest rewards.
const sessionCoinsPerMinute = 10;

// Two experiences from one codebase: the native mobile app is the friendly,
// gamified coach (coins, quests, screen time); the web build is the plain
// training tool for hardcore mind builders. Override with
// localStorage "mindcare.uiMode.v1" = "play" | "pro" for testing.
const mindcareUiMode = detectCogniUiMode();

// Session coins waiting to float once the player exits the summary.
let pendingSessionCoinFloat = 0;

// The web build IS the IQ funnel: email gate -> why-IQ slides -> adaptive
// test -> phone gate + app-launch promo -> score. Nothing else is reachable.
// Escape hatch for previewing the full pro training hub: append ?app.
const iqStandalone = mindcareUiMode === "pro" && !new URLSearchParams(window.location.search).has("app");
const leadStorageKey = "mindcare.lead.v1";
const iqRevealPendingKey = "mindcare.iqRevealPending.v1";

// Dev helper: ?fresh replays the funnel as a brand-new visitor (clears the
// stored lead, any in-progress or finished test, and the reveal flag).
if (iqStandalone && new URLSearchParams(window.location.search).has("fresh")) {
  try {
    for (const key of [leadStorageKey, iqRevealPendingKey, "mindcare.catActiveSession.v1", "mindcare.catSessions.v1"]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
let catPendingResult = null;
let iqCalcTimer = null;
let iqCalcPct = 0;
const iqCalcGates = { phone: false, discord: false };

function loadLead() {
  try {
    return JSON.parse(localStorage.getItem(leadStorageKey)) ?? {};
  } catch {
    return {};
  }
}

// Merges the patch into the stored lead and syncs it to the server, so the
// email gate and the later phone gate land on one row in leads.json.
function saveLead(patch) {
  const lead = { ...loadLead(), ...patch };
  if (!lead.id) lead.id = `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (!lead.createdAt) lead.createdAt = new Date().toISOString();
  try {
    localStorage.setItem(leadStorageKey, JSON.stringify(lead));
  } catch {
    // Local copy is best effort; the POST below is the real capture.
  }
  fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead)
  }).catch(() => {});
  return lead;
}

function hasVerifiedEmail() {
  return Boolean(loadLead().email);
}

function hasSubmittedLead() {
  return Boolean(loadLead().phone);
}

function initIqStandalone() {
  showAssessments();
  const latestSession = loadCatSessions()[0];
  if (catActive?.currentItemId) {
    showCatSection("run");
    renderCatQuestion();
  } else if (latestSession && (!hasSubmittedLead() || localStorage.getItem(iqRevealPendingKey))) {
    // Finished the test but refreshed away before the reveal: the
    // calculation restarts and re-runs whichever gates are still open.
    catPendingResult = latestSession;
    startIqCalculating();
  } else {
    showAssessmentSection("iq-welcome");
  }
  elements.pageTitle.textContent = "Mindcare IQ Test";
  elements.pageLede.textContent = "";
}

function detectCogniUiMode() {
  const paramMode = new URLSearchParams(window.location.search).get("mode");
  if (paramMode === "play" || paramMode === "pro") return paramMode;
  try {
    const stored = localStorage.getItem("mindcare.uiMode.v1");
    if (stored === "play" || stored === "pro") return stored;
  } catch {
    // Fall through to platform detection.
  }
  return window.Capacitor?.isNativePlatform?.() ? "play" : "pro";
}
const screenTimeUnlockOptions = [15, 30, 60];
const dailyQuestsStorageKey = "mindcare.dailyQuests.v1";
const customTasksStorageKey = "mindcare.customTasks.v1";
const homeShowcaseApps = [
  { name: "TikTok", slug: "tiktok" },
  { name: "Instagram", slug: "instagram" },
  { name: "YouTube", slug: "youtube" },
  { name: "Snapchat", slug: "snapchat" },
  { name: "X", slug: "x" },
  { name: "Reddit", slug: "reddit" }
];
let homeAppCycleIndex = 0;
let homeQuestsExpanded = false;
const cognitionHealthStart = 58;
const cognitionHealthFloor = 18;
const dailyQuestDefs = [
  // Balanced so ten minutes of training (session + 5 min + 10 min quests)
  // pays 200 coins = 20 minutes of screen time at 10 coins/minute.
  { id: "detox", label: "Daily detox", reward: 120, kind: "detox" },
  { id: "firstSession", label: "Complete a session", reward: 40, kind: "session" },
  { id: "train5", label: "Train 5 minutes", reward: 60, kind: "minutes", target: 5 },
  { id: "train10", label: "Train 10 minutes", reward: 100, kind: "minutes", target: 10 }
];
const dailyDetoxDoneStorageKey = "mindcare.dailyDetoxDone.v1";
const screenTimeStatus = {
  available: false,
  authorized: false,
  selectionCount: 0,
  shieldActive: false,
  unlockUntil: 0
};
let screenTimeExpiryTimer = null;
const profileOnboardingId = "profile-onboarding";
const leaderboardExerciseIds = ["nback", "rrt", "cct", "ict"];
const leaderboardTimeframeLabels = { all: "All time", monthly: "Monthly" };
const adhdRatingLabels = ["Never", "Rarely", "Sometimes", "Often", "Very often"];
const adhdQuestions = [
  ["Inattention", "I overlook details in work, school, or daily activities."],
  ["Inattention", "I struggle to maintain attention during long tasks."],
  ["Inattention", "My mind wanders during conversations."],
  ["Inattention", "People tell me I seem not to listen."],
  ["Inattention", "I have trouble following multi-step instructions."],
  ["Inattention", "I procrastinate on mentally demanding tasks."],
  ["Inattention", "I leave projects unfinished."],
  ["Inattention", "I struggle to organize tasks or schedules."],
  ["Inattention", "I often misjudge how long tasks will take."],
  ["Inattention", "I avoid tasks requiring sustained mental effort."],
  ["Inattention", "I lose important objects."],
  ["Inattention", "I forget where I put things."],
  ["Inattention", "Small distractions pull me away from tasks."],
  ["Inattention", "I switch tasks without finishing the first one."],
  ["Inattention", "I forget appointments or obligations."],
  ["Inattention", "I rely heavily on reminders."],
  ["Inattention", "I forget parts of conversations."],
  ["Inattention", "I forget routine responsibilities."],
  ["Hyperactivity", "I feel restless when sitting for long periods."],
  ["Hyperactivity", "I fidget with my hands or feet."],
  ["Hyperactivity", "I frequently change position while sitting."],
  ["Hyperactivity", "I feel uncomfortable being inactive."],
  ["Hyperactivity", "I prefer constant activity."],
  ["Hyperactivity", "My thoughts race."],
  ["Hyperactivity", "I talk more than others around me."],
  ["Hyperactivity", "I struggle to unwind."],
  ["Hyperactivity", "I feel driven by an internal motor."],
  ["Hyperactivity", "I find waiting frustrating."],
  ["Hyperactivity", "I seek stimulation when bored."],
  ["Hyperactivity", "I become impatient quickly."],
  ["Impulsivity", "I interrupt conversations."],
  ["Impulsivity", "I answer before questions are finished."],
  ["Impulsivity", "I make purchases without thinking."],
  ["Impulsivity", "I act on impulses I later regret."],
  ["Impulsivity", "I speak without considering consequences."],
  ["Impulsivity", "I make quick decisions without enough information."],
  ["Impulsivity", "I struggle with self-control in emotionally charged situations."],
  ["Impulsivity", "I find it difficult to resist temptations."],
  ["Impulsivity", "I engage in risky behavior without fully considering outcomes."],
  ["Functional impact", "My symptoms affect work or school performance."],
  ["Functional impact", "My symptoms affect relationships."],
  ["Functional impact", "My symptoms affect time management."],
  ["Functional impact", "My symptoms affect finances."],
  ["Functional impact", "My symptoms cause significant stress."],
  ["Functional impact", "My symptoms interfere with achieving my goals."]
];
const adhdContextQuestions = [
  ["Clinical context", "Have these symptoms been present for at least 6 months?", ["No", "Yes"]],
  ["Clinical context", "Did these symptoms begin before age 12?", ["No", "Yes", "Not sure"]]
];

const routineExerciseMeta = {
  nback: { label: "N-Back", defaultMinutes: 2, secondsPerTrial: 2.5 },
  rrt: { label: "Relational Reasoning", defaultMinutes: 5, secondsPerTrial: 30 },
  cct: { label: "Cognitive Control Training", defaultMinutes: 5, secondsPerTrial: 5 },
  ict: { label: "Inhibitory Control Training", defaultMinutes: 4, secondsPerTrial: 1.8 },
  mot: { label: "3D MOT", defaultMinutes: 4, secondsPerTrial: 10 },
  ufov: { label: "UFOV", defaultMinutes: 3, secondsPerTrial: 1.2 }
};

const nBackTrialTimeLimits = {
  min: 1500,
  max: 5000,
  defaultValue: 3000
};

const rrtStackPriorities = {
  distinction: 150,
  linear: 120,
  space2d: 180,
  space3d: 180
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

const topActionIcons = {
  notifications: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9zM10 21h4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 1 1-2.98 2.98l-.04-.04A1.8 1.8 0 0 0 14.8 19.6a1.8 1.8 0 0 0-1.05 1.65V21.4a2.1 2.1 0 1 1-4.2 0v-.06A1.8 1.8 0 0 0 8.5 19.7a1.8 1.8 0 0 0-1.98.36l-.04.04A2.1 2.1 0 1 1 3.5 17.1l.04-.04A1.8 1.8 0 0 0 3.9 15.1a1.8 1.8 0 0 0-1.65-1.05H2.1a2.1 2.1 0 1 1 0-4.2h.06A1.8 1.8 0 0 0 3.8 8.8a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2.1 2.1 0 1 1 6.38 3.8l.04.04A1.8 1.8 0 0 0 8.4 4.2a1.8 1.8 0 0 0 1.05-1.65V2.4a2.1 2.1 0 1 1 4.2 0v.06A1.8 1.8 0 0 0 14.7 4.1a1.8 1.8 0 0 0 1.98-.36l.04-.04A2.1 2.1 0 1 1 19.7 6.7l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.05h.15a2.1 2.1 0 1 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15z"/></svg>`
};

const elements = {
  appShell: document.querySelector("#app-shell"),
  pageTitle: document.querySelector("#page-title"),
  pageLede: document.querySelector("#page-lede"),
  sideNav: document.querySelector(".side-nav"),
  sideNavButtons: [...document.querySelectorAll("[data-section]")],
  exerciseCards: [...document.querySelectorAll("[data-open-exercise]")],
  homePage: document.querySelector(".home-page"),
  friendsPage: document.querySelector(".friends-page"),
  tabExercises: document.querySelector("#tab-exercises"),
  tabStatistics: document.querySelector("#tab-statistics"),
  tabFriends: document.querySelector("#tab-friends"),
  topStreakCount: document.querySelector("#top-streak-count"),
  topNotificationButton: document.querySelector("#top-notification-button"),
  topNotificationCount: document.querySelector("#top-notification-count"),
  createRoutine: document.querySelector("#create-routine"),
  loadRoutine: document.querySelector("#load-routine"),
  routineList: document.querySelector("#routine-list"),
  routineEmpty: document.querySelector(".routine-empty"),
  routineLoadDialog: document.querySelector("#routine-load-dialog"),
  closeRoutineLoadDialog: document.querySelector("#close-routine-load-dialog"),
  exerciseSheet: document.querySelector("#exercise-sheet"),
  exerciseSheetType: document.querySelector("#exercise-sheet-type"),
  exerciseSheetTitle: document.querySelector("#exercise-sheet-title"),
  exerciseSheetContent: document.querySelector("#exercise-sheet-content"),
  closeExerciseSheet: document.querySelector("#close-exercise-sheet"),
  routineDialog: document.querySelector("#routine-dialog"),
  routineDialogTitle: document.querySelector("#routine-dialog-title"),
  closeRoutineDialog: document.querySelector("#close-routine-dialog"),
  friendDialog: document.querySelector("#friend-dialog"),
  screenTimeDialog: document.querySelector("#screen-time-dialog"),
  screenTimeDialogContent: document.querySelector("#screen-time-content"),
  closeScreenTimeDialog: document.querySelector("#close-screen-time-dialog"),
  tasksDialog: document.querySelector("#tasks-dialog"),
  tasksDialogContent: document.querySelector("#tasks-content"),
  closeTasksDialog: document.querySelector("#close-tasks-dialog"),
  closeFriendDialog: document.querySelector("#close-friend-dialog"),
  friendRequestForm: document.querySelector("#friend-request-form"),
  friendHandleInput: document.querySelector("#friend-handle-input"),
  friendStatus: document.querySelector("#friend-status"),
  friendFriendsList: document.querySelector("#friend-friends-list"),
  friendIncomingList: document.querySelector("#friend-incoming-list"),
  friendOutgoingList: document.querySelector("#friend-outgoing-list"),
  socialLeaderboardDialog: document.querySelector("#social-leaderboard-dialog"),
  closeSocialLeaderboard: document.querySelector("#close-social-leaderboard"),
  socialLeaderboardContent: document.querySelector("#social-leaderboard-content"),
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
  profilePage: document.querySelector(".profile-page"),
  catIntro: document.querySelector("#cat-intro"),
  catDetail: document.querySelector("#cat-detail"),
  catRun: document.querySelector("#cat-run"),
  catResult: document.querySelector("#cat-result"),
  catHistory: document.querySelector("#cat-history"),
  catBackToList: document.querySelector("#cat-back-to-list"),
  catStart: document.querySelector("#cat-start"),
  catOpenHistory: document.querySelector("#cat-open-history"),
  catQuit: document.querySelector("#cat-quit"),
  catProgress: document.querySelector("#cat-progress"),
  catTimerBar: document.querySelector("#cat-timer-bar"),
  catDomainLabel: document.querySelector("#cat-domain-label"),
  catPrompt: document.querySelector("#cat-prompt"),
  catStage: document.querySelector("#cat-stage"),
  catOptions: document.querySelector("#cat-options"),
  catScore: document.querySelector("#cat-score"),
  catScoreCi: document.querySelector("#cat-score-ci"),
  catCurve: document.querySelector("#cat-curve"),
  catResultSummary: document.querySelector("#cat-result-summary"),
  catDomainFluid: document.querySelector("#cat-domain-fluid"),
  catDomainVerbal: document.querySelector("#cat-domain-verbal"),
  catDomainQuant: document.querySelector("#cat-domain-quant"),
  catResultBack: document.querySelector("#cat-result-back"),
  catHistoryBack: document.querySelector("#cat-history-back"),
  catHistoryList: document.querySelector("#cat-history-list"),
  adhdAssessmentIntro: document.querySelector("#adhd-assessment-intro"),
  adhdAssessmentDetail: document.querySelector("#adhd-assessment-detail"),
  adhdAssessmentRun: document.querySelector("#adhd-assessment-run"),
  adhdAssessmentResult: document.querySelector("#adhd-assessment-result"),
  adhdAssessmentHistory: document.querySelector("#adhd-assessment-history"),
  startAdhdAssessment: document.querySelector("#start-adhd-assessment"),
  restartAdhdAssessment: document.querySelector("#restart-adhd-assessment"),
  openAdhdHistory: document.querySelector("#open-adhd-history"),
  backToAssessmentList: document.querySelector("#back-to-assessment-list"),
  backToAssessmentListDetail: document.querySelector("#back-to-assessment-list-detail"),
  backToAssessmentListResult: document.querySelector("#back-to-assessment-list-result"),
  adhdHistoryList: document.querySelector("#adhd-history-list"),
  backAdhdQuestion: document.querySelector("#back-adhd-question"),
  adhdProgress: document.querySelector("#adhd-progress"),
  adhdProgressBar: document.querySelector("#adhd-progress-bar"),
  adhdSectionLabel: document.querySelector("#adhd-section-label"),
  adhdQuestionText: document.querySelector("#adhd-question-text"),
  adhdRatingButtons: document.querySelector("#adhd-rating-buttons"),
  adhdResultTitle: document.querySelector("#adhd-result-title"),
  adhdResultSummary: document.querySelector("#adhd-result-summary"),
  adhdInattentionScore: document.querySelector("#adhd-inattention-score"),
  adhdHyperactiveScore: document.querySelector("#adhd-hyperactive-score"),
  adhdImpactScore: document.querySelector("#adhd-impact-score"),
  adhdSimpleScore: document.querySelector("#adhd-simple-score"),
  adhdSimpleConclusion: document.querySelector("#adhd-simple-conclusion"),
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
  sessionSummaryDialog: document.querySelector("#session-summary-dialog"),
  summaryTest: document.querySelector("#summary-test"),
  summaryTime: document.querySelector("#summary-time"),
  summaryCorrect: document.querySelector("#summary-correct"),
  summaryMisses: document.querySelector("#summary-misses"),
  summaryFalseAlarms: document.querySelector("#summary-false-alarms"),
  summarySpeed: document.querySelector("#summary-speed"),
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
  motDurationPresets: [...document.querySelectorAll("[data-mot-duration-preset]")],
  motSessionMinutes: document.querySelector("#mot-session-minutes"),
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
  rrtDurationPresets: [...document.querySelectorAll("[data-rrt-duration-preset]")],
  rrtSessionMinutes: document.querySelector("#rrt-session-minutes"),
  rrtObjectButtons: [...document.querySelectorAll("[data-rrt-object]")],
  rrtModeButtons: [...document.querySelectorAll("[data-rrt-mode]")],
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
  rrtResultStrip: document.querySelector("#rrt-result-strip"),
  rrtFeedback: document.querySelector("#rrt-feedback-line"),
  rrtOutput: document.querySelector("#rrt-session-output"),
  rrtStageCard: document.querySelector(".rrt-stage-card"),
  cctDurationPresets: [...document.querySelectorAll("[data-cct-duration]")],
  cctCueModeButtons: [...document.querySelectorAll("[data-cct-cue-mode]")],
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
  cctKeypadButtons: [...document.querySelectorAll("[data-cct-answer]")],
  cctResultStrip: document.querySelector("#cct-result-strip"),
  cctCorrect: document.querySelector("#cct-correct"),
  cctWrong: document.querySelector("#cct-wrong"),
  cctIntervalStat: document.querySelector("#cct-interval-stat"),
  cctTimeLeft: document.querySelector("#cct-time-left"),
  cctFeedback: document.querySelector("#cct-feedback-line"),
  cctOutput: document.querySelector("#cct-session-output"),
  cctStageCard: document.querySelector(".cct-stage-card"),
  ufovTrialCount: document.querySelector("#ufov-trial-count"),
  ufovDurationPresets: [...document.querySelectorAll("[data-ufov-duration-preset]")],
  ufovSessionMinutes: document.querySelector("#ufov-session-minutes"),
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
  ictDurationPresets: [...document.querySelectorAll("[data-ict-duration-preset]")],
  ictSessionMinutes: document.querySelector("#ict-session-minutes"),
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
let activeRoutineRun = null;
const adhdAssessment = { index: 0, answers: [], context: [] };
let selectedProfileTimeframe = "daily";
let selectedProfileExercise = "nback";
let selectedProfileView = "profile";
let selectedLeaderboardTimeframe = "all";
let socialFriendData = { friends: [], incoming: [], outgoing: [] };
let socialFriendStatus = "";
let socialFriendStatusState = "";
let socialIncomingRequestCount = 0;
let profileEditorOpen = false;
let exerciseTransitionTimer = null;
const brainScoreAnimationCooldownMs = 5 * 60 * 1000;

installMobileInteractionGuards();
renderBoard();
syncSettingLabels();
updateTrialCountFromSessionTimer();
syncMotSettingLabels();
syncRrtSettingLabels();
syncCctSettingLabels();
syncUfovSettingLabels();
syncIctSettingLabels();
applyRrtStackDefaults();
updateFeedbackVisibility();
updateResponseButtons();
resetOutput();
resetMotOutput();
resetRrtOutput();
resetCctOutput();
resetUfovOutput();
resetIctOutput();
renderRoutineList();
elements.appShell?.classList.add(mindcareUiMode === "pro" ? "pro-mode" : "play-mode");
document.documentElement.classList.add(mindcareUiMode === "pro" ? "mode-pro" : "mode-play");
renderHomePage();
renderTopStatus();
if (mindcareUiMode === "pro") {
  document.querySelector("#cat-share")?.removeAttribute("hidden");
  document.querySelector("#cat-discord")?.removeAttribute("hidden");
}
if (iqStandalone) {
  elements.appShell?.classList.add("iq-standalone");
  // Defer past module evaluation so CAT state (let bindings below) exists.
  window.setTimeout(initIqStandalone, 0);
} else if (mindcareUiMode === "pro") {
  showExerciseHub();
}
renderProfileOnboarding();
syncSocialProfileQuietly();
installNativeNavigationBridge();
window.addEventListener("load", () => window.requestAnimationFrame(updateSegmentedControls));
window.addEventListener("resize", () => window.requestAnimationFrame(updateSegmentedControls));

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
  ...elements.rrtVocabularyChoices,
  elements.rrtUseVoronoiEmoji,
  elements.rrtEnableDistinction,
  elements.rrtEnableLinear,
  elements.rrtEnableSpace2d,
  elements.rrtEnableSpace3d
].forEach((input) => input.addEventListener("change", () => {
  ensureRrtHasActiveObject();
  ensureRrtHasActiveMode();
  syncRrtSettingLabels();
}));
elements.rrtObjectButtons.forEach((button) => {
  if (button.disabled) return;
  button.addEventListener("click", () => setRrtObject(button.dataset.rrtObject));
});
elements.rrtModeButtons.forEach((button) => {
  button.addEventListener("click", () => toggleRrtModeOption(button.dataset.rrtMode));
});
elements.rrtDurationPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.rrtSessionMinutes.value = button.dataset.rrtDurationPreset;
    updateRrtTrialCountFromSessionTime();
  });
});
elements.rrtSessionMinutes.addEventListener("input", updateRrtTrialCountFromSessionTime);
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
elements.cctCueModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    elements.cctCueModeButtons.forEach((item) => item.classList.toggle("active", item === button));
    syncCctSettingLabels();
  });
});
elements.motDurationPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.motSessionMinutes.value = button.dataset.motDurationPreset;
    updateMotTrialCountFromSessionTime();
  });
});
elements.motSessionMinutes.addEventListener("input", updateMotTrialCountFromSessionTime);
elements.ufovDurationPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.ufovSessionMinutes.value = button.dataset.ufovDurationPreset;
    updateUfovTrialCountFromSessionTime();
  });
});
elements.ufovSessionMinutes.addEventListener("input", updateUfovTrialCountFromSessionTime);
elements.ictDurationPresets.forEach((button) => {
  button.addEventListener("click", () => {
    elements.ictSessionMinutes.value = button.dataset.ictDurationPreset;
    updateIctTrialCountFromSessionTime();
  });
});
elements.ictSessionMinutes.addEventListener("input", updateIctTrialCountFromSessionTime);
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
elements.openMot?.addEventListener("click", openMotSettings);
elements.openRrt.addEventListener("click", openRrtSettings);
elements.openCct.addEventListener("click", openCctSettings);
elements.openUfov?.addEventListener("click", openUfovSettings);
elements.openIct.addEventListener("click", openIctSettings);
elements.exerciseCards.forEach((card) => {
  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openExerciseById(card.dataset.openExercise);
  });
  card.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openExerciseById(card.dataset.openExercise);
  });
});
elements.tabExercises.addEventListener("click", showExerciseHub);
elements.tabStatistics?.addEventListener("click", showStatistics);
elements.friendsPage?.addEventListener("click", handleFriendsPageClick);
elements.friendsPage?.addEventListener("keydown", handleFriendsPageKeydown);
elements.topNotificationButton?.addEventListener("click", handleTopActionClick);
document.querySelector("#close-settings-drawer")?.addEventListener("click", () => document.querySelector("#settings-drawer")?.close());
document.querySelector("#settings-drawer")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
elements.startAdhdAssessment?.addEventListener("click", startAdhdAssessment);
elements.restartAdhdAssessment?.addEventListener("click", startAdhdAssessment);
elements.backAdhdQuestion?.addEventListener("click", goBackAdhdQuestion);
elements.catIntro?.addEventListener("click", () => showCatSection("detail"));
elements.catIntro?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showCatSection("detail");
});
elements.catBackToList?.addEventListener("click", showAssessmentList);
elements.catStart?.addEventListener("click", startCatTest);
elements.catOpenHistory?.addEventListener("click", () => {
  renderCatHistory();
  showCatSection("history");
});
elements.catHistoryBack?.addEventListener("click", () => showCatSection("detail"));
elements.catResultBack?.addEventListener("click", showAssessmentList);
// Funnel step 1: the email gate before anything starts.
document.querySelector("#iq-welcome-start")?.addEventListener("click", () => {
  if (hasVerifiedEmail()) {
    showIqSlide(0);
    showAssessmentSection("iq-slides");
  } else {
    showAssessmentSection("iq-email");
  }
});
document.querySelector("#iq-email-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = event.target.leadEmail.value.trim();
  if (!email) return;
  saveLead({ email, source: "iq-web" });
  showIqSlide(0);
  showAssessmentSection("iq-slides");
});

// Funnel step 2: the why-IQ slides between the email gate and the test.
const iqSlideNodes = Array.from(document.querySelectorAll("#iq-slides .iq-slide"));
const iqSlideDots = Array.from(document.querySelectorAll("#iq-slides .iq-slide-dots i"));
let iqSlideIndex = 0;

function showIqSlide(index) {
  iqSlideIndex = index;
  iqSlideNodes.forEach((slide, i) => { slide.hidden = i !== index; });
  iqSlideDots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  const next = document.querySelector("#iq-slides-next");
  if (next) next.textContent = index === iqSlideNodes.length - 1 ? "Begin the test" : "Continue";
}

document.querySelector("#iq-slides-next")?.addEventListener("click", () => {
  if (iqSlideIndex < iqSlideNodes.length - 1) showIqSlide(iqSlideIndex + 1);
  else startCatTest();
});

// Post-test "calculating your results" screen: a ~20 s progress bar that
// pauses at 35% for the phone number and at 60% for the Discord ask.
const iqCalcSteps = [
  [0, "Scoring your answers"],
  [20, "Estimating fluid reasoning"],
  [45, "Weighing verbal and quantitative items"],
  [70, "Comparing against population norms"],
  [88, "Finalizing your score"]
];
function startIqCalculating() {
  iqCalcPct = 0;
  iqCalcGates.phone = hasSubmittedLead();
  iqCalcGates.discord = false;
  const phoneBlock = document.querySelector("#iq-calc-phone");
  const discordBlock = document.querySelector("#iq-calc-discord");
  if (phoneBlock) phoneBlock.hidden = true;
  if (discordBlock) discordBlock.hidden = true;
  showAssessmentSection("iq-calculating");
  renderIqCalc();
  resumeIqCalc();
}

function renderIqCalc() {
  const pct = Math.min(100, Math.floor(iqCalcPct));
  const bar = document.querySelector("#iq-calc-bar");
  if (bar) bar.style.width = `${pct}%`;
  const pctLabel = document.querySelector("#iq-calc-pct");
  if (pctLabel) pctLabel.textContent = `${pct}%`;
  const title = document.querySelector("#iq-calc-title");
  if (title) title.textContent = pct >= 60 ? "Almost there…" : "Calculating your results…";
  const step = iqCalcSteps.filter(([at]) => at <= pct).at(-1);
  const stepLabel = document.querySelector("#iq-calc-step");
  if (stepLabel && step) stepLabel.textContent = step[1];
}

function resumeIqCalc() {
  window.clearInterval(iqCalcTimer);
  iqCalcTimer = window.setInterval(() => {
    iqCalcPct += 0.35 + Math.random() * 0.3; // ~5%/s -> ~20 s of "work"
    if (!iqCalcGates.phone && iqCalcPct >= 35) {
      iqCalcPct = 35;
      renderIqCalc();
      window.clearInterval(iqCalcTimer);
      const block = document.querySelector("#iq-calc-phone");
      if (block) block.hidden = false;
      block?.querySelector("input")?.focus();
      return;
    }
    if (!iqCalcGates.discord && iqCalcPct >= 60) {
      iqCalcPct = 60;
      renderIqCalc();
      window.clearInterval(iqCalcTimer);
      const block = document.querySelector("#iq-calc-discord");
      if (block) block.hidden = false;
      return;
    }
    if (iqCalcPct >= 100) {
      iqCalcPct = 100;
      renderIqCalc();
      window.clearInterval(iqCalcTimer);
      window.setTimeout(finishIqCalculating, 450);
      return;
    }
    renderIqCalc();
  }, 100);
}

function finishIqCalculating() {
  window.clearInterval(iqCalcTimer);
  try {
    localStorage.removeItem(iqRevealPendingKey);
  } catch {
    // Best effort.
  }
  const record = catPendingResult ?? loadCatSessions()[0];
  catPendingResult = null;
  if (record) renderCatResult(record);
  showCatSection("result");
}

// 35% pause: the phone gate.
document.querySelector("#cat-lead-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const phone = event.target.leadPhone.value.trim();
  if (!phone) return;
  saveLead({
    phone,
    score: catPendingResult?.score ?? null,
    source: iqStandalone ? "iq-web" : "web-app"
  });
  iqCalcGates.phone = true;
  const block = document.querySelector("#iq-calc-phone");
  if (block) block.hidden = true;
  resumeIqCalc();
});

// 60% pause: the Discord ask.
document.querySelector("#iq-community-continue")?.addEventListener("click", () => {
  iqCalcGates.discord = true;
  const block = document.querySelector("#iq-calc-discord");
  if (block) block.hidden = true;
  resumeIqCalc();
});
document.querySelector("#cat-share")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const shareUrl = `${window.location.origin}/iq`;
  try {
    if (navigator.share) await navigator.share({ title: "Mindcare IQ Test", url: shareUrl });
    else {
      await navigator.clipboard.writeText(shareUrl);
      button.textContent = "Link copied!";
      window.setTimeout(() => { button.textContent = "Share this test"; }, 1800);
    }
  } catch {
    // Share sheet dismissed; nothing to do.
  }
});
elements.catQuit?.addEventListener("click", abandonCatTest);
elements.catOptions?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cat-answer]");
  if (button) answerCatQuestion(Number(button.dataset.catAnswer));
});
function wireAssessmentIntro(id, open) {
  const card = document.querySelector(`#${id}`);
  card?.addEventListener("click", open);
  card?.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    open();
  });
}
wireAssessmentIntro("ocd-intro", () => showAssessmentSection("ocd-detail"));
wireAssessmentIntro("focus-intro", () => showAssessmentSection("focus-detail"));
wireAssessmentIntro("memory-intro", () => showAssessmentSection("memory-detail"));
document.querySelector("#ocd-back-to-list")?.addEventListener("click", showAssessmentList);
document.querySelector("#ocd-start")?.addEventListener("click", startOcdTest);
document.querySelector("#ocd-back-question")?.addEventListener("click", () => {
  if (ocdAssessment.index === 0) {
    showAssessmentSection("ocd-detail");
    return;
  }
  ocdAssessment.index -= 1;
  renderOcdQuestion();
});
document.querySelector("#ocd-rating-buttons")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ocd-rating]");
  if (button) answerOcdQuestion(Number(button.dataset.ocdRating));
});
document.querySelector("#ocd-result-back")?.addEventListener("click", showAssessmentList);
document.querySelector("#ocd-restart")?.addEventListener("click", startOcdTest);
document.querySelector("#focus-back-to-list")?.addEventListener("click", showAssessmentList);
document.querySelector("#focus-start")?.addEventListener("click", startFocusTest);
document.querySelector("#focus-quit")?.addEventListener("click", () => {
  stopFocusTimer();
  focusRun = null;
  showAssessmentList();
});
document.querySelector("#focus-tap")?.addEventListener("click", handleFocusTap);
document.querySelector("#focus-result-back")?.addEventListener("click", showAssessmentList);
document.querySelector("#focus-restart")?.addEventListener("click", startFocusTest);
document.querySelector("#memory-back-to-list")?.addEventListener("click", showAssessmentList);
document.querySelector("#memory-start")?.addEventListener("click", startMemoryTest);
document.querySelector("#memory-quit")?.addEventListener("click", () => {
  stopMemoryTimers();
  memoryRun = null;
  showAssessmentList();
});
document.querySelector("#memory-grid")?.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-memory-cell]");
  if (cell) handleMemoryCellTap(Number(cell.dataset.memoryCell));
});
document.querySelector("#memory-result-back")?.addEventListener("click", showAssessmentList);
document.querySelector("#memory-restart")?.addEventListener("click", startMemoryTest);
elements.adhdAssessmentIntro?.addEventListener("click", showAdhdDetail);
elements.adhdAssessmentIntro?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showAdhdDetail();
});
elements.openAdhdHistory?.addEventListener("click", showAdhdHistory);
elements.backToAssessmentList?.addEventListener("click", showAssessmentList);
elements.backToAssessmentListDetail?.addEventListener("click", showAssessmentList);
elements.backToAssessmentListResult?.addEventListener("click", showAssessmentList);
elements.adhdRatingButtons?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-adhd-rating]");
  if (!button) return;
  answerAdhdQuestion(Number(button.dataset.adhdRating));
});
elements.profileTestsToggle?.addEventListener("click", () => toggleProfileDataPanel("tests"));
elements.profileExercisesToggle?.addEventListener("click", () => toggleProfileDataPanel("exercises"));
elements.profilePage?.addEventListener("click", handleProfilePageClick);
elements.profilePage?.addEventListener("submit", handleProfilePageSubmit);
elements.homePage?.addEventListener("click", handleHomePageClick);
elements.friendRequestForm?.addEventListener("submit", handleFriendRequestSubmit);
elements.closeFriendDialog?.addEventListener("click", closeFriendDialog);
elements.closeScreenTimeDialog?.addEventListener("click", closeScreenTimeDialog);
elements.screenTimeDialogContent?.addEventListener("click", handleScreenTimeDialogClick);
elements.closeTasksDialog?.addEventListener("click", closeTasksDialog);
elements.tasksDialogContent?.addEventListener("click", handleTasksDialogClick);
elements.tasksDialogContent?.addEventListener("submit", handleTasksDialogSubmit);
elements.tasksDialog?.addEventListener("close", renderHomePage);
refreshScreenTimeStatus({ rerender: true });
startHomeAppCycle();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshScreenTimeStatus();
});
elements.friendIncomingList?.addEventListener("click", handleFriendResponseClick);
elements.closeSocialLeaderboard?.addEventListener("click", closeSocialLeaderboard);
elements.socialLeaderboardContent?.addEventListener("click", handleSocialLeaderboardClick);
document.addEventListener("submit", handleProfileOnboardingSubmit);
document.querySelector("#start-daily-detox")?.addEventListener("click", () => startRoutine(buildDailyDetoxRoutine()));
document.querySelector("#open-routines")?.addEventListener("click", () => openRoutineLoader());
document.querySelector("#routine-load-create")?.addEventListener("click", () => {
  closeRoutineLoadDialog();
  openRoutineBuilder();
});
elements.closeRoutineDialog.addEventListener("click", closeRoutineDialog);
elements.closeRoutineLoadDialog?.addEventListener("click", closeRoutineLoadDialog);
elements.closeExerciseSheet?.addEventListener("click", () => elements.exerciseSheet?.close());
elements.exerciseSheet?.addEventListener("close", () => {
  restoreExerciseSheetControls();
  if (!exerciseSheetStarting) showExerciseHub();
  exerciseSheetStarting = false;
});
// Capture phase: put the controls back in their workbench before the start
// button's own handler runs, so the session starts against the normal layout.
elements.exerciseSheet?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !exerciseSheetStartButtons.includes(button.id)) return;
  exerciseSheetStarting = true;
  restoreExerciseSheetControls();
  elements.exerciseSheet.close();
}, true);
elements.addRoutineBlock.addEventListener("click", () => {
  addRoutineBlock(elements.routineExerciseSelect.value);
});
elements.saveRoutine.addEventListener("click", saveRoutineDraft);
elements.deleteRoutine.addEventListener("click", deleteRoutineDraft);
elements.sessionSummaryDialog?.addEventListener("close", handleSessionSummaryClose);
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
elements.routineList?.addEventListener("click", handleSavedRoutineClick);
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
  if (["home", "friends", "exercises", "statistics", "assessments"].includes(section)) return;
  button.addEventListener("click", () => showPlaceholderSection(section));
});
document.querySelector('[data-section="home"]')?.addEventListener("click", showHome);
document.querySelector('[data-section="assessments"]')?.addEventListener("click", showAssessments);
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
  button.addEventListener("click", () => answerCctChoice(button.dataset.cctAnswer));
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

function installMobileInteractionGuards() {
  const isEditableTarget = (target) => Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));

  ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });

  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  document.addEventListener("selectstart", (event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  });

  document.addEventListener("contextmenu", (event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  });
}

document.addEventListener("keydown", (event) => {
  if (ict.running && ["ArrowLeft", "ArrowRight", "KeyF", "KeyJ"].includes(event.code)) {
    event.preventDefault();
    answerIct(["ArrowLeft", "KeyF"].includes(event.code) ? "left" : "right");
    return;
  }
  // RRT: J answers TRUE, F answers FALSE (only while the buttons are live).
  if (rrt.running && ["KeyJ", "KeyF"].includes(event.code) && !elements.rrtTrue.disabled) {
    event.preventDefault();
    answerRrt(event.code === "KeyJ");
    return;
  }
  const modality = modalityKeys[event.code];
  if (!modality) return;
  if (!session.running) return;
  event.preventDefault();
  markModality(modality);
});

function syncSettingLabels() {
  const trialTimeMs = nBackTrialTimeMs();
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
  const selected = elements.modalityInputs
    .filter((input) => input.checked)
    .map((input) => input.dataset.modality);
  elements.nbackLevelPresets.forEach((button) => {
    button.classList.toggle("active", button.dataset.nbackLevelPreset === nValue);
  });

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
  const trialTimeMs = nBackTrialTimeMs();
  elements.trialCount.value = clampNumber(Math.round(sessionTimerMs / trialTimeMs), 12, 2400);
  syncSettingLabels();
}

function updateSessionTimerFromTrialCount() {
  const durationSeconds = Math.round(
    clampNumber(elements.trialCount.value, 12, 2400) * nBackTrialTimeMs() / 1000
  );
  elements.sessionTimer.value = clampNumber(durationSeconds / 60, 0.5, 60);
  syncSettingLabels();
}

function updateRrtTrialCountFromSessionTime() {
  const minutes = clampNumber(elements.rrtSessionMinutes.value, 0.5, 60);
  const secondsPerTrial = elements.rrtTimerEnabled.checked
    ? clampNumber(elements.rrtTimerSeconds.value, 5, 90)
    : 30;
  elements.rrtSessionMinutes.value = minutes;
  elements.rrtTrialCount.value = clampNumber(Math.round(minutes * 60 / secondsPerTrial), 1, 60);
  syncRrtSettingLabels();
}

function updateMotTrialCountFromSessionTime() {
  const minutes = clampNumber(elements.motSessionMinutes.value, 0.5, 60);
  const secondsPerTrial = motSecondsPerTrial();
  elements.motSessionMinutes.value = minutes;
  elements.motTrialCount.value = clampNumber(Math.round(minutes * 60 / secondsPerTrial), 1, 120);
  syncMotSettingLabels();
}

function updateUfovTrialCountFromSessionTime() {
  const minutes = clampNumber(elements.ufovSessionMinutes.value, 0.5, 60);
  const secondsPerTrial = Number(elements.ufovDuration.value) / 1000 + 0.4;
  elements.ufovSessionMinutes.value = minutes;
  elements.ufovTrialCount.value = clampNumber(Math.round(minutes * 60 / secondsPerTrial), 4, 300);
  syncUfovSettingLabels();
}

function updateIctTrialCountFromSessionTime() {
  const minutes = clampNumber(elements.ictSessionMinutes.value, 0.5, 60);
  const totalTrials = clampNumber(Math.round(minutes * 60 / 1.8), 8, 640);
  const blocks = clampNumber(Math.ceil(totalTrials / 80), 1, 8);
  elements.ictSessionMinutes.value = minutes;
  elements.ictBlocks.value = blocks;
  elements.ictTrialsPerBlock.value = clampNumber(Math.ceil(totalTrials / blocks), 8, 80);
  syncIctSettingLabels();
}

function motSecondsPerTrial() {
  return Math.max(2, (
    Number(elements.motHighlightDuration.value)
    + Number(elements.motTrackingDuration.value)
    + 1200
  ) / 1000);
}

function syncDurationPresetButtons(buttons, minutes) {
  buttons.forEach((button) => {
    const presetValue = Number(
      button.dataset.nbackDurationPreset
      ?? button.dataset.cctDuration
      ?? button.dataset.rrtDurationPreset
      ?? button.dataset.motDurationPreset
      ?? button.dataset.ufovDurationPreset
      ?? button.dataset.ictDurationPreset
    );
    button.classList.toggle("active", Number.isFinite(minutes) && Math.abs(presetValue - minutes) < 0.001);
  });
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
  syncDurationPresetButtons(elements.motDurationPresets, Number(elements.motSessionMinutes.value));
}

function syncRrtSettingLabels() {
  const timerEnabled = elements.rrtTimerEnabled.checked;
  elements.rrtPremiseCountValue.textContent = `${elements.rrtPremiseCount.value} qty`;
  elements.rrtTimerSecondsValue.textContent = timerEnabled ? `${elements.rrtTimerSeconds.value} sec` : "Off";
  elements.rrtNonsenseLengthValue.textContent = `${elements.rrtNonsenseLength.value} letters`;
  elements.rrtGarbageLengthValue.textContent = `${elements.rrtGarbageLength.value} letters`;
  elements.rrtPremiseStat.textContent = "";
  elements.rrtTimeLeft.textContent = timerEnabled ? elements.rrtTimerSeconds.value : "--";
  elements.rrtTimerUnit.textContent = timerEnabled ? "sec" : "off";
  [
    elements.rrtTimerSeconds,
    elements.rrtDistinctionTime,
    elements.rrtLinearTime,
    elements.rrtSpace2dTime,
    elements.rrtSpace3dTime
  ].forEach((input) => {
    input.disabled = !timerEnabled;
  });
  elements.appShell.classList.toggle("rrt-timer-off", !timerEnabled);
  syncDurationPresetButtons(elements.rrtDurationPresets, Number(elements.rrtSessionMinutes.value));
  syncRrtDifficultyButtons();
}

function syncCctSettingLabels() {
  const durationMinutes = clampNumber(elements.cctDuration.value, 0.5, 60);
  elements.cctDuration.value = durationMinutes;
  elements.cctDurationValue.textContent = formatDuration(durationMinutes * 60 * 1000);
  elements.cctStartIntervalValue.textContent = `${Number(elements.cctStartInterval.value).toFixed(1)} sec`;
  elements.cctMinIntervalValue.textContent = `${Number(elements.cctMinInterval.value).toFixed(1)} sec`;
  elements.cctCueModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.cctCueMode === selectedCctCueMode());
  });
  elements.cctDurationPresets.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.cctDuration) === durationMinutes);
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
  syncDurationPresetButtons(elements.ufovDurationPresets, Number(elements.ufovSessionMinutes.value));
}

function syncIctSettingLabels() {
  elements.ictStopProbabilityValue.textContent = `${elements.ictStopProbability.value}%`;
  elements.ictSsdValue.textContent = `${elements.ictSsd.value} ms`;
  elements.ictSsdStat.textContent = Math.round(Number(elements.ictSsd.value));
  syncDurationPresetButtons(elements.ictDurationPresets, Number(elements.ictSessionMinutes.value));
}

function applyRrtStackDefaults() {
  elements.rrtVocabularyChoices.forEach((choice) => {
    choice.checked = choice.value === "emoji";
  });
  elements.rrtUseVoronoiEmoji.checked = false;
  elements.rrtPremiseCount.value = 2;
  setRrtMode("distinction", true);
  setRrtMode("linear", true);
  setRrtMode("space2d", false);
  setRrtMode("space3d", false);
  syncRrtSettingLabels();
}

function setRrtObject(object) {
  if (object === "voronoi") return;
  const active = !rrtObjectActive(object);
  if (object === "garbage") {
    setRrtVocabularyEnabled("garbage", active);
  }
  if (object === "meaningful") {
    setRrtVocabularyEnabled("meaningful", active);
  }
  if (object === "emoji") {
    setRrtVocabularyEnabled("emoji", active);
  }
  ensureRrtHasActiveObject();
  syncRrtSettingLabels();
}

function toggleRrtModeOption(mode) {
  const enabledElement = rrtModeEnabledElement(mode);
  if (!enabledElement) return;
  setRrtMode(mode, !enabledElement.checked);
  ensureRrtHasActiveMode();
  syncRrtSettingLabels();
}

function setRrtVocabulary(vocabulary) {
  elements.rrtVocabularyChoices.forEach((choice) => {
    choice.checked = choice.value === vocabulary;
  });
}

function setRrtVocabularyEnabled(vocabulary, enabled) {
  elements.rrtVocabularyChoices.forEach((choice) => {
    if (choice.value === vocabulary) choice.checked = enabled;
  });
}

function rrtObjectActive(object) {
  if (object === "voronoi") return false;
  if (object === "meaningful") return selectedRrtVocabularies().includes("meaningful");
  if (object === "emoji") return selectedRrtVocabularies().includes("emoji");
  if (object === "garbage") return selectedRrtVocabularies().includes("garbage");
  return false;
}

function setRrtMode(mode, enabled) {
  const enabledElement = rrtModeEnabledElement(mode);
  const priorityElement = rrtModePriorityElement(mode);
  if (enabledElement) enabledElement.checked = enabled;
  if (enabled && priorityElement) priorityElement.value = rrtStackPriorities[mode];
}

function rrtModeElementName(mode) {
  return {
    distinction: "Distinction",
    linear: "Linear",
    space2d: "Space2d",
    space3d: "Space3d"
  }[mode];
}

function rrtModeEnabledElement(mode) {
  const name = rrtModeElementName(mode);
  return name ? elements[`rrtEnable${name}`] : null;
}

function rrtModePriorityElement(mode) {
  const name = rrtModeElementName(mode);
  return name ? elements[`rrt${name}Priority`] : null;
}

function ensureRrtHasActiveMode() {
  const hasMode = elements.rrtEnableDistinction.checked
    || elements.rrtEnableLinear.checked
    || elements.rrtEnableSpace2d.checked
    || elements.rrtEnableSpace3d.checked;
  if (hasMode) return;
  setRrtMode("distinction", true);
  setRrtMode("linear", true);
}

function ensureRrtHasActiveObject() {
  elements.rrtUseVoronoiEmoji.checked = false;
  if (selectedRrtVocabularies().length) return;
  setRrtVocabularyEnabled("emoji", true);
}

function syncRrtDifficultyButtons() {
  const modeStates = {
    distinction: elements.rrtEnableDistinction.checked,
    linear: elements.rrtEnableLinear.checked,
    space2d: elements.rrtEnableSpace2d.checked,
    space3d: elements.rrtEnableSpace3d.checked
  };
  elements.rrtObjectButtons.forEach((button) => {
    const active = rrtObjectActive(button.dataset.rrtObject);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.rrtObject === "voronoi") button.disabled = true;
  });
  elements.rrtModeButtons.forEach((button) => {
    const active = Boolean(modeStates[button.dataset.rrtMode]);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function openNBackSettings() {
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("nback-open");
  elements.pageTitle.textContent = "N-back";
  elements.pageLede.textContent = "Track position, color, shape, and audio. Press the matching modality when the current cue matches N steps back.";
}

function openMotSettings() {
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "nback-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("mot-open");
  elements.pageTitle.textContent = "3D MOT";
  elements.pageLede.textContent = "Track highlighted targets in a 3D field. The targets are shown while everything is still, then all balls move and become identical.";
  initMotScene();
  renderMotStatic();
}

function openRrtSettings() {
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("rrt-open");
  elements.pageTitle.textContent = "Relational Reasoning";
  elements.pageLede.textContent = "Read the premises, build the relation mentally, then judge whether the conclusion is true or false.";
}

function openCctSettings() {
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("cct-open");
  elements.pageTitle.textContent = "Cognitive Control Training";
  elements.pageLede.textContent = "Hear or see each digit, then enter the sum of that digit and the one immediately before it.";
}

function openUfovSettings() {
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("ufov-open");
  elements.pageTitle.textContent = "UFOV";
  elements.pageLede.textContent = "Identify the center symbol and locate a brief peripheral target among distractors.";
  renderUfovPreview();
}

function openIctSettings() {
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open");
  setActiveTab("exercises");
  elements.appShell.classList.add("ict-open");
  elements.pageTitle.textContent = "Inhibitory Control Training";
  elements.pageLede.textContent = "Respond quickly to go cues, but withhold your response when the stop signal appears.";
  renderIctPreview();
}

function openExerciseById(exerciseId) {
  const openers = {
    nback: openNBackSettings,
    mot: openMotSettings,
    rrt: openRrtSettings,
    cct: openCctSettings,
    ufov: openUfovSettings,
    ict: openIctSettings
  };
  openers[exerciseId]?.();
  // Routines drive sessions programmatically; the settings sheet is only for
  // a person browsing into an exercise, and only in the gamified mobile app —
  // the pro web build uses the full inline settings page.
  if (!activeRoutineRun && mindcareUiMode === "play") openExerciseSheet(exerciseId);
}

const exerciseSheetInfo = {
  nback: { type: "Working Memory", label: "N-Back", controls: ".nback-workbench > .controls" },
  mot: { type: "Attention", label: "3D MOT", controls: ".mot-controls" },
  rrt: { type: "Fluid Reasoning", label: "RRT", controls: ".rrt-controls" },
  cct: { type: "Cognitive Control", label: "CCT", controls: ".cct-controls" },
  ufov: { type: "Processing Speed", label: "UFOV", controls: ".ufov-controls" },
  ict: { type: "Inhibition", label: "ICT", controls: ".ict-controls" }
};
const exerciseSheetStartButtons = ["start-session", "start-mot-session", "start-rrt-session", "start-cct-session", "start-ufov-session", "start-ict-session"];
let exerciseSheetHome = null;
let exerciseSheetStarting = false;

function openExerciseSheet(exerciseId) {
  const info = exerciseSheetInfo[exerciseId];
  const sheet = elements.exerciseSheet;
  if (!info || !sheet || typeof sheet.showModal !== "function") return;
  const controls = document.querySelector(info.controls);
  if (!controls) return;
  restoreExerciseSheetControls();
  exerciseSheetHome = { controls, parent: controls.parentElement, nextSibling: controls.nextElementSibling };
  elements.exerciseSheetType.textContent = info.type;
  elements.exerciseSheetTitle.textContent = info.label;
  const rateNode = document.querySelector("#exercise-sheet-rate");
  if (rateNode) rateNode.textContent = String(sessionCoinsPerMinute);
  elements.exerciseSheetContent.appendChild(controls);
  exerciseSheetStarting = false;
  sheet.scrollTop = 0;
  if (!sheet.open) sheet.showModal();
}

function restoreExerciseSheetControls() {
  if (!exerciseSheetHome) return;
  const { controls, parent, nextSibling } = exerciseSheetHome;
  exerciseSheetHome = null;
  if (nextSibling) parent.insertBefore(controls, nextSibling);
  else parent.appendChild(controls);
}

function showHome() {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  elements.appShell.classList.remove("friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "assessments-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("home-open");
  setActiveTab("home");
  elements.pageTitle.textContent = "Home";
  elements.pageLede.textContent = "Your daily streak and training pulse.";
  renderHomePage();
}

function showFriendsPage() {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  elements.appShell.classList.remove("home-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "assessments-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("friends-open");
  setActiveTab("friends");
  elements.pageTitle.textContent = "Friends";
  elements.pageLede.textContent = "";
  renderFriendsPage();
  refreshSocialHubFriends();
}

function showExerciseHub() {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  showPendingSessionCoinFloat();
  elements.appShell.classList.remove("home-open", "friends-open", "dashboard-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "assessments-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("exercises-open");
  setActiveTab("exercises");
  elements.pageTitle.textContent = "Train";
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
  elements.appShell.classList.remove("home-open", "friends-open", "friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "assessments-open", "stats-open", "placeholder-open", "leaderboard-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("profile-open");
  setActiveTab("statistics");
  elements.pageTitle.textContent = "Profile";
  elements.pageLede.textContent = "";
  selectedProfileView = "profile";
  profileEditorOpen = false;
  renderProfile();
}

function handleProfilePageClick(event) {
  const viewButton = event.target.closest("[data-profile-view]");
  const timeframeButton = event.target.closest("[data-profile-timeframe]");
  const exerciseButton = event.target.closest("[data-profile-exercise]");
  const editButton = event.target.closest("[data-profile-edit]");
  const cancelEditButton = event.target.closest("[data-profile-edit-cancel]");
  if (editButton) {
    profileEditorOpen = true;
    renderProfile();
    return;
  }
  if (cancelEditButton) {
    profileEditorOpen = false;
    renderProfile();
    return;
  }
  if (viewButton) {
    selectedProfileView = viewButton.dataset.profileView;
    if (selectedProfileView !== "profile") profileEditorOpen = false;
    renderProfile();
    return;
  }
  if (timeframeButton) {
    selectedProfileTimeframe = timeframeButton.dataset.profileTimeframe;
    renderProfile();
    return;
  }
  if (exerciseButton) {
    selectedProfileExercise = exerciseButton.dataset.profileExercise;
    renderProfile();
  }
}

function handleProfilePageSubmit(event) {
  const form = event.target.closest("[data-profile-edit-form]");
  if (!form) return;
  event.preventDefault();
  const handleInput = form.querySelector("[name='profileHandle']");
  const handle = normalizeProfileHandle(handleInput?.value);
  const avatarInitial = normalizeProfileAvatar("", handle);
  saveUserProfile({ handle, avatarInitial });
  syncSocialProfileQuietly();
  profileEditorOpen = false;
  renderProfile();
}

function renderProfile() {
  if (!elements.profilePage) return;
  const exerciseIds = ["nback", "rrt", "cct", "ict"];
  const labels = {
    nback: "N-Back",
    rrt: "RRT",
    cct: "CCT",
    ict: "ICT"
  };
  if (!exerciseIds.includes(selectedProfileExercise)) selectedProfileExercise = "nback";
  if (!["daily", "weekly", "monthly", "all"].includes(selectedProfileTimeframe)) selectedProfileTimeframe = "daily";
  if (!["profile", "data"].includes(selectedProfileView)) selectedProfileView = "profile";

  const progress = loadExerciseProgress();
  const userProfile = loadUserProfile();
  const allSessions = progress.sessions ?? [];
  const allOverview = formatExerciseProgress(progressFromSessions(allSessions));
  const profileStats = {
    currentStreak: calculateDailyTrainingStreak(progress, exerciseIds),
    cogniXp: Math.max(0, Math.round(loadXpProgress().totalXp))
  };
  const sessions = filteredProgressSessions(progress, null, selectedProfileTimeframe);
  const overview = formatExerciseProgress(progressFromSessions(sessions));
  const exerciseStats = exerciseIds.map((exerciseId) => {
    const exerciseSessions = filteredProgressSessions(progress, exerciseId, selectedProfileTimeframe);
    return {
      id: exerciseId,
      label: labels[exerciseId],
      sessions: exerciseSessions,
      progress: formatExerciseProgress(progressFromSessions(exerciseSessions)),
      averageWeight: averageSessionWeight(exerciseSessions)
    };
  });
  const selectedSessions = filteredProgressSessions(progress, selectedProfileExercise, selectedProfileTimeframe);
  const selectedProgress = formatExerciseProgress(progressFromSessions(selectedSessions));
  const latestSession = selectedSessions.at(-1) ?? null;
  const latestWeight = latestSession ? sessionDifficultyWeight(latestSession) : { overall: 0, factors: [] };
  const timeframeTitle = "Review";

  elements.profilePage.dataset.selectedProfileView = selectedProfileView;
  elements.profilePage.innerHTML = `
    <div class="profile-view-switch" aria-label="Profile pages">
      ${["profile", "data"].map((view) => `
        <button class="${view === selectedProfileView ? "active" : ""}" data-profile-view="${view}" type="button" aria-pressed="${view === selectedProfileView ? "true" : "false"}">${view === "profile" ? "Profile" : "Data"}</button>
      `).join("")}
    </div>

    ${selectedProfileView === "profile" ? `
      <section class="profile-simple-panel" aria-label="Profile overview">
        ${renderProfileIdentity(userProfile, profileStats)}
        ${renderProfileHexagon(allSessions)}
        ${renderProfileCompletionCalendar(progress, exerciseIds)}
        ${renderProfileImprovementSection(allSessions)}
      </section>
    ` : `
      <section class="profile-board" aria-label="${escapeHtml(timeframeTitle)} stats">
        <div class="profile-board-header">
          <div>
            <p class="exercise-type">Training overview</p>
            <h2>${escapeHtml(timeframeTitle)}</h2>
          </div>
          <div class="profile-timeframe-control" aria-label="Profile timeframe">
            ${["daily", "weekly", "monthly", "all"].map((timeframe) => `
              <button class="${timeframe === selectedProfileTimeframe ? "active" : ""}" data-profile-timeframe="${timeframe}" type="button" aria-pressed="${timeframe === selectedProfileTimeframe ? "true" : "false"}">${({ daily: "Day", weekly: "Week", monthly: "Month", all: "All time" })[timeframe]}</button>
            `).join("")}
          </div>
        </div>
        <div class="profile-overview">
          ${profileOverviewMetric("Training time", `${overview.durationMinutes} min`, `${overview.completedTrials} completed trials`)}
          ${profileOverviewMetric("Sessions", overview.sessions, overview.sessions === 1 ? "one saved session" : "saved sessions")}
          ${profileOverviewMetric("Accuracy", `${Math.round(overview.accuracy * 100)}%`, "across all exercises")}
          ${profileOverviewMetric("Avg settings weight", formatWeight(averageSessionWeight(sessions).overall), "difficulty from saved settings")}
        </div>
      </section>

      <section class="profile-exercise-section" aria-label="Exercise progress">
        <div class="profile-section-heading">
          <div><p class="exercise-type">Exercises</p><h2>Progress by exercise</h2></div>
          <span>${formatTimeframeLabel(selectedProfileTimeframe)}</span>
        </div>
        <div class="profile-exercise-list">
          ${exerciseStats.map((item) => `
            <button class="profile-exercise-card ${item.id === selectedProfileExercise ? "active" : ""}" data-profile-exercise="${item.id}" type="button">
              <span>${escapeHtml(item.label)}</span>
              <strong>${Math.round(item.progress.accuracy * 100)}%</strong>
              <small>${item.progress.sessions} sessions · ${formatWeight(item.averageWeight.overall)} weight</small>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="profile-detail-section" aria-label="${escapeHtml(labels[selectedProfileExercise])} detail">
        <div class="profile-section-heading">
          <div><p class="exercise-type">${escapeHtml(labels[selectedProfileExercise])}</p><h2>Improvement and difficulty</h2></div>
        </div>
        <div class="profile-detail-summary">
          ${profileDetailMetric("Performance", `${Math.round(selectedProgress.accuracy * 100)}%`, profileAccuracyChange(selectedSessions))}
          ${profileDetailMetric("Settings weight", formatWeight(averageSessionWeight(selectedSessions).overall), profileWeightChange(selectedSessions))}
          ${profileDetailMetric("Answer speed", formatSpeed(selectedProgress.avgAnswerSpeedMs), `${selectedProgress.sessions} recorded sessions`)}
        </div>
        ${renderProfileTrend(selectedSessions)}
        <div class="profile-weight-breakdown">
          <div><span>Latest settings weight</span><strong>${formatWeight(latestWeight.overall)}</strong></div>
          ${latestSession
            ? `<p>Each bar shows how much that setting contributed to this session's difficulty.</p>
               <div class="profile-factor-list">${latestWeight.factors.map((item) => `
                 <div><span>${escapeHtml(item.label)}</span><i><b style="width: ${Math.round(item.value * 100)}%"></b></i><strong>${Math.round(item.value * 100)}</strong></div>
               `).join("")}</div>`
            : `<p>Complete a session to see the settings weight and its breakdown here.</p>`}
        </div>
      </section>
    `}
  `;
  updateSegmentedControls();
  window.requestAnimationFrame(updateSegmentedControls);
}

function renderProfileIdentity(userProfile, stats = { currentStreak: 0, cogniXp: 0 }) {
  const handle = normalizeProfileHandle(userProfile.handle);
  const initial = normalizeProfileAvatar(userProfile.avatarInitial, handle);
  if (profileEditorOpen) {
    return `
      <form class="profile-identity-card profile-identity-edit-card" data-profile-edit-form>
        <div class="profile-edit-actions">
          <button class="secondary-button" data-profile-edit-cancel type="button">Cancel</button>
          <button type="submit">Save</button>
        </div>
        <div class="profile-avatar" aria-hidden="true">${renderProfileAvatarContent({ initial })}</div>
        <div class="profile-identity-main">
          <label class="profile-handle-edit">
            <span>Username</span>
            <div><b>@</b><input name="profileHandle" type="text" value="${escapeHtml(handle.replace(/^@/, ""))}" autocomplete="username" autocapitalize="none" spellcheck="false" aria-label="Username"></div>
          </label>
          ${renderProfileIdentityStats(stats)}
        </div>
      </form>
    `;
  }
  return `
    <article class="profile-identity-card">
      <button class="profile-edit-button" data-profile-edit type="button">Edit</button>
      <div class="profile-avatar" aria-hidden="true">${renderProfileAvatarContent({ initial })}</div>
      <div class="profile-identity-main">
        <strong>${escapeHtml(handle)}</strong>
        ${renderProfileIdentityStats(stats)}
      </div>
    </article>
  `;
}

function renderProfileAvatarContent({ avatarImage, initial }) {
  return `<span class="profile-avatar-initial">${escapeHtml(initial)}</span>`;
}

function renderProfileIdentityStats(stats) {
  return `
    <div class="profile-social-stats" aria-label="Profile stats">
      <div>
        <strong>${Math.max(0, Math.round(stats.currentStreak ?? 0))}</strong>
        <span>Day streak</span>
      </div>
      <div>
        <strong>${Math.max(0, Math.round(stats.cogniXp ?? 0)).toLocaleString()}</strong>
        <span>Mindcare XP</span>
      </div>
    </div>
  `;
}

function profileHexagonStats(sessions) {
  const byExercise = (ids) => sessions.filter((sessionRecord) => ids.includes(sessionRecord.exerciseId));
  // Accuracy carries most of an axis score; recent volume (up to 10 sessions)
  // fills the rest so an axis only maxes out with steady training.
  const axisScore = (list) => {
    if (!list.length) return 0;
    const accuracy = mean(list.map((sessionRecord) => clamp01(Number(sessionRecord.rawAccuracy) || 0))) ?? 0;
    const volume = Math.min(1, list.length / 10);
    return Math.round(100 * (0.7 * accuracy + 0.3 * volume));
  };
  const speeds = sessions
    .map((sessionRecord) => Number(sessionRecord.avgAnswerSpeedMs))
    .filter((value) => Number.isFinite(value) && value > 0);
  // 600 ms average answers score 100; 2500 ms score 0.
  const speedScore = speeds.length ? Math.round(100 * clamp01((2500 - mean(speeds)) / 1900)) : 0;
  return [
    { label: "Focus", value: axisScore(byExercise(["ict", "ufov", "mot"])) },
    { label: "Memory", value: axisScore(byExercise(["nback"])) },
    { label: "Speed", value: speedScore },
    { label: "Logic", value: axisScore(byExercise(["rrt"])) },
    { label: "Verbal", value: 0 },
    { label: "Math", value: axisScore(byExercise(["cct"])) }
  ];
}

function renderProfileHexagon(sessions) {
  const stats = profileHexagonStats(sessions);
  const cx = 160;
  const cy = 116;
  const radius = 76;
  // Vertex angles in screen coordinates, clockwise from the top-left corner:
  // Focus, Memory (top), Speed (right), Logic, Verbal (bottom), Math (left).
  const angles = [240, 300, 0, 60, 120, 180];
  const point = (angle, distance) => {
    const rad = (angle * Math.PI) / 180;
    return [cx + distance * Math.cos(rad), cy + distance * Math.sin(rad)];
  };
  const ringPoints = (distance) => angles
    .map((angle) => point(angle, distance).map((value) => value.toFixed(1)).join(","))
    .join(" ");
  const spokes = angles.map((angle) => {
    const [x, y] = point(angle, radius);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const shape = stats
    .map((stat, index) => point(angles[index], radius * clamp01(stat.value / 100)).map((value) => value.toFixed(1)).join(","))
    .join(" ");
  const labels = stats.map((stat, index) => {
    const angle = angles[index];
    const [x, y] = point(angle, radius + 14);
    const cos = Math.cos((angle * Math.PI) / 180);
    const anchor = cos > 0.5 ? "start" : cos < -0.5 ? "end" : "middle";
    const dy = angle === 60 || angle === 120 ? 14 : angle === 240 || angle === 300 ? -6 : 4;
    return `
      <text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">
        ${escapeHtml(stat.label)}
        <tspan class="hexagon-value" dx="4">${stat.value}</tspan>
      </text>
    `;
  }).join("");
  return `
    <section class="profile-hexagon-card" aria-label="Cognitive profile">
      <div class="profile-section-heading">
        <div><p class="exercise-type">Cognitive profile</p><h2>Abilities</h2></div>
      </div>
      <svg class="profile-hexagon" viewBox="0 0 320 232" aria-hidden="true">
        <g class="hexagon-grid">
          <polygon points="${ringPoints(radius)}"></polygon>
          <polygon points="${ringPoints(radius * 0.5)}"></polygon>
          ${spokes}
        </g>
        <polygon class="hexagon-shape" points="${shape}"></polygon>
        ${labels}
      </svg>
    </section>
  `;
}

const profileCalendarFullMinutes = 20;

// Five green steps from deep forest to bright: the whole color ramps
// (saturation and lightness), not just opacity, so neighbors read distinct.
function activityShade(level) {
  return `color-mix(in srgb, var(--success) ${Math.round(30 + level * 70)}%, var(--surface-2))`;
}

function renderProfileCompletionCalendar(progress, exerciseIds) {
  const monthsBack = 3;
  const today = new Date();
  const rangeStart = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  // Contribution-graph layout: columns are weeks starting Monday.
  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const todayKey = localDateKey(today);
  const daySpan = Math.floor((today - gridStart) / 86400000) + 1;
  const weeks = Math.ceil(daySpan / 7);
  const cells = [];
  const monthLabels = [];
  for (let week = 0; week < weeks; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + week * 7 + weekday);
      const dateKey = localDateKey(date);
      if (date < rangeStart || dateKey > todayKey) {
        cells.push('<i class="activity-day empty" aria-hidden="true"></i>');
        continue;
      }
      if (date.getDate() === 1) {
        monthLabels.push({ column: week, label: date.toLocaleDateString(undefined, { month: "short" }) });
      }
      const minutes = trainingMinutesForDate(progress, exerciseIds, dateKey);
      const level = minutes > 0 ? Math.ceil(clamp01(minutes / profileCalendarFullMinutes) * 5) / 5 : 0;
      const classes = ["activity-day"];
      if (dateKey === todayKey) classes.push("today");
      const shade = minutes > 0 ? ` style="background: ${activityShade(level)}"` : "";
      cells.push(`<i class="${classes.join(" ")}"${shade} title="${escapeHtml(dateKey)}: ${minutes} min"></i>`);
    }
  }
  const rangeLabel = `${rangeStart.toLocaleDateString(undefined, { month: "long" })} – ${today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
  return `
    <section class="profile-calendar-card" aria-label="Training activity calendar">
      <div class="profile-section-heading">
        <div><p class="exercise-type">${escapeHtml(rangeLabel)}</p><h2>Activity</h2></div>
        <div class="activity-legend" aria-hidden="true">
          <span>0m</span>
          <i style="background: var(--surface-2)"></i>
          <i style="background: ${activityShade(0.4)}"></i>
          <i style="background: ${activityShade(0.7)}"></i>
          <i style="background: ${activityShade(1)}"></i>
          <span>${profileCalendarFullMinutes}m+</span>
        </div>
      </div>
      <div class="activity-grid">${cells.join("")}</div>
      <div class="activity-months" style="grid-template-columns: repeat(${weeks}, 1fr)">
        ${monthLabels.map((month) => `<span style="grid-column: ${month.column + 1} / span 3">${escapeHtml(month.label)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderProfileImprovementSection(sessions) {
  const recent = sessions.slice(-20);
  if (recent.length < 2) {
    return `
      <section class="profile-graph-card" aria-label="Improvement">
        <div class="profile-section-heading">
          <div><p class="exercise-type">All exercises</p><h2>Improvement</h2></div>
        </div>
        <p class="profile-graph-empty">Complete a couple of sessions to see your improvement and settings-weight graphs here.</p>
      </section>
    `;
  }
  const accuracyValues = recent.map((sessionRecord) => Math.round(clamp01(sessionRecord.rawAccuracy) * 100));
  const speeds = recent.map((sessionRecord) => {
    const value = Number(sessionRecord.avgAnswerSpeedMs);
    return Number.isFinite(value) && value > 0 ? value : null;
  });
  const speedNumbers = speeds.filter((value) => value != null);
  const minMs = Math.min(...speedNumbers);
  const maxMs = Math.max(...speedNumbers);
  // Fastest answer in the window scores 100, slowest 0, so the line shows relative speed gains.
  const speedValues = speeds.map((value) => {
    if (value == null) return null;
    if (maxMs === minMs) return 50;
    return Math.round(((maxMs - value) / (maxMs - minMs)) * 100);
  });
  // One improvement line: accuracy and relative answer speed averaged into a
  // single 0-100 score (accuracy alone when a session has no speed metric).
  const improvementValues = recent.map((_, index) => {
    const speed = speedValues[index];
    if (speed == null) return accuracyValues[index];
    return Math.round((accuracyValues[index] + speed) / 2);
  });
  const weightValues = recent.map((sessionRecord) => Math.round(clamp01(sessionDifficultyWeight(sessionRecord).overall) * 100));
  return `
    <section class="profile-graph-card" aria-label="Improvement and settings weight across all exercises">
      <div class="profile-section-heading">
        <div><p class="exercise-type">All exercises · last ${recent.length} sessions</p><h2>Improvement</h2></div>
      </div>
      <div class="profile-graph-legend">
        <span><i style="background: var(--success)"></i>Improvement <b>${improvementValues.at(-1)}</b></span>
        <span><i style="background: var(--accent-2)"></i>Settings weight <b>${weightValues.at(-1)} / 100</b></span>
      </div>
      ${profileGraphSvg([
        { values: improvementValues, color: "var(--success)" },
        { values: weightValues, color: "var(--accent-2)" }
      ], recent.length)}
    </section>
  `;
}

function profileGraphSvg(seriesList, pointCount) {
  const width = 320;
  const height = 120;
  const padX = 8;
  const padY = 10;
  const stepX = pointCount > 1 ? (width - padX * 2) / (pointCount - 1) : 0;
  const toY = (value) => padY + (1 - clamp01(value / 100)) * (height - padY * 2);
  const grid = [0, 0.5, 1].map((fraction) => {
    const y = padY + fraction * (height - padY * 2);
    return `<line class="profile-graph-grid" x1="${padX}" y1="${y.toFixed(1)}" x2="${width - padX}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const paths = seriesList.map((series) => {
    const xs = [];
    const ys = [];
    series.values.forEach((value, index) => {
      if (value == null) return;
      xs.push(padX + index * stepX);
      ys.push(toY(value));
    });
    if (!xs.length) return "";
    let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    for (let index = 1; index < xs.length - 1; index += 1) {
      const midX = (xs[index] + xs[index + 1]) / 2;
      const midY = (ys[index] + ys[index + 1]) / 2;
      d += ` Q ${xs[index].toFixed(1)} ${ys[index].toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
    if (xs.length > 1) d += ` L ${xs.at(-1).toFixed(1)} ${ys.at(-1).toFixed(1)}`;
    return `
      <path d="${d}" fill="none" stroke="${series.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="${xs.at(-1).toFixed(1)}" cy="${ys.at(-1).toFixed(1)}" r="3.5" fill="${series.color}"></circle>
    `;
  }).join("");
  return `<svg class="profile-graph" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${grid}${paths}</svg>`;
}

function loadUserProfile() {
  try {
    return JSON.parse(localStorage.getItem(userProfileStorageKey)) || { handle: "@mindcare", avatarInitial: "C" };
  } catch {
    return { handle: "@mindcare", avatarInitial: "C" };
  }
}

function saveUserProfile(profile) {
  try {
    localStorage.setItem(userProfileStorageKey, JSON.stringify(profile));
  } catch {
    // Local profile details are best-effort until accounts exist.
  }
}

function hasUserProfile() {
  try {
    return Boolean(localStorage.getItem(userProfileStorageKey));
  } catch {
    return true;
  }
}

function renderProfileOnboarding() {
  const existing = document.querySelector(`#${profileOnboardingId}`);
  // Shared IQ-test visitors are leads, not app users — never ask them to
  // create a profile.
  if (iqStandalone) {
    existing?.remove();
    return;
  }
  if (hasUserProfile()) {
    existing?.remove();
    return;
  }
  if (existing) return;
  document.body.insertAdjacentHTML("beforeend", `
    <section class="profile-onboarding" id="${profileOnboardingId}" aria-label="Profile setup">
      <form class="profile-onboarding-card" data-profile-onboarding-form>
        <p class="exercise-type">Mindcare</p>
        <h2>Create your profile</h2>
        <div class="profile-onboarding-photo">
          <div class="profile-avatar" aria-hidden="true">
            <span class="profile-avatar-initial">C</span>
          </div>
        </div>
        <label class="profile-edit-field">
          <span>Username</span>
          <div><b>@</b><input name="profileHandle" type="text" value="mindcare" autocomplete="username" autocapitalize="none" spellcheck="false" aria-label="Username"></div>
        </label>
        <button type="submit">Start</button>
      </form>
    </section>
  `);
}

function handleProfileOnboardingSubmit(event) {
  const form = event.target.closest("[data-profile-onboarding-form]");
  if (!form) return;
  event.preventDefault();
  const handleInput = form.querySelector("[name='profileHandle']");
  const handle = normalizeProfileHandle(handleInput?.value);
  const avatarInitial = normalizeProfileAvatar("", handle);
  saveUserProfile({ handle, avatarInitial });
  syncSocialProfileQuietly();
  document.querySelector(`#${profileOnboardingId}`)?.remove();
  if (elements.appShell.classList.contains("profile-open")) renderProfile();
}

function normalizeProfileHandle(value) {
  const raw = String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_.]/g, "").slice(0, 24);
  return `@${cleaned || "mindcare"}`;
}

function normalizeProfileAvatar(value, handle = "@mindcare") {
  const fallback = normalizeProfileHandle(handle).replace(/^@/, "").charAt(0).toUpperCase() || "C";
  return String(value ?? "").trim().replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || fallback;
}

function normalizeProfileAvatarImage(value) {
  const image = String(value ?? "");
  return image.startsWith("data:image/") ? image : "";
}

function animateBrainHealthScore() {
  const scoreNode = elements.profilePage?.querySelector("[data-brain-score]");
  const arcNode = elements.profilePage?.querySelector(".brain-gauge-progress");
  if (!scoreNode || !arcNode) return;
  const targetScore = clampNumber(scoreNode.dataset.brainScore, 0, 200);
  const targetPercent = clampNumber(arcNode.dataset.brainProgress, 0, 100);
  const now = Date.now();
  const lastAnimatedAt = Number(sessionStorage.getItem("mindcare.brainScoreAnimatedAt") ?? 0);
  const shouldAnimate = !lastAnimatedAt || now - lastAnimatedAt > brainScoreAnimationCooldownMs;
  if (!shouldAnimate) {
    scoreNode.textContent = String(Math.round(targetScore));
    arcNode.style.strokeDasharray = `${targetPercent} 100`;
    return;
  }
  sessionStorage.setItem("mindcare.brainScoreAnimatedAt", String(now));
  scoreNode.textContent = "0";
  arcNode.style.strokeDasharray = "0 100";
  const durationMs = 850;
  const startedAt = performance.now();
  const tick = (now) => {
    const progress = clamp01((now - startedAt) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    scoreNode.textContent = String(Math.round(targetScore * eased));
    arcNode.style.strokeDasharray = `${targetPercent * eased} 100`;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function calculateBrainHealthScore(sessions, overview, exerciseCount) {
  if (!sessions.length) {
    return {
      score: 0,
      label: "No data yet",
      copy: "Complete a session to start building this local activity score."
    };
  }

  const targets = { minutes: 360, sessions: 16, activeDays: 14 };
  const activeDays = new Set(sessions.map((sessionRecord) => localDateKey(new Date(sessionRecord.endedAt ?? sessionRecord.startedAt)))).size;
  const activeExercises = new Set(sessions.map((sessionRecord) => sessionRecord.exerciseId).filter(Boolean)).size;
  const averageWeight = averageSessionWeight(sessions).overall;
  const activityScore = clamp01((overview.durationMinutes / targets.minutes) * 0.65 + (overview.sessions / targets.sessions) * 0.35);
  const consistencyScore = clamp01(activeDays / targets.activeDays);
  const varietyScore = clamp01(activeExercises / Math.max(1, exerciseCount));
  const score = Math.round(100 * (
    clamp01(overview.accuracy) * 0.35 +
    activityScore * 0.25 +
    consistencyScore * 0.2 +
    averageWeight * 0.1 +
    varietyScore * 0.1
  ));

  return {
    score,
    label: brainHealthLabel(score),
    copy: `Overall score from ${overview.sessions} saved session${overview.sessions === 1 ? "" : "s"}, accuracy, variety, activity, and settings difficulty.`
  };
}

function brainHealthLabel(score) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 50) return "Building";
  if (score >= 25) return "Light";
  return "Starting";
}

function renderBrainHealthScore({ score }) {
  const normalizedScore = Math.round(clampNumber(score, 0, 100));
  const displayScore = normalizedScore * 2;
  return `
    <article class="profile-brain-score-card" aria-label="Brain health score">
      <span class="profile-brain-context">Overall brain stats</span>
      <div class="profile-brain-gauge" aria-hidden="true">
        <svg viewBox="0 0 280 150" role="img">
          <defs>
            <linearGradient id="brain-score-gradient" x1="28" y1="126" x2="252" y2="126" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f5f5f7"></stop>
              <stop offset="100%" stop-color="#f5f5f7"></stop>
            </linearGradient>
          </defs>
          <path class="brain-gauge-track" pathLength="100" d="M 28 126 A 112 112 0 0 1 252 126"></path>
          <path class="brain-gauge-progress" pathLength="100" data-brain-progress="${normalizedScore}" style="stroke-dasharray: 0 100" d="M 28 126 A 112 112 0 0 1 252 126"></path>
        </svg>
      </div>
      <strong data-brain-score="${displayScore}">0</strong>
    </article>
  `;
}

function profileOverviewMetric(label, value, copy) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><p>${escapeHtml(copy)}</p></article>`;
}

function profileDetailMetric(label, value, copy) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><p>${escapeHtml(copy)}</p></article>`;
}

function sessionDifficultyWeight(sessionRecord) {
  const stored = sessionRecord?.difficultyWeight;
  if (stored && Number.isFinite(stored.overall) && Array.isArray(stored.factors)) return stored;
  return calculateExerciseWeight(sessionRecord?.exerciseId, sessionRecord?.settingsSnapshot ?? {});
}

function averageSessionWeight(sessions) {
  const values = sessions.map((sessionRecord) => sessionDifficultyWeight(sessionRecord).overall);
  return { overall: mean(values) ?? 0 };
}

function formatWeight(value) {
  return `${Math.round(clamp01(value) * 100)} / 100`;
}

function profileAccuracyChange(sessions) {
  if (sessions.length < 2) return "More sessions reveal a trend";
  const change = Math.round((Number(sessions.at(-1).rawAccuracy) - Number(sessions[0].rawAccuracy)) * 100);
  return `${change >= 0 ? "+" : ""}${change}% from first to latest`;
}

function profileWeightChange(sessions) {
  if (sessions.length < 2) return "Settings difficulty is tracked separately";
  const change = Math.round((sessionDifficultyWeight(sessions.at(-1)).overall - sessionDifficultyWeight(sessions[0]).overall) * 100);
  return `${change >= 0 ? "+" : ""}${change} points from first to latest`;
}

function renderProfileTrend(sessions) {
  if (!sessions.length) return `<div class="profile-trend-empty">Complete a session to start your performance and settings-weight trend.</div>`;
  const points = sessions.slice(-12);
  return `
    <div class="profile-trend-legend"><span><i class="profile-legend-accuracy"></i>Accuracy</span><span><i class="profile-legend-weight"></i>Settings weight</span></div>
    <div class="profile-trend-chart" aria-label="Accuracy and settings weight across recent sessions">
      ${points.map((sessionRecord) => {
        const accuracy = Math.round(clamp01(sessionRecord.rawAccuracy) * 100);
        const weight = Math.round(sessionDifficultyWeight(sessionRecord).overall * 100);
        return `<div class="profile-trend-point" title="${accuracy}% accuracy, ${weight} settings weight"><i class="profile-accuracy-bar" style="height: ${Math.max(3, accuracy)}%"></i><b class="profile-weight-marker" style="bottom: ${weight}%"></b></div>`;
      }).join("")}
    </div>
  `;
}

function renderHomePage() {
  if (!elements.homePage) return;
  const progress = loadExerciseProgress();
  const health = cognitionHealth(progress);

  elements.homePage.innerHTML = `
    <section class="home-health" aria-label="Cognition health">
      <div class="home-health-gauge">
        ${homeHealthGaugeSvg(health)}
        ${homeHealthHeadLayers(health)}
      </div>
      <strong>${health}%</strong>
      <span>Cognition health</span>
    </section>

    ${mindcareUiMode === "play" ? renderHomePointsCard() : ""}

    ${mindcareUiMode === "play" ? renderHomeQuests() : ""}
  `;
  renderTopStatus();
}

function renderHomeQuests() {
  const quests = dailyQuestViews(loadExerciseProgress());
  const visible = homeQuestsExpanded ? quests : quests.slice(0, 3);
  const rows = visible.map((quest) => {
    let pill;
    if (quest.claimed) {
      pill = '<span class="quest-pill quest-pill-claimed">Claimed</span>';
    } else if (quest.claimable) {
      pill = `<button class="quest-pill quest-pill-claimable" data-quest-claim="${quest.id}" type="button">+${quest.reward} <img src="assets/mindcare-coin-23.png" alt="coins"></button>`;
    } else {
      pill = `<span class="quest-pill quest-pill-progress" style="--quest-progress: ${Math.round(quest.progressPct * 100)}%">+${quest.reward} <img src="assets/mindcare-coin-23.png" alt="coins"></span>`;
    }
    return `
      <div class="home-quest-row">
        <span>${escapeHtml(quest.label)}</span>
        ${pill}
      </div>
    `;
  }).join("");
  const newTaskRow = homeQuestsExpanded
    ? '<button class="home-quest-row home-quest-add" data-tasks-open type="button"><span>+ New task</span></button>'
    : "";
  const hiddenClaimable = homeQuestsExpanded ? 0 : quests.slice(3).filter((quest) => quest.claimable).length;
  const moreButton = quests.length > 3
    ? `<button class="home-quests-more" data-quests-more type="button">${homeQuestsExpanded ? "less" : "more"}${hiddenClaimable ? `<b class="quests-more-badge">${hiddenClaimable}</b>` : ""}</button>`
    : "";
  return `
    <section class="home-quests" aria-label="Daily rewards">
      ${rows}
      ${newTaskRow}
      ${moreButton}
    </section>
  `;
}

function cognitionHealth(progress) {
  // Everyone starts at 58%; a week of skipped days erodes it day by day to the 18% floor.
  const hasHistory = Object.keys(progress.days ?? {}).length > 0;
  if (!hasHistory) return cognitionHealthStart;
  const missedDays = consecutiveMissedTrainingDays(progress, leaderboardExerciseIds);
  const trainedToday = trainingMinutesForDate(progress, leaderboardExerciseIds, localDateKey()) > 0;
  const fullDaysMissed = Math.max(0, missedDays - (trainedToday ? 0 : 1));
  const dailyDecay = (cognitionHealthStart - cognitionHealthFloor) / 7;
  return Math.max(cognitionHealthFloor, Math.round(cognitionHealthStart - fullDaysMissed * dailyDecay));
}

function homeHealthHeadLayers(health) {
  // Red brain at 0%, crossfading through yellow at 50% to green at 100%,
  // on the same scale as homeHealthColor.
  const t = clamp01(health / 100);
  const yellowOpacity = clamp01(t * 2);
  const greenOpacity = clamp01(t * 2 - 1);
  return `
    <img class="home-health-head" src="assets/head.png" alt="">
    <img class="home-health-brain" src="assets/head-brain-red.png" alt="">
    <img class="home-health-brain" src="assets/head-brain-yellow.png" alt="" style="opacity: ${yellowOpacity}">
    <img class="home-health-brain" src="assets/head-brain-green.png" alt="" style="opacity: ${greenOpacity}">
  `;
}

function homeHealthColor(health) {
  // Red (hue 0) at 0% through yellow at 50% to bright green (hue 120) at 100%.
  return `hsl(${Math.round(clamp01(health / 100) * 120)}, 32%, 46%)`;
}

function homeHealthGaugeSvg(health) {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const arcSpan = 0.75;
  const track = circumference * arcSpan;
  const fill = track * clamp01(health / 100);
  return `
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="home-health-track" cx="100" cy="100" r="${radius}"
        stroke-dasharray="${track} ${circumference}" transform="rotate(135 100 100)"></circle>
      <circle class="home-health-fill" cx="100" cy="100" r="${radius}" style="stroke: ${homeHealthColor(health)}"
        stroke-dasharray="${fill} ${circumference}" transform="rotate(135 100 100)"></circle>
    </svg>
  `;
}

function screenTimeMinutesLabel(points) {
  const minutes = Math.floor(Math.max(0, points) / screenTimePointsPerMinute);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h and ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

function renderHomePointsCard() {
  const wallet = loadScreenTimeWallet();
  const app = homeShowcaseApps[homeAppCycleIndex % homeShowcaseApps.length];
  return `
    <article class="home-points-card" aria-label="Mindcare coins">
      <div class="home-points-main">
        <div class="home-points-balance">
          <strong>${wallet.balance.toLocaleString()}</strong>
          <img src="assets/mindcare-coin-45.png" alt="coins">
        </div>
        <button class="home-points-buy" data-tasks-open type="button">Set task</button>
      </div>
      <p>${screenTimeMinutesLabel(wallet.balance)} of screen time</p>
      <div class="home-points-apps">
        <div class="home-app-cycle" data-app-cycle>${homeAppCycleInner(app)}</div>
        <button data-screentime-buy-time type="button">Unlock time</button>
      </div>
    </article>
  `;
}

function homeAppCycleInner(app) {
  return `
    <span class="home-app-icon" data-letter="${escapeHtml(app.name[0])}">
      <img src="assets/apps/${app.slug}.png" alt="" onerror="this.remove()">
    </span>
    <span class="home-app-name">${escapeHtml(app.name)}</span>
  `;
}

function startHomeAppCycle() {
  setInterval(() => {
    const el = document.querySelector("[data-app-cycle]");
    if (!el) return;
    homeAppCycleIndex = (homeAppCycleIndex + 1) % homeShowcaseApps.length;
    el.classList.add("app-cycle-out");
    setTimeout(() => {
      el.innerHTML = homeAppCycleInner(homeShowcaseApps[homeAppCycleIndex]);
      el.classList.remove("app-cycle-out");
    }, 240);
  }, 2600);
}

function openTasksDialog() {
  if (!elements.tasksDialog) return;
  renderTasksDialog();
  if (typeof elements.tasksDialog.showModal === "function" && !elements.tasksDialog.open) {
    elements.tasksDialog.showModal();
  }
}

function closeTasksDialog() {
  elements.tasksDialog?.close();
}

function renderTasksDialog() {
  if (!elements.tasksDialogContent) return;
  const quests = dailyQuestViews(loadExerciseProgress());
  const rows = quests.map((quest) => {
    let pill;
    if (quest.claimed) {
      pill = '<span class="quest-pill quest-pill-claimed">Claimed</span>';
    } else if (quest.claimable) {
      pill = `<button class="quest-pill quest-pill-claimable" data-quest-claim="${quest.id}" type="button">+${quest.reward} <img src="assets/mindcare-coin-23.png" alt="coins"></button>`;
    } else {
      pill = `<span class="quest-pill quest-pill-progress" style="--quest-progress: ${Math.round(quest.progressPct * 100)}%">+${quest.reward} <img src="assets/mindcare-coin-23.png" alt="coins"></span>`;
    }
    const remove = quest.id.startsWith("custom-")
      ? `<button class="task-remove" data-task-remove="${quest.id}" type="button" aria-label="Remove task">&times;</button>`
      : "";
    return `
      <div class="home-quest-row">
        <span>${escapeHtml(quest.label)}</span>
        <div class="task-row-actions">${pill}${remove}</div>
      </div>
    `;
  }).join("");
  elements.tasksDialogContent.innerHTML = `
    <div class="home-quests">${rows}</div>
    <form class="task-add-row" data-task-add-form>
      <select name="taskExercise" aria-label="Exercise">
        ${Object.entries(customTaskExerciseLabels).map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join("")}
      </select>
      <select name="taskMinutes" aria-label="Minutes">
        ${customTaskMinuteChoices.map((minutes) => `<option value="${minutes}"${minutes === 10 ? " selected" : ""}>${minutes} min</option>`).join("")}
      </select>
      <button type="submit">Add</button>
    </form>
    <p class="task-add-hint">Your task pays 10 coins per minute — e.g. 15 min = +150.</p>
  `;
}

function renderTopStatus() {
  const progress = loadExerciseProgress();
  const streak = calculateDailyTrainingStreak(progress, leaderboardExerciseIds);
  if (elements.topStreakCount) elements.topStreakCount.textContent = streak;
  renderTopActionButton();
  updateTopNotificationBadge(socialIncomingRequestCount);
}

function renderTopActionButton() {
  if (!elements.topNotificationButton) return;
  const isProfilePage = elements.appShell.classList.contains("profile-open");
  elements.topNotificationButton.hidden = !isProfilePage;
  elements.topNotificationButton.dataset.topAction = isProfilePage ? "settings" : "none";
  elements.topNotificationButton.setAttribute("aria-label", isProfilePage ? "Profile settings" : "Notifications");
  elements.topNotificationButton.innerHTML = `${isProfilePage ? topActionIcons.settings : topActionIcons.notifications}<span id="top-notification-count" hidden>0</span>`;
  elements.topNotificationCount = elements.topNotificationButton.querySelector("#top-notification-count");
}

function handleTopActionClick() {
  if (elements.appShell.classList.contains("profile-open")) {
    openSettingsDrawer();
  }
}

function openSettingsDrawer() {
  const drawer = document.querySelector("#settings-drawer");
  if (drawer && typeof drawer.showModal === "function" && !drawer.open) drawer.showModal();
}

function renderFriendsPage() {
  if (!elements.friendsPage) return;
  const friends = socialFriendData.friends ?? [];
  elements.friendsPage.innerHTML = `
    <button class="friends-leaderboard-button" type="button" data-open-leaderboard>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></svg>
      <span>Leaderboards</span>
    </button>

    <section class="friends-add-search" aria-label="Add friends">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z"/></svg>
      <input data-social-friend-input type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Add friends...">
    </section>
    <p class="friend-status friends-page-status" data-state="${escapeHtml(socialFriendStatusState)}" data-social-friend-status>${escapeHtml(socialFriendStatus)}</p>

    <section class="friends-main-list" aria-label="Friends list">
      <div class="friend-list">${renderSocialFriends(friends, true)}</div>
    </section>

    <button class="friends-invite-button" type="button" data-social-send-friend>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 20a5.5 5.5 0 0 1 11 0M12.5 19a4.5 4.5 0 0 1 9 0M19 14v5M16.5 16.5h5"/></svg>
      <span>Invite Friends</span>
    </button>
  `;
}

function handleHomePageClick(_event) {
  if (_event.target.closest("[data-home-train]")) showExerciseHub();
  if (_event.target.closest("[data-screentime-buy-time]")) openScreenTimeDialog();
  if (_event.target.closest("[data-tasks-open]")) openTasksDialog();
  const questButton = _event.target.closest("[data-quest-claim]");
  if (questButton) {
    spawnCoinClaimBurst(questButton);
    claimDailyQuest(questButton.dataset.questClaim);
    pulseHomeBalance();
  }
  const lockedPill = _event.target.closest(".quest-pill-progress");
  if (lockedPill) nudgeLockedQuestPill(lockedPill);
  if (_event.target.closest("[data-quests-more]")) {
    homeQuestsExpanded = !homeQuestsExpanded;
    renderHomePage();
  }
}

// Claim feedback: a "+N coins" float that rises from the tapped pill (added to
// the enclosing dialog when there is one, so it paints above the top layer).
function spawnCoinClaimBurst(button) {
  const rect = button.getBoundingClientRect();
  const float = document.createElement("div");
  float.className = "coin-claim-float";
  float.innerHTML = `<span>${escapeHtml(button.textContent.trim())}</span><img src="assets/mindcare-coin-23.png" alt="">`;
  float.style.left = `${rect.left + rect.width / 2}px`;
  float.style.top = `${rect.top - 6}px`;
  (button.closest("dialog") ?? document.body).appendChild(float);
  window.setTimeout(() => float.remove(), 1200);
}

function pulseHomeBalance() {
  const balance = document.querySelector(".home-points-balance");
  if (!balance) return;
  balance.classList.add("balance-pop");
  window.setTimeout(() => balance.classList.remove("balance-pop"), 650);
}

function nudgeLockedQuestPill(pill) {
  if (pill.classList.contains("quest-pill-shake")) return;
  pill.classList.add("quest-pill-shake");
  window.setTimeout(() => pill.classList.remove("quest-pill-shake"), 450);
}

function handleTasksDialogClick(event) {
  const questButton = event.target.closest("[data-quest-claim]");
  if (questButton) {
    spawnCoinClaimBurst(questButton);
    claimDailyQuest(questButton.dataset.questClaim);
    renderTasksDialog();
    return;
  }
  const lockedPill = event.target.closest(".quest-pill-progress");
  if (lockedPill) nudgeLockedQuestPill(lockedPill);
  const removeButton = event.target.closest("[data-task-remove]");
  if (removeButton) {
    removeCustomTask(removeButton.dataset.taskRemove);
    renderTasksDialog();
    renderHomePage();
  }
}

function handleTasksDialogSubmit(event) {
  const form = event.target.closest("[data-task-add-form]");
  if (!form) return;
  event.preventDefault();
  if (addExerciseTask(form.taskExercise.value, form.taskMinutes.value)) {
    renderTasksDialog();
    renderHomePage();
  }
}

function handleFriendsPageClick(event) {
  if (event.target.closest("[data-open-leaderboard]")) {
    openSocialLeaderboard();
    return;
  }

  const sendButton = event.target.closest("[data-social-send-friend]");
  if (sendButton) {
    shareCogniInvite();
    return;
  }

  const responseButton = event.target.closest("[data-social-friend-response]");
  if (responseButton) {
    handleSocialFriendResponse(responseButton);
  }
}

function handleFriendsPageKeydown(event) {
  const input = event.target.closest("[data-social-friend-input]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  handleSocialFriendRequestSubmit(input);
}

function handleSocialLeaderboardClick(event) {
  const timeframeButton = event.target.closest("[data-leaderboard-timeframe]");
  if (timeframeButton) {
    selectedLeaderboardTimeframe = timeframeButton.dataset.leaderboardTimeframe;
    renderSocialLeaderboard();
    return;
  }

  const sendButton = event.target.closest("[data-social-send-friend]");
  if (sendButton) {
    handleSocialFriendRequestSubmit(sendButton);
    return;
  }

  const responseButton = event.target.closest("[data-social-friend-response]");
  if (responseButton) {
    handleSocialFriendResponse(responseButton);
  }
}

async function openFriendDialog() {
  if (!elements.friendDialog) return;
  elements.friendStatus.textContent = "";
  elements.friendHandleInput.value = "";
  if (typeof elements.friendDialog.showModal === "function" && !elements.friendDialog.open) {
    elements.friendDialog.showModal();
  }
  await refreshFriendRequests();
  elements.friendHandleInput.focus();
}

function closeFriendDialog() {
  elements.friendDialog?.close();
}

async function handleFriendRequestSubmit(event) {
  event.preventDefault();
  const userProfile = loadUserProfile();
  const fromHandle = normalizeProfileHandle(userProfile.handle);
  const friendHandleValue = String(elements.friendHandleInput.value ?? "").trim();
  if (!friendHandleValue) {
    setFriendStatus("Enter a valid @ username.", "error");
    return;
  }
  const toHandle = normalizeProfileHandle(friendHandleValue);
  if (fromHandle === toHandle) {
    setFriendStatus("You cannot add yourself.", "error");
    return;
  }
  setFriendStatus("Sending request...", "loading");
  try {
    await upsertSocialProfile(userProfile);
    const result = await socialApiRequest("/api/friend-requests", {
      method: "POST",
      body: {
        fromHandle,
        toHandle
      }
    });
    elements.friendHandleInput.value = "";
    if (!result.duplicate) {
      awardXpEvent("friend_invite", 50, "Friend invite", { sourceId: `friend-invite-${toHandle}`, handle: toHandle });
      if (elements.appShell.classList.contains("profile-open")) renderProfile();
      if (elements.socialLeaderboardDialog?.open) renderSocialLeaderboard();
    }
    setFriendStatus(result.duplicate ? `Request already exists for ${toHandle}.` : `Friend request sent to ${toHandle}.`, "success");
    await refreshFriendRequests();
    await refreshHomeSocialBadge();
    if (elements.socialLeaderboardDialog?.open) await refreshSocialHubFriends();
  } catch (error) {
    setFriendStatus(friendApiErrorMessage(error), "error");
  }
}

async function handleFriendResponseClick(event) {
  const button = event.target.closest("[data-friend-response]");
  if (!button) return;
  setFriendStatus("Updating request...", "loading");
  try {
    await socialApiRequest("/api/friend-requests/respond", {
      method: "POST",
      body: {
        handle: normalizeProfileHandle(loadUserProfile().handle),
        requestId: button.dataset.friendRequestId,
        action: button.dataset.friendResponse
      }
    });
    setFriendStatus(button.dataset.friendResponse === "accept" ? "Friend request accepted." : "Friend request declined.", "success");
    await refreshFriendRequests();
    await refreshHomeSocialBadge();
    if (elements.socialLeaderboardDialog?.open) await refreshSocialHubFriends();
  } catch (error) {
    setFriendStatus(friendApiErrorMessage(error), "error");
  }
}

async function refreshFriendRequests() {
  if (!elements.friendFriendsList || !elements.friendIncomingList || !elements.friendOutgoingList) return;
  const handle = normalizeProfileHandle(loadUserProfile().handle);
  elements.friendFriendsList.innerHTML = `<p class="friend-empty">Loading...</p>`;
  elements.friendIncomingList.innerHTML = `<p class="friend-empty">Loading...</p>`;
  elements.friendOutgoingList.innerHTML = `<p class="friend-empty">Loading...</p>`;
  try {
    await upsertSocialProfile(loadUserProfile());
    const data = await socialApiRequest(`/api/friend-requests?handle=${encodeURIComponent(handle)}`);
    renderFriendLists(data);
  } catch (error) {
    elements.friendFriendsList.innerHTML = `<p class="friend-empty">Could not reach the social server.</p>`;
    elements.friendIncomingList.innerHTML = `<p class="friend-empty">Could not reach the social server.</p>`;
    elements.friendOutgoingList.innerHTML = "";
    setFriendStatus(friendApiErrorMessage(error), "error");
  }
}

function renderFriendLists(data) {
  const handle = normalizeProfileHandle(loadUserProfile().handle);
  elements.friendFriendsList.innerHTML = (data.friends ?? []).length
    ? data.friends.map((request) => {
      const friendHandle = request.fromHandle === handle ? request.toHandle : request.fromHandle;
      return `
        <article class="friend-list-item">
          <strong>${escapeHtml(friendHandle)}</strong>
          <span>Friend</span>
        </article>
      `;
    }).join("")
    : `<p class="friend-empty">No friends yet.</p>`;

  elements.friendIncomingList.innerHTML = (data.incoming ?? []).length
    ? data.incoming.map((request) => `
      <article class="friend-list-item">
        <strong>${escapeHtml(request.fromHandle)}</strong>
        <div>
          <button type="button" data-friend-response="accept" data-friend-request-id="${escapeHtml(request.id)}">Accept</button>
          <button type="button" data-friend-response="decline" data-friend-request-id="${escapeHtml(request.id)}">Decline</button>
        </div>
      </article>
    `).join("")
    : `<p class="friend-empty">No incoming requests.</p>`;

  elements.friendOutgoingList.innerHTML = (data.outgoing ?? []).length
    ? data.outgoing.map((request) => `
      <article class="friend-list-item">
        <strong>${escapeHtml(request.toHandle)}</strong>
        <span>Pending</span>
      </article>
    `).join("")
    : `<p class="friend-empty">No sent requests.</p>`;
}

async function upsertSocialProfile(userProfile) {
  return socialApiRequest("/api/social/profile", {
    method: "POST",
    body: {
      handle: normalizeProfileHandle(userProfile.handle),
      avatarInitial: normalizeProfileAvatar(userProfile.avatarInitial, userProfile.handle),
      avatarImage: normalizeProfileAvatarImage(userProfile.avatarImage)
    }
  });
}

function syncSocialProfileQuietly() {
  upsertSocialProfile(loadUserProfile()).catch(() => {});
}

async function socialApiRequest(path, options = {}) {
  const response = await fetch(`${socialApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Social server request failed.");
  return data;
}

function socialApiBaseUrl() {
  const configured = localStorage.getItem(socialApiBaseStorageKey)?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return location.protocol === "capacitor:" ? "http://127.0.0.1:4283" : "";
}

function setFriendStatus(message, state = "") {
  if (!elements.friendStatus) return;
  elements.friendStatus.textContent = message;
  elements.friendStatus.dataset.state = state;
}

function setSocialFriendStatus(message, state = "") {
  socialFriendStatus = message;
  socialFriendStatusState = state;
  [
    elements.socialLeaderboardContent?.querySelector("[data-social-friend-status]"),
    elements.friendsPage?.querySelector("[data-social-friend-status]")
  ].filter(Boolean).forEach((status) => {
    status.textContent = message;
    status.dataset.state = state;
  });
}

function setHomeSocialBadge(count) {
  socialIncomingRequestCount = Math.max(0, Number(count) || 0);
  const badge = elements.homePage?.querySelector("[data-social-request-badge]");
  if (badge) {
    badge.textContent = socialIncomingRequestCount > 9 ? "9+" : String(socialIncomingRequestCount);
    badge.hidden = socialIncomingRequestCount <= 0;
  }
  updateTopNotificationBadge(socialIncomingRequestCount);
}

function updateTopNotificationBadge(count) {
  if (!elements.topNotificationCount) return;
  if (elements.topNotificationButton?.dataset.topAction === "settings") {
    elements.topNotificationCount.hidden = true;
    return;
  }
  const normalizedCount = Math.max(0, Number(count) || 0);
  elements.topNotificationCount.textContent = normalizedCount > 9 ? "9+" : String(normalizedCount);
  elements.topNotificationCount.hidden = normalizedCount <= 0;
}

async function refreshHomeSocialBadge() {
  const handle = normalizeProfileHandle(loadUserProfile().handle);
  try {
    await upsertSocialProfile(loadUserProfile());
    const data = await socialApiRequest(`/api/friend-requests?handle=${encodeURIComponent(handle)}`);
    setHomeSocialBadge((data.incoming ?? []).length);
  } catch {
    setHomeSocialBadge(0);
  }
}

async function shareCogniInvite() {
  const handle = normalizeProfileHandle(loadUserProfile().handle);
  const inviteUrl = buildCogniInviteUrl(handle);
  const shareData = {
    title: "Join me on Mindcare",
    text: `Add me on Mindcare: ${handle}`,
    url: inviteUrl
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      socialFriendStatus = "Invite ready to send.";
      socialFriendStatusState = "success";
      renderFriendsPage();
      return;
    }

    if (!navigator.clipboard?.writeText) throw new Error("Sharing is unavailable.");
    await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
    socialFriendStatus = "Invite link copied.";
    socialFriendStatusState = "success";
    renderFriendsPage();
  } catch (error) {
    if (error?.name === "AbortError") return;
    socialFriendStatus = "Could not open sharing. Try again from your phone.";
    socialFriendStatusState = "error";
    renderFriendsPage();
  }
}

function buildCogniInviteUrl(handle) {
  const cleanHandle = normalizeProfileHandle(handle).replace(/^@/, "");
  return `https://mindcare.app/invite?from=${encodeURIComponent(cleanHandle)}`;
}

async function handleSocialFriendRequestSubmit(sourceButton = null) {
  const userProfile = loadUserProfile();
  const fromHandle = normalizeProfileHandle(userProfile.handle);
  const input = currentSocialFriendInput(sourceButton);
  const friendHandleValue = String(input?.value ?? "").trim();
  if (!friendHandleValue) {
    setSocialFriendStatus("Enter a valid @ username.", "error");
    return;
  }
  const toHandle = normalizeProfileHandle(friendHandleValue);
  if (fromHandle === toHandle) {
    setSocialFriendStatus("You cannot add yourself.", "error");
    return;
  }

  setSocialFriendStatus("Sending request...", "loading");
  try {
    await upsertSocialProfile(userProfile);
    const result = await socialApiRequest("/api/friend-requests", {
      method: "POST",
      body: { fromHandle, toHandle }
    });
    if (!result.duplicate) {
      awardXpEvent("friend_invite", 50, "Friend invite", { sourceId: `friend-invite-${toHandle}`, handle: toHandle });
      if (elements.appShell.classList.contains("profile-open")) renderProfile();
    }
    if (input) input.value = "";
    socialFriendStatus = result.duplicate ? `Request already exists for ${toHandle}.` : `Friend request sent to ${toHandle}.`;
    socialFriendStatusState = "success";
    await refreshSocialHubFriends();
  } catch (error) {
    setSocialFriendStatus(friendApiErrorMessage(error), "error");
  }
}

function currentSocialFriendInput(sourceButton = null) {
  const scopedRoot = sourceButton?.closest?.(".friends-page, #social-leaderboard-content");
  return scopedRoot?.querySelector("[data-social-friend-input]")
    ?? elements.friendsPage?.querySelector("[data-social-friend-input]")
    ?? elements.socialLeaderboardContent?.querySelector("[data-social-friend-input]");
}

async function handleSocialFriendResponse(button) {
  setSocialFriendStatus("Updating request...", "loading");
  try {
    await socialApiRequest("/api/friend-requests/respond", {
      method: "POST",
      body: {
        handle: normalizeProfileHandle(loadUserProfile().handle),
        requestId: button.dataset.friendRequestId,
        action: button.dataset.socialFriendResponse
      }
    });
    socialFriendStatus = button.dataset.socialFriendResponse === "accept"
      ? "Friend request accepted."
      : "Friend request declined.";
    socialFriendStatusState = "success";
    await refreshSocialHubFriends();
  } catch (error) {
    setSocialFriendStatus(friendApiErrorMessage(error), "error");
  }
}

async function refreshSocialHubFriends() {
  const handle = normalizeProfileHandle(loadUserProfile().handle);
  try {
    await upsertSocialProfile(loadUserProfile());
    socialFriendData = await socialApiRequest(`/api/friend-requests?handle=${encodeURIComponent(handle)}`);
    setHomeSocialBadge((socialFriendData.incoming ?? []).length);
  } catch (error) {
    socialFriendData = { friends: [], incoming: [], outgoing: [] };
    socialFriendStatus = friendApiErrorMessage(error);
    socialFriendStatusState = "error";
  }
  renderSocialLeaderboard();
  if (elements.appShell.classList.contains("friends-open")) renderFriendsPage();
}

function friendApiErrorMessage(error) {
  const detail = error?.message || "Friend request failed.";
  return `${detail} Online friend requests need the Mindcare social server. Invite links still work.`;
}

function calculateDailyTrainingStreak(progress, exerciseIds, targetMinutes = 5) {
  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 365; index += 1) {
    const dateKey = localDateKey(cursor);
    if (trainingMinutesForDate(progress, exerciseIds, dateKey) < targetMinutes) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function consecutiveMissedTrainingDays(progress, exerciseIds, targetMinutes = 5) {
  let missed = 0;
  const cursor = new Date();
  for (let index = 0; index < 30; index += 1) {
    const dateKey = localDateKey(cursor);
    if (trainingMinutesForDate(progress, exerciseIds, dateKey) >= targetMinutes) break;
    missed += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return missed;
}

function homeStreakDays(progress, exerciseIds, targetMinutes = 5) {
  const labels = ["Su", "M", "Tu", "W", "Th", "F", "S"];
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const dateKey = localDateKey(date);
    return {
      label: labels[date.getDay()],
      today: index === 0,
      complete: trainingMinutesForDate(progress, exerciseIds, dateKey) >= targetMinutes
    };
  });
}

function trainingMinutesForDate(progress, exerciseIds, dateKey) {
  const day = progress.days?.[dateKey] ?? {};
  const durationMs = exerciseIds.reduce((sum, exerciseId) => sum + Number(day[exerciseId]?.durationMs ?? 0), 0);
  return Math.floor(durationMs / 60000);
}

function showAssessments() {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  elements.appShell.classList.remove("home-open", "friends-open", "friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "stats-open", "profile-open", "placeholder-open", "leaderboard-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
  elements.appShell.classList.add("assessments-open");
  setActiveTab("assessments");
  elements.pageTitle.textContent = "Tests";
  elements.pageLede.textContent = "Choose a test.";
  showAssessmentList();
}

function showAssessmentList() {
  elements.adhdAssessmentIntro.hidden = false;
  elements.adhdAssessmentDetail.hidden = true;
  elements.adhdAssessmentRun.hidden = true;
  elements.adhdAssessmentResult.hidden = true;
  elements.adhdAssessmentHistory.hidden = true;
  // An in-flight adaptive test always resumes rather than being lost.
  if (catActive?.currentItemId) {
    showCatSection("run");
    renderCatQuestion();
    return;
  }
  showCatSection("intro");
}

// ---------------------------------------------------------------------------
// Adaptive cognitive assessment (CAT over the 2PL IRT engine)
// ---------------------------------------------------------------------------

const catStateStorageKey = "mindcare.catActiveSession.v1";
const catSessionsStorageKey = "mindcare.catSessions.v1";
const catItemsById = new Map(catItemBank.map((item) => [item.id, item]));
let catActive = loadCatActive();
let catTimerHandle = null;
let catItemStartedAt = 0;

function loadCatActive() {
  try {
    const saved = JSON.parse(localStorage.getItem(catStateStorageKey));
    if (!saved || !Array.isArray(saved.responses)) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveCatActive() {
  try {
    if (catActive) localStorage.setItem(catStateStorageKey, JSON.stringify(catActive));
    else localStorage.removeItem(catStateStorageKey);
  } catch {
    // Refresh-resume is best effort.
  }
}

function loadCatSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(catSessionsStorageKey));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCatSessions(sessions) {
  try {
    localStorage.setItem(catSessionsStorageKey, JSON.stringify(sessions));
  } catch {
    // History is best effort.
  }
}

const assessmentIntroIds = ["cat-intro", "ocd-intro", "focus-intro", "memory-intro", "adhd-assessment-intro"];
const assessmentSectionIds = [
  "iq-welcome", "iq-email", "iq-slides", "iq-calculating",
  "cat-detail", "cat-run", "cat-result", "cat-history",
  "ocd-detail", "ocd-run", "ocd-result",
  "focus-detail", "focus-run", "focus-result",
  "memory-detail", "memory-run", "memory-result"
];

// One active screen at a time: null shows the list of test cards.
function showAssessmentSection(sectionId) {
  for (const id of assessmentIntroIds) {
    const node = document.querySelector(`#${id}`);
    if (node) node.hidden = sectionId !== null;
  }
  for (const id of assessmentSectionIds) {
    const node = document.querySelector(`#${id}`);
    if (node) node.hidden = id !== sectionId;
  }
  if (sectionId !== "cat-run") stopCatTimer();
  if (sectionId !== "iq-calculating") window.clearInterval(iqCalcTimer);
  if (sectionId !== "focus-run") stopFocusTimer();
  if (sectionId !== "memory-run") stopMemoryTimers();
}

function showCatSection(section) {
  showAssessmentSection(section === "intro" ? null : `cat-${section}`);
}

function catResponsesWithItems() {
  return catActive.responses
    .map((response) => ({ item: catItemsById.get(response.itemId), correct: response.correct }))
    .filter((response) => response.item);
}

function startCatTest() {
  catActive = { startedAt: Date.now(), responses: [], currentItemId: null };
  pickNextCatItem();
  showCatSection("run");
  renderCatQuestion();
}

function pickNextCatItem() {
  const { theta } = catActive.responses.length ? eapEstimate(catResponsesWithItems()) : { theta: 0 };
  const administered = new Set(catActive.responses.map((response) => response.itemId));
  const available = catItemBank.filter((item) => !administered.has(item.id));
  const item = selectNextItem(theta, available);
  catActive.currentItemId = item?.id ?? null;
  saveCatActive();
}

function renderCatQuestion() {
  const item = catItemsById.get(catActive?.currentItemId);
  if (!item) {
    finishCatTest();
    return;
  }
  elements.catProgress.textContent = `Question ${catActive.responses.length + 1}`;
  elements.catDomainLabel.textContent = CAT_DOMAIN_LABELS[item.domain];
  elements.catPrompt.textContent = item.prompt;
  elements.catStage.innerHTML = item.matrix ? catMatrixSvg(item.matrix) : "";
  if (item.matrix) {
    elements.catOptions.className = "cat-options cat-options-matrix";
    elements.catOptions.innerHTML = item.matrix.optionCells.map((cell, index) => `
      <button type="button" data-cat-answer="${index}" aria-label="Option ${index + 1}">${catCellSvg(cell)}</button>
    `).join("");
  } else {
    elements.catOptions.className = "cat-options";
    elements.catOptions.innerHTML = item.options.map((option, index) => `
      <button type="button" data-cat-answer="${index}">${escapeHtml(option)}</button>
    `).join("");
  }
  startCatTimer(item);
}

function startCatTimer(item) {
  stopCatTimer();
  const limit = CAT_DOMAIN_TIME_LIMITS_MS[item.domain];
  catItemStartedAt = Date.now();
  elements.catTimerBar.style.width = "100%";
  catTimerHandle = window.setInterval(() => {
    const remaining = limit - (Date.now() - catItemStartedAt);
    if (remaining <= 0) {
      answerCatQuestion(null);
      return;
    }
    elements.catTimerBar.style.width = `${Math.max(0, (remaining / limit) * 100)}%`;
  }, 250);
}

function stopCatTimer() {
  if (catTimerHandle) window.clearInterval(catTimerHandle);
  catTimerHandle = null;
}

function answerCatQuestion(answerIndex) {
  stopCatTimer();
  const item = catItemsById.get(catActive?.currentItemId);
  if (!item) return;
  catActive.responses.push({
    itemId: item.id,
    answerIndex,
    correct: answerIndex === item.answerIndex,
    ms: Date.now() - catItemStartedAt,
    at: new Date().toISOString()
  });
  const estimate = eapEstimate(catResponsesWithItems());
  const elapsedMs = Date.now() - catActive.startedAt;
  if (shouldStop({ itemsAnswered: catActive.responses.length, se: estimate.se, elapsedMs })) {
    finishCatTest(estimate);
    return;
  }
  pickNextCatItem();
  if (!catActive.currentItemId) {
    finishCatTest(estimate);
    return;
  }
  renderCatQuestion();
}

function catDomainSubscores() {
  const scores = {};
  for (const domain of ["fluid", "verbal", "quant"]) {
    const responses = catResponsesWithItems().filter((response) => response.item.domain === domain);
    if (!responses.length) {
      scores[domain] = null;
      continue;
    }
    const estimate = eapEstimate(responses);
    scores[domain] = { score: thetaToScore(estimate.theta), count: responses.length };
  }
  return scores;
}

function finishCatTest(estimate = eapEstimate(catResponsesWithItems())) {
  stopCatTimer();
  const score = thetaToScore(estimate.theta);
  const interval = scoreConfidenceInterval(estimate.theta, estimate.se);
  const sessionRecord = {
    id: `cat-${Date.now()}`,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - catActive.startedAt,
    theta: Math.round(estimate.theta * 1000) / 1000,
    se: Math.round(estimate.se * 1000) / 1000,
    score,
    ci: interval,
    domains: catDomainSubscores(),
    responses: catActive.responses
  };
  const sessions = loadCatSessions();
  sessions.unshift(sessionRecord);
  saveCatSessions(sessions.slice(0, 50));
  catActive = null;
  saveCatActive();
  // Web funnel: the "calculating" screen builds anticipation and holds the
  // phone + Discord asks. The mobile app goes straight to the score.
  if (mindcareUiMode === "pro") {
    catPendingResult = sessionRecord;
    try {
      localStorage.setItem(iqRevealPendingKey, "1");
    } catch {
      // Best effort; only affects resume after a refresh.
    }
    startIqCalculating();
    return;
  }
  renderCatResult(sessionRecord);
  showCatSection("result");
}

function abandonCatTest() {
  stopCatTimer();
  catActive = null;
  saveCatActive();
  if (iqStandalone) {
    showAssessmentSection("iq-welcome");
    return;
  }
  showCatSection("intro");
  elements.adhdAssessmentIntro.hidden = false;
}

function renderCatResult(sessionRecord) {
  elements.catScore.textContent = String(sessionRecord.score);
  elements.catScoreCi.textContent = `95% CI ${sessionRecord.ci.low}–${sessionRecord.ci.high}`;
  elements.catCurve.innerHTML = catBellCurveSvg(sessionRecord.score);
  const percentile = scorePercentile(sessionRecord.score);
  elements.catResultSummary.textContent = `Higher than about ${percentile}% of a typical population, from ${sessionRecord.responses.length} questions in ${Math.max(1, Math.round(sessionRecord.durationMs / 60000))} min (SE ${sessionRecord.se}).`;
  const domainNodes = {
    fluid: elements.catDomainFluid,
    verbal: elements.catDomainVerbal,
    quant: elements.catDomainQuant
  };
  for (const [domain, node] of Object.entries(domainNodes)) {
    const entry = sessionRecord.domains?.[domain];
    node.textContent = entry ? `${entry.score} · ${entry.count} items` : "Not sampled";
  }
}

function catBellCurveSvg(score) {
  const width = 320;
  const height = 110;
  const minScore = 50;
  const maxScore = 150;
  const points = [];
  for (let index = 0; index <= 80; index += 1) {
    const value = minScore + ((maxScore - minScore) * index) / 80;
    const z = (value - 100) / 15;
    const y = Math.exp(-0.5 * z * z);
    const px = (index / 80) * (width - 16) + 8;
    const py = height - 14 - y * (height - 30);
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  const clamped = Math.max(minScore, Math.min(maxScore, score));
  const markerX = ((clamped - minScore) / (maxScore - minScore)) * (width - 16) + 8;
  return `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline class="cat-curve-line" points="${points.join(" ")}"></polyline>
      <line class="cat-curve-marker" x1="${markerX.toFixed(1)}" y1="12" x2="${markerX.toFixed(1)}" y2="${height - 14}"></line>
      <circle class="cat-curve-dot" cx="${markerX.toFixed(1)}" cy="12" r="4"></circle>
      <text class="cat-curve-label" x="8" y="${height - 2}">50</text>
      <text class="cat-curve-label" x="${width / 2}" y="${height - 2}" text-anchor="middle">100</text>
      <text class="cat-curve-label" x="${width - 8}" y="${height - 2}" text-anchor="end">150</text>
    </svg>
  `;
}

function renderCatHistory() {
  const sessions = loadCatSessions();
  if (!sessions.length) {
    elements.catHistoryList.innerHTML = "<article><p>No completed assessments yet.</p></article>";
    return;
  }
  elements.catHistoryList.innerHTML = sessions.map((sessionRecord) => `
    <article>
      <strong>${sessionRecord.score}</strong>
      <span>${new Date(sessionRecord.completedAt).toLocaleDateString()} · ${sessionRecord.responses.length} questions · CI ${sessionRecord.ci.low}–${sessionRecord.ci.high}</span>
    </article>
  `).join("");
}

const catShapePaths = {
  triangle: (size) => `M 0 ${-size / 2} L ${size * 0.42} ${size * 0.36} L ${-size * 0.42} ${size * 0.36} Z`,
  diamond: (size) => `M 0 ${-size / 2} L ${size / 2} 0 L 0 ${size / 2} L ${-size / 2} 0 Z`,
  cross: (size) => {
    const arm = size / 6;
    const half = size / 2;
    return `M ${-arm} ${-half} H ${arm} V ${-arm} H ${half} V ${arm} H ${arm} V ${half} H ${-arm} V ${arm} H ${-half} V ${-arm} H ${-arm} Z`;
  }
};

function catGlyphSvg(glyph, cellSize) {
  const size = (glyph.sz ?? 0.55) * cellSize;
  const paint = glyph.f
    ? 'fill="var(--text)"'
    : 'fill="none" stroke="var(--text)" stroke-width="2"';
  let shapeMarkup;
  if (glyph.s === "circle") shapeMarkup = `<circle r="${(size / 2).toFixed(1)}" ${paint}></circle>`;
  else if (glyph.s === "square") shapeMarkup = `<rect x="${(-size / 2).toFixed(1)}" y="${(-size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" ${paint}></rect>`;
  else if (glyph.s === "bar") shapeMarkup = `<rect x="${(-size / 2).toFixed(1)}" y="${(-size / 8).toFixed(1)}" width="${size.toFixed(1)}" height="${(size / 4).toFixed(1)}" rx="2" ${paint}></rect>`;
  else shapeMarkup = `<path d="${catShapePaths[glyph.s]?.(size) ?? catShapePaths.diamond(size)}" ${paint}></path>`;
  const x = ((glyph.x ?? 0.5) * cellSize).toFixed(1);
  const y = ((glyph.y ?? 0.5) * cellSize).toFixed(1);
  return `<g transform="translate(${x} ${y}) rotate(${glyph.r ?? 0})">${shapeMarkup}</g>`;
}

function catCellSvg(cell, cellSize = 64) {
  const glyphs = (cell ?? []).map((glyph) => catGlyphSvg(glyph, cellSize)).join("");
  return `<svg class="cat-cell" viewBox="0 0 ${cellSize} ${cellSize}" aria-hidden="true">${glyphs}</svg>`;
}

function catMatrixSvg(matrix, cellSize = 64, gap = 8) {
  const total = cellSize * 3 + gap * 2;
  const cells = matrix.cells.map((cell, index) => {
    const cx = (index % 3) * (cellSize + gap);
    const cy = Math.floor(index / 3) * (cellSize + gap);
    const frame = `<rect x="0" y="0" width="${cellSize}" height="${cellSize}" rx="10" class="cat-matrix-frame"></rect>`;
    const content = cell === null
      ? `<text x="${cellSize / 2}" y="${cellSize / 2 + 8}" text-anchor="middle" class="cat-matrix-question">?</text>`
      : cell.map((glyph) => catGlyphSvg(glyph, cellSize)).join("");
    return `<g transform="translate(${cx} ${cy})">${frame}${content}</g>`;
  }).join("");
  return `<svg class="cat-matrix" viewBox="0 0 ${total} ${total}" aria-hidden="true">${cells}</svg>`;
}

// ---------------------------------------------------------------------------
// OCD screening (self-report questionnaire)
// ---------------------------------------------------------------------------

let ocdAssessment = { index: 0, answers: [] };

function startOcdTest() {
  ocdAssessment = { index: 0, answers: Array(OCD_QUESTIONS.length).fill(undefined) };
  showAssessmentSection("ocd-run");
  renderOcdQuestion();
}

function renderOcdQuestion() {
  const [subscale, text] = OCD_QUESTIONS[ocdAssessment.index];
  const total = OCD_QUESTIONS.length;
  document.querySelector("#ocd-progress").textContent = `${ocdAssessment.index + 1} of ${total}`;
  document.querySelector("#ocd-progress-bar").style.width = `${((ocdAssessment.index + 1) / total) * 100}%`;
  document.querySelector("#ocd-section-label").textContent = OCD_SUBSCALE_LABELS[subscale] ?? "Daily impact";
  document.querySelector("#ocd-question-text").textContent = text;
  document.querySelector("#ocd-back-question").textContent = ocdAssessment.index === 0 ? "Cancel" : "Back";
  const container = document.querySelector("#ocd-rating-buttons");
  container.replaceChildren();
  OCD_RATING_LABELS.forEach((label, value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.ocdRating = String(value);
    button.className = "adhd-rating-button";
    button.classList.toggle("selected", ocdAssessment.answers[ocdAssessment.index] === value);
    button.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    container.append(button);
  });
}

function answerOcdQuestion(value) {
  ocdAssessment.answers[ocdAssessment.index] = value;
  if (ocdAssessment.index === OCD_QUESTIONS.length - 1) {
    showOcdResult();
    return;
  }
  ocdAssessment.index += 1;
  renderOcdQuestion();
}

function showOcdResult() {
  const result = scoreOcdScreening({ answers: ocdAssessment.answers.map((value) => value ?? 0) });
  document.querySelector("#ocd-simple-score").textContent = String(result.simpleScore);
  document.querySelector("#ocd-simple-conclusion").textContent = result.simpleConclusion;
  document.querySelector("#ocd-subscale-grid").innerHTML = Object.entries(OCD_SUBSCALE_LABELS).map(([key, label]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${result.subscales[key]} / 12</dd></div>
  `).join("");
  showAssessmentSection("ocd-result");
}

// ---------------------------------------------------------------------------
// Focus test (sustained attention / go-no-go over digits)
// ---------------------------------------------------------------------------

let focusRun = null;
let focusTimerHandle = null;

function startFocusTest() {
  const config = createSustainedAttentionAssessmentConfig({ trialCount: 45, symbolMs: 1250, mistakePauseMs: 0 });
  focusRun = { config, trials: generateSustainedAttentionTrials(config), index: -1, results: [], responded: false, reactionMs: undefined };
  showAssessmentSection("focus-run");
  advanceFocusTrial();
}

function advanceFocusTrial() {
  stopFocusTimer();
  if (!focusRun) return;
  if (focusRun.index >= 0) {
    const trial = focusRun.trials[focusRun.index];
    focusRun.results.push({ ...trial, responded: focusRun.responded, reactionTimeMs: focusRun.reactionMs });
  }
  focusRun.index += 1;
  if (focusRun.index >= focusRun.trials.length) {
    finishFocusTest();
    return;
  }
  const trial = focusRun.trials[focusRun.index];
  focusRun.responded = false;
  focusRun.reactionMs = undefined;
  focusRun.shownAt = Date.now();
  document.querySelector("#focus-progress").textContent = `${focusRun.index + 1} / ${focusRun.trials.length}`;
  const stimulus = document.querySelector("#focus-stimulus");
  stimulus.textContent = trial.stimulus;
  stimulus.classList.toggle("focus-nogo-seen", false);
  focusTimerHandle = window.setTimeout(advanceFocusTrial, focusRun.config.symbolMs);
}

function stopFocusTimer() {
  if (focusTimerHandle) window.clearTimeout(focusTimerHandle);
  focusTimerHandle = null;
}

function handleFocusTap() {
  if (!focusRun || focusRun.index < 0 || focusRun.responded) return;
  focusRun.responded = true;
  focusRun.reactionMs = Date.now() - focusRun.shownAt;
  const stimulus = document.querySelector("#focus-stimulus");
  stimulus.classList.add("focus-tapped");
  window.setTimeout(() => stimulus.classList.remove("focus-tapped"), 140);
}

function finishFocusTest() {
  stopFocusTimer();
  if (!focusRun) return;
  const { config, results } = focusRun;
  focusRun = null;
  const score = scoreSustainedAttentionAssessment(config, results);
  const misses = results.filter((trial) => trial.isTarget && !trial.responded).length;
  const falseAlarms = results.filter((trial) => !trial.isTarget && trial.responded).length;
  document.querySelector("#focus-score").textContent = String(score.score ?? 0);
  document.querySelector("#focus-score-copy").textContent = "Sustained attention, out of 100";
  document.querySelector("#focus-accuracy").textContent = `${Math.round((score.components?.accuracy ?? 0) * 100)}%`;
  document.querySelector("#focus-misses").textContent = String(misses);
  document.querySelector("#focus-false-alarms").textContent = String(falseAlarms);
  const medianRt = score.components?.medianReactionTimeMs ?? 0;
  document.querySelector("#focus-median-rt").textContent = medianRt ? `${medianRt} ms` : "–";
  showAssessmentSection("focus-result");
}

// ---------------------------------------------------------------------------
// Memory test (spatial span on a 3x3 grid)
// ---------------------------------------------------------------------------

let memoryRun = null;
let memoryTimeouts = [];

function stopMemoryTimers() {
  for (const handle of memoryTimeouts) window.clearTimeout(handle);
  memoryTimeouts = [];
}

function memoryDelay(callback, ms) {
  memoryTimeouts.push(window.setTimeout(callback, ms));
}

function startMemoryTest() {
  const config = createSpatialSpanAssessmentConfig();
  memoryRun = {
    config,
    trials: generateSpatialSpanTrials(config),
    trialIndex: 0,
    results: [],
    consecutiveFailures: 0,
    phase: "idle",
    input: []
  };
  const grid = document.querySelector("#memory-grid");
  grid.innerHTML = Array.from({ length: config.gridSize * config.gridSize }, (_, index) => `
    <button type="button" class="memory-cell" data-memory-cell="${index}" aria-label="Tile ${index + 1}"></button>
  `).join("");
  showAssessmentSection("memory-run");
  playMemoryTrial();
}

function currentMemoryTrial() {
  return memoryRun?.trials[memoryRun.trialIndex] ?? null;
}

function playMemoryTrial() {
  stopMemoryTimers();
  const trial = currentMemoryTrial();
  if (!trial || memoryRun.consecutiveFailures >= memoryRun.config.consecutiveFailureLimit) {
    finishMemoryTest();
    return;
  }
  memoryRun.phase = "playback";
  memoryRun.input = [];
  document.querySelector("#memory-progress").textContent = `Span ${trial.span}`;
  document.querySelector("#memory-status").textContent = "Watch the sequence…";
  const { displayMs, gapMs } = memoryRun.config;
  trial.sequence.forEach((cellIndex, step) => {
    const startAt = 600 + step * (displayMs + gapMs);
    memoryDelay(() => litMemoryCell(cellIndex, true), startAt);
    memoryDelay(() => litMemoryCell(cellIndex, false), startAt + displayMs);
  });
  const playbackEnds = 600 + trial.sequence.length * (displayMs + gapMs) + 100;
  memoryDelay(() => {
    memoryRun.phase = "input";
    memoryRun.inputStartedAt = Date.now();
    document.querySelector("#memory-status").textContent = "Your turn — repeat the sequence.";
  }, playbackEnds);
}

function litMemoryCell(cellIndex, lit) {
  document.querySelector(`[data-memory-cell="${cellIndex}"]`)?.classList.toggle("lit", lit);
}

function handleMemoryCellTap(cellIndex) {
  if (!memoryRun || memoryRun.phase !== "input") return;
  const trial = currentMemoryTrial();
  litMemoryCell(cellIndex, true);
  memoryDelay(() => litMemoryCell(cellIndex, false), 180);
  memoryRun.input.push(cellIndex);
  const position = memoryRun.input.length - 1;
  const failed = trial.sequence[position] !== cellIndex;
  const complete = memoryRun.input.length === trial.sequence.length;
  if (!failed && !complete) return;
  memoryRun.phase = "between";
  const correct = !failed;
  memoryRun.results.push({
    ...trial,
    correct,
    reactionTimeMs: Date.now() - memoryRun.inputStartedAt
  });
  memoryRun.consecutiveFailures = correct ? 0 : memoryRun.consecutiveFailures + 1;
  document.querySelector("#memory-status").textContent = correct ? "Correct!" : "Not quite.";
  memoryRun.trialIndex += 1;
  memoryDelay(playMemoryTrial, 900);
}

function finishMemoryTest() {
  stopMemoryTimers();
  if (!memoryRun) return;
  const { config, results } = memoryRun;
  memoryRun = null;
  const score = scoreSpatialSpanAssessment(config, results);
  const longestAttempted = results.reduce((max, trial) => Math.max(max, trial.span), 0);
  document.querySelector("#memory-span").textContent = String(score.highestCorrectSpan ?? 0);
  document.querySelector("#memory-span-copy").textContent = "Longest sequence repeated correctly";
  document.querySelector("#memory-correct").textContent = `${score.correctTrials} of ${results.length}`;
  document.querySelector("#memory-longest").textContent = longestAttempted ? `Span ${longestAttempted}` : "–";
  showAssessmentSection("memory-result");
}

function showAdhdDetail() {
  showAssessmentSection(null);
  for (const id of assessmentIntroIds) {
    const node = document.querySelector(`#${id}`);
    if (node) node.hidden = true;
  }
  elements.adhdAssessmentIntro.hidden = true;
  elements.adhdAssessmentDetail.hidden = false;
  elements.adhdAssessmentRun.hidden = true;
  elements.adhdAssessmentResult.hidden = true;
  elements.adhdAssessmentHistory.hidden = true;
}

function showAdhdHistory() {
  elements.adhdAssessmentIntro.hidden = true;
  elements.adhdAssessmentDetail.hidden = true;
  elements.adhdAssessmentRun.hidden = true;
  elements.adhdAssessmentResult.hidden = true;
  elements.adhdAssessmentHistory.hidden = false;
  renderAdhdHistory();
}

function startAdhdAssessment() {
  adhdAssessment.index = 0;
  adhdAssessment.answers = [];
  adhdAssessment.context = [];
  elements.adhdAssessmentIntro.hidden = true;
  elements.adhdAssessmentDetail.hidden = true;
  elements.adhdAssessmentResult.hidden = true;
  elements.adhdAssessmentHistory.hidden = true;
  elements.adhdAssessmentRun.hidden = false;
  renderAdhdQuestion();
}

function goBackAdhdQuestion() {
  if (adhdAssessment.index === 0) {
    elements.adhdAssessmentRun.hidden = true;
    elements.adhdAssessmentDetail.hidden = false;
    return;
  }
  adhdAssessment.index -= 1;
  renderAdhdQuestion();
}

function renderAdhdQuestion() {
  const total = adhdQuestions.length + adhdContextQuestions.length;
  const isContextQuestion = adhdAssessment.index >= adhdQuestions.length;
  const questionIndex = isContextQuestion ? adhdAssessment.index - adhdQuestions.length : adhdAssessment.index;
  const [section, question, choices] = isContextQuestion ? adhdContextQuestions[questionIndex] : adhdQuestions[questionIndex];
  const currentAnswer = isContextQuestion ? adhdAssessment.context[questionIndex] : adhdAssessment.answers[questionIndex];

  elements.adhdProgress.textContent = `${adhdAssessment.index + 1} of ${total}`;
  elements.adhdProgressBar.style.width = `${((adhdAssessment.index + 1) / total) * 100}%`;
  elements.adhdSectionLabel.textContent = section;
  elements.adhdQuestionText.textContent = question;
  elements.backAdhdQuestion.textContent = adhdAssessment.index === 0 ? "Cancel" : "Back";
  elements.adhdRatingButtons.replaceChildren();

  (choices ?? adhdRatingLabels).forEach((label, value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.adhdRating = String(value);
    button.className = "adhd-rating-button";
    button.classList.toggle("selected", currentAnswer === value);
    button.innerHTML = choices ? `<span>${label}</span>` : `<strong>${value}</strong><span>${label}</span>`;
    elements.adhdRatingButtons.append(button);
  });
}

function answerAdhdQuestion(value) {
  const isContextQuestion = adhdAssessment.index >= adhdQuestions.length;
  const answerIndex = isContextQuestion ? adhdAssessment.index - adhdQuestions.length : adhdAssessment.index;
  if (isContextQuestion) adhdAssessment.context[answerIndex] = value;
  else adhdAssessment.answers[answerIndex] = value;

  if (adhdAssessment.index === adhdQuestions.length + adhdContextQuestions.length - 1) {
    showAdhdResult();
    return;
  }
  adhdAssessment.index += 1;
  renderAdhdQuestion();
}

function showAdhdResult() {
  const result = scoreAdhdScreening({
    answers: adhdAssessment.answers,
    symptomsPresentSixMonths: adhdAssessment.context[0] === 1,
    symptomsBeforeAgeTwelve: adhdAssessment.context[1] === 1
  });
  saveAdhdAssessmentResult(result);
  renderAdhdResult(result);
  elements.adhdAssessmentRun.hidden = true;
  elements.adhdAssessmentResult.hidden = false;
}

function renderAdhdResult(result) {
  const profileLabels = {
    combined: "Combined symptom profile",
    inattentive: "Predominantly inattentive symptom profile",
    "hyperactive-impulsive": "Predominantly hyperactive-impulsive symptom profile",
    none: "No ADHD symptom profile flagged"
  };

  elements.adhdResultTitle.textContent = profileLabels[result.profile];
  elements.adhdResultSummary.textContent = result.meetsClinicalStyleScreen
    ? "Your responses meet this screen's symptom, impact, duration, and childhood-onset flags. A clinician can help determine what these symptoms mean for you."
    : "This screen did not meet every follow-up flag for a clinical-style result. Your answers can still be useful to discuss with a qualified clinician.";
  elements.adhdInattentionScore.textContent = `${result.inattentivePositive} / 18 positive`;
  elements.adhdHyperactiveScore.textContent = `${result.hyperactiveImpulsivePositive} / 21 positive`;
  elements.adhdImpactScore.textContent = `${result.functionalImpactAverage.toFixed(1)} / 4 average`;
  elements.adhdSimpleScore.textContent = `${result.simpleScore} / 100`;
  elements.adhdSimpleConclusion.textContent = result.simpleConclusion;
}

function loadAdhdAssessmentHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(adhdHistoryStorageKey));
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveAdhdAssessmentResult(result) {
  const history = loadAdhdAssessmentHistory();
  history.unshift({ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, completedAt: Date.now(), result });
  try {
    localStorage.setItem(adhdHistoryStorageKey, JSON.stringify(history.slice(0, 25)));
  } catch {
    // Keep the current result visible even when device storage is unavailable.
  }
}

function renderAdhdHistory() {
  const history = loadAdhdAssessmentHistory();
  elements.adhdHistoryList.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "assessment-history-empty";
    empty.textContent = "No completed assessments yet.";
    elements.adhdHistoryList.append(empty);
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "assessment-history-item";
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(entry.completedAt));
    item.innerHTML = `
      <div><span>${date}</span><strong>${escapeHtml(entry.result.simpleConclusion)} signal</strong></div>
      <b>${entry.result.simpleScore} / 100</b>
      <p>${entry.result.inattentivePositive} inattentive - ${entry.result.hyperactiveImpulsivePositive} hyperactive / impulsive</p>
    `;
    elements.adhdHistoryList.append(item);
  });
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
  const mobileTabOrder = ["home", "exercises", "assessments", "statistics"];
  const activeIndex = Math.max(0, mobileTabOrder.indexOf(tab));
  elements.sideNav?.style.setProperty("--active-nav-shift", `${activeIndex * 100}%`);
  elements.sideNav?.style.setProperty("--active-nav-gap-shift", `${activeIndex * 5}px`);
  renderTopStatus();
  postNativeNavigationMessage({ type: "tab", tab });
  syncNativeNavigationChrome();
}

function installNativeNavigationBridge() {
  window.MindcareNativeNav = {
    selectTab(tab) {
      const handlers = {
        home: showHome,
        assessments: showAssessments,
        exercises: showExerciseHub,
        statistics: showStatistics
      };
      handlers[tab]?.();
    }
  };

  window.addEventListener("mindcare-native-nav-ready", syncNativeNavigationChrome);
  if (elements.appShell) {
    new MutationObserver(syncNativeNavigationChrome).observe(elements.appShell, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  syncNativeNavigationChrome();
}

function syncNativeNavigationChrome() {
  const gameActive = elements.appShell?.classList.contains("game-active") ?? false;
  const sheetOpen = Boolean(document.querySelector("dialog[open]"));
  postNativeNavigationMessage({ type: "chrome", hidden: gameActive || sheetOpen });
}

// Sheets cover the tab bar like native iOS modals: hide the glass nav while any dialog is open.
{
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function showModalWithNavSync(...args) {
    const result = originalShowModal.apply(this, args);
    syncNativeNavigationChrome();
    return result;
  };
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("close", () => syncNativeNavigationChrome());
    if (!dialog.classList.contains("quit-dialog") && !dialog.classList.contains("settings-drawer")) enableSheetDragDismiss(dialog);
  });
}

function enableSheetDragDismiss(sheet) {
  let startY = 0;
  let dragY = 0;
  let dragging = false;

  sheet.addEventListener("touchstart", (event) => {
    if (sheet.scrollTop > 0) return;
    startY = event.touches[0].clientY;
    dragY = 0;
    dragging = true;
    sheet.style.transition = "none";
  }, { passive: true });

  sheet.addEventListener("touchmove", (event) => {
    if (!dragging) return;
    dragY = Math.max(0, event.touches[0].clientY - startY);
    sheet.style.transform = dragY ? `translateY(${dragY}px)` : "";
  }, { passive: true });

  const settle = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0.35, 1)";
    if (dragY > 110) {
      sheet.style.transform = "translateY(120%)";
      window.setTimeout(() => {
        sheet.close();
        sheet.style.transform = "";
        sheet.style.transition = "";
      }, 240);
    } else {
      sheet.style.transform = "";
      window.setTimeout(() => {
        sheet.style.transition = "";
      }, 300);
    }
  };
  sheet.addEventListener("touchend", settle);
  sheet.addEventListener("touchcancel", settle);
}

function postNativeNavigationMessage(payload) {
  try {
    window.webkit?.messageHandlers?.cogniNav?.postMessage(payload);
  } catch {
    // The native bridge only exists inside the iOS Capacitor shell.
  }
}

function openSocialLeaderboard() {
  if (!elements.socialLeaderboardDialog) return;
  renderSocialLeaderboard();
  refreshSocialHubFriends();
  if (typeof elements.socialLeaderboardDialog.showModal === "function" && !elements.socialLeaderboardDialog.open) {
    elements.socialLeaderboardDialog.showModal();
  }
}

function closeSocialLeaderboard() {
  elements.socialLeaderboardDialog?.close();
}

function renderSocialLeaderboard() {
  if (!elements.socialLeaderboardContent) return;
  if (!["all", "monthly"].includes(selectedLeaderboardTimeframe)) selectedLeaderboardTimeframe = "all";
  const userProfile = loadUserProfile();
  const xpProgress = loadXpProgress();
  const entries = buildLeaderboardEntries(userProfile, xpProgress, selectedLeaderboardTimeframe);
  const topThree = entries.slice(0, 3);

  elements.socialLeaderboardContent.innerHTML = `
    <section class="social-leaderboard-hero">
      <p class="exercise-type">Top 100</p>
      <h2>Leaderboards</h2>
      <p>Compare Mindcare points across friends and global trainers.</p>
    </section>
    <div class="leaderboard-timeframe-switch" aria-label="Leaderboard timeframe">
      ${Object.entries(leaderboardTimeframeLabels).map(([key, label]) => `
        <button class="${selectedLeaderboardTimeframe === key ? "active" : ""}" data-leaderboard-timeframe="${key}" type="button">${label}</button>
      `).join("")}
    </div>
    <section class="leaderboard-podium" aria-label="Top 3">
      ${[topThree[1], topThree[0], topThree[2]].filter(Boolean).map((entry) => `
        <article class="${entry.rank === 1 ? "first" : ""} ${entry.isCurrentUser ? "current" : ""}">
          <span>#${entry.rank}</span>
          <strong>${escapeHtml(entry.handle)}</strong>
          <b>${Math.max(0, Math.round(entry.xp))} Mindcare points</b>
        </article>
      `).join("")}
    </section>
    <section class="leaderboard-top100" aria-label="Top 100 leaderboard">
      ${entries.map((entry) => `
        <article class="leaderboard-row ${entry.isCurrentUser ? "current" : ""}">
          <span>${entry.rank}</span>
          <strong>${escapeHtml(entry.handle)}</strong>
          <em>${Math.max(0, Math.round(entry.xp))} Mindcare points</em>
        </article>
      `).join("")}
    </section>
  `;
}

function renderSocialFriends(friends = [], expanded = false) {
  const handle = normalizeProfileHandle(loadUserProfile().handle);
  return friends.length
    ? friends.map((request) => {
      const friendHandle = request.fromHandle === handle ? request.toHandle : request.fromHandle;
      return `
        <article class="friend-list-item">
          <strong>${escapeHtml(friendHandle)}</strong>
          <span>Friend</span>
        </article>
      `;
    }).join("")
    : expanded
      ? `<article class="friends-empty-state">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 20a5.5 5.5 0 0 1 11 0M12.5 19a4.5 4.5 0 0 1 9 0M4 4l16 16"/></svg>
          <strong>No friends yet</strong>
          <p>Add friends to compete and motivate each other.</p>
        </article>`
      : `<p class="friend-empty">No friends yet.</p>`;
}

function renderSocialIncomingRequests(incoming = []) {
  return incoming.length
    ? incoming.map((request) => `
      <article class="friend-list-item">
        <strong>${escapeHtml(request.fromHandle)}</strong>
        <div>
          <button type="button" data-social-friend-response="accept" data-friend-request-id="${escapeHtml(request.id)}">Accept</button>
          <button type="button" data-social-friend-response="decline" data-friend-request-id="${escapeHtml(request.id)}">Ignore</button>
        </div>
      </article>
    `).join("")
    : `<p class="friend-empty">No incoming requests.</p>`;
}

function renderSocialOutgoingRequests(outgoing = []) {
  return outgoing.length
    ? outgoing.map((request) => `
      <article class="friend-list-item">
        <strong>${escapeHtml(request.toHandle)}</strong>
        <span>Pending</span>
      </article>
    `).join("")
    : `<p class="friend-empty">No sent requests.</p>`;
}

function buildLeaderboardEntries(userProfile, xpProgress, timeframe = "all") {
  const handles = [
    "@neuroforge", "@synapse", "@mindstack", "@focuspilot", "@cortexclub", "@logicloop", "@patternist", "@fastsignal",
    "@memorylane", "@sharpbench", "@brainwave", "@reasonrush", "@streaksmith", "@quietfocus", "@mentalmodel", "@gridmind",
    "@recallpro", "@deepwork", "@speedcue", "@attention", "@clearpath", "@trialmaster", "@puzzleflow", "@nbacker"
  ];
  const generated = Array.from({ length: 100 }, (_, index) => ({
    handle: handles[index] ?? `@trainer${String(index + 1).padStart(2, "0")}`,
    xp: Math.max(120, leaderboardPreviewPoints(index, timeframe)),
    isCurrentUser: false
  }));
  const currentHandle = normalizeProfileHandle(userProfile.handle);
  const currentXp = timeframe === "monthly"
    ? xpForCurrentMonth(xpProgress)
    : Math.max(0, Math.round(xpProgress.totalXp));
  const withoutDuplicate = generated.filter((entry) => entry.handle !== currentHandle);
  withoutDuplicate.push({ handle: currentHandle, xp: currentXp, isCurrentUser: true });
  const ranked = withoutDuplicate
    .sort((a, b) => b.xp - a.xp || a.handle.localeCompare(b.handle))
    .slice(0, 100)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  if (!ranked.some((entry) => entry.isCurrentUser)) {
    ranked[ranked.length - 1] = { handle: currentHandle, xp: currentXp, isCurrentUser: true, rank: 100 };
  }
  return ranked;
}

function leaderboardPreviewPoints(index, timeframe) {
  const allTime = 9800 - index * 88 - (index % 7) * 17;
  if (timeframe !== "monthly") return allTime;
  return Math.round(allTime * 0.28 + ((index * 37) % 190));
}

function showPlaceholderSection(section) {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  const copy = {
    daily: ["Daily", "Daily tasks, puzzles, and streak work will live here."],
    leaderboard: ["Leaderboard", "Progress rankings and competition systems will live here."],
    assessments: ["Assessments", "Formal cognitive tests and cooldown rules will live here."]
  };
  const [title, description] = copy[section] ?? ["Section", "This area is reserved for the next production system."];
  elements.appShell.classList.remove("home-open", "friends-open", "friends-open", "dashboard-open", "exercises-open", "nback-open", "mot-open", "rrt-open", "cct-open", "ufov-open", "ict-open", "assessments-open", "stats-open", "profile-open", "leaderboard-open", "game-active", "nback-game-active", "mot-game-active", "rrt-game-active", "cct-game-active", "ufov-game-active", "ict-game-active");
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
    nback: { n: 2, modalities: ["position", "color", "shape", "audio"], trialTimeMs: nBackTrialTimeLimits.defaultValue, matchChance: 25, interference: 20, feedback: "show", autoProgression: true },
    rrt: { premiseCount: 2, timerSeconds: 30, timerEnabled: true, vocabulary: "nonsense", useNouns: true, useAdjectives: false, visualNoise: 5, scrambleFactor: 80 },
    cct: { durationMinutes: 5, startingIntervalSeconds: 3, minimumIntervalSeconds: 0.5, adaptive: true, correctStepMs: 120, wrongStepMs: 220 },
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
  resetRoutineSaveButton();
  renderRoutineDraft();
  if (typeof elements.routineDialog.showModal === "function") {
    elements.routineDialog.showModal();
  }
}

function openRoutineLoader() {
  renderRoutineList();
  if (typeof elements.routineLoadDialog?.showModal === "function") {
    elements.routineLoadDialog.showModal();
    return;
  }
  showRoutineNotice(loadRoutines().length ? "Choose a saved routine below." : "No routines created yet.");
}

function closeRoutineLoadDialog() {
  elements.routineLoadDialog?.close();
}

function closeRoutineDialog() {
  elements.routineDialog.close();
  resetRoutineSaveButton();
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
      <label><span>Trial time</span><input data-setting-field="trialTimeMs" type="number" min="${nBackTrialTimeLimits.min}" max="${nBackTrialTimeLimits.max}" step="100" value="${settings.trialTimeMs ?? nBackTrialTimeLimits.defaultValue}"></label>
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
      <label><span>Start interval</span><input data-setting-field="startingIntervalSeconds" type="number" min="0.5" max="10" step="0.5" value="${settings.startingIntervalSeconds ?? 3}"></label>
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
  const action = event.target.closest("[data-routine-action]")?.dataset.routineAction;
  const id = event.target.closest("[data-routine-id]")?.dataset.routineId;
  if (!action || !id) return;
  const routine = loadRoutines().find((item) => item.id === id);
  if (!routine) return;
  if (action === "play") {
    closeRoutineLoadDialog();
    startRoutine(routine);
    return;
  }
  if (action === "edit") {
    closeRoutineLoadDialog();
    openRoutineBuilder(routine);
  }
}

function saveRoutineDraft() {
  elements.saveRoutine.disabled = true;
  elements.saveRoutine.classList.add("routine-save-confirmed");
  elements.saveRoutine.textContent = "Saved";
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
  window.setTimeout(() => {
    closeRoutineDialog();
  }, 220);
}

function resetRoutineSaveButton() {
  elements.saveRoutine.disabled = false;
  elements.saveRoutine.classList.remove("routine-save-confirmed");
  elements.saveRoutine.textContent = "Save Routine";
}

function deleteRoutineDraft() {
  saveRoutines(loadRoutines().filter((item) => item.id !== routineDraft.id));
  closeRoutineDialog();
  renderRoutineList();
}

function renderRoutineList() {
  if (!elements.routineList || !elements.routineEmpty) return;
  const routines = loadRoutines();
  elements.routineEmpty.hidden = routines.length > 0;
  elements.routineEmpty.querySelector("p").textContent = "No routines created yet.";
  elements.routineEmpty.querySelector("span").textContent = "Create a routine to stack exercises into a repeatable training block.";
  elements.routineList.innerHTML = routines.map((routine) => `
    <article class="routine-card" data-routine-id="${escapeHtml(routine.id)}">
      <div>
        <h3>${escapeHtml(routine.name)}</h3>
        <p>${routine.blocks.length} exercises • ${formatRoutineDuration(estimateRoutineSeconds(routine))}</p>
      </div>
      <div class="routine-card-actions">
        <button type="button" data-routine-action="play">Play</button>
        <button type="button" data-routine-action="edit">Edit</button>
      </div>
    </article>
  `).join("");
}

function isDailyDetoxDoneToday() {
  try {
    return localStorage.getItem(dailyDetoxDoneStorageKey) === localDateKey();
  } catch {
    return false;
  }
}

function markDailyDetoxDone() {
  try {
    localStorage.setItem(dailyDetoxDoneStorageKey, localDateKey());
  } catch {
    // Detox completion is local-first until account sync exists.
  }
}

function buildDailyDetoxRoutine() {
  // Three blocks totaling ten minutes of training.
  const minutesByExercise = { nback: 4, rrt: 3, cct: 3 };
  const blocks = ["nback", "rrt", "cct"].map((exerciseId) => {
    const block = createRoutineBlock(exerciseId);
    block.timeMinutes = minutesByExercise[exerciseId];
    return block;
  });
  return { id: "daily-detox", name: "Daily detox", blocks };
}

function startRoutine(routine) {
  if (session.running || session.countingDown || mot.running || rrt.running || cct.running || ufov.running || ict.running) return;
  const blocks = (routine.blocks ?? [])
    .filter((block) => ["nback", "rrt", "cct", "ict"].includes(block.exerciseId))
    .map((block) => ({
      ...block,
      settings: {
        ...defaultRoutineSettings(block.exerciseId),
        ...(block.settings ?? {})
      }
    }));
  if (!blocks.length) {
    showRoutineNotice("Add a playable exercise to this routine first.");
    return;
  }
  if (elements.routineDialog.open) closeRoutineDialog();
  activeRoutineRun = {
    id: routine.id,
    name: routine.name || "Routine",
    blocks,
    index: 0,
    waitingForSummary: false
  };
  startNextRoutineBlock();
}

function startNextRoutineBlock() {
  if (!activeRoutineRun) return;
  if (activeRoutineRun.index >= activeRoutineRun.blocks.length) {
    const completedName = activeRoutineRun.name;
    const wasDailyDetox = activeRoutineRun.id === "daily-detox";
    activeRoutineRun = null;
    if (wasDailyDetox) markDailyDetoxDone();
    showExerciseHub();
    elements.pageLede.textContent = `${completedName} complete.`;
    return;
  }

  const block = activeRoutineRun.blocks[activeRoutineRun.index];
  activeRoutineRun.index += 1;
  openExerciseById(block.exerciseId);
  applyRoutineBlockSettings(block);
  if (block.exerciseId === "nback") startSession();
  if (block.exerciseId === "rrt") startRrtSession();
  if (block.exerciseId === "cct") startCctSession();
  if (block.exerciseId === "ict") startIctSession();
}

function handleRoutineExerciseFinished({ waitForSummary = false } = {}) {
  if (!activeRoutineRun) return;
  if (waitForSummary) {
    activeRoutineRun.waitingForSummary = true;
    return;
  }
  window.setTimeout(startNextRoutineBlock, 650);
}

function handleSessionSummaryClose() {
  showPendingSessionCoinFloat();
  if (!activeRoutineRun?.waitingForSummary) return;
  activeRoutineRun.waitingForSummary = false;
  startNextRoutineBlock();
}

// Coins earned by the just-finished session float up when the player exits
// the summary (or lands back on the hub after quitting mid-session).
function showPendingSessionCoinFloat() {
  if (!pendingSessionCoinFloat) return;
  const amount = pendingSessionCoinFloat;
  pendingSessionCoinFloat = 0;
  const float = document.createElement("div");
  float.className = "coin-claim-float coin-claim-float-center";
  float.innerHTML = `<span>+${amount}</span><img src="assets/mindcare-coin-23.png" alt="">`;
  document.body.appendChild(float);
  window.setTimeout(() => float.remove(), 1400);
}

function stopRoutineRun() {
  activeRoutineRun = null;
}

function applyRoutineBlockSettings(block) {
  const settings = {
    ...defaultRoutineSettings(block.exerciseId),
    ...(block.settings ?? {})
  };
  if (block.exerciseId === "nback") applyRoutineNBackSettings(block, settings);
  if (block.exerciseId === "rrt") applyRoutineRrtSettings(block, settings);
  if (block.exerciseId === "cct") applyRoutineCctSettings(block, settings);
  if (block.exerciseId === "ict") applyRoutineIctSettings(block, settings);
}

function routineTrialCount(block, secondsPerTrial, min, max) {
  const explicitTrials = Number(block.trialCount);
  if (Number.isFinite(explicitTrials) && explicitTrials > 0) return clampNumber(explicitTrials, min, max);
  const minutes = Number(block.timeMinutes);
  if (Number.isFinite(minutes) && minutes > 0) return clampNumber(Math.round((minutes * 60) / secondsPerTrial), min, max);
  return min;
}

function applyRoutineNBackSettings(block, settings) {
  const trialTimeMs = clampNumber(settings.trialTimeMs ?? nBackTrialTimeLimits.defaultValue, nBackTrialTimeLimits.min, nBackTrialTimeLimits.max);
  elements.nLevel.value = clampNumber(settings.n ?? 2, 1, 8);
  elements.trialTime.value = trialTimeMs;
  elements.sessionTimer.value = clampNumber(block.timeMinutes || routineExerciseMeta.nback.defaultMinutes, 0.5, 60);
  elements.trialCount.value = routineTrialCount(block, trialTimeMs / 1000, 12, 2400);
  elements.matchChance.value = clampNumber(settings.matchChance ?? 25, 5, 60);
  elements.interference.value = clampNumber(settings.interference ?? 20, 0, 60);
  elements.feedbackMode.value = settings.feedback === "hide" ? "hide" : "show";
  elements.autoProgression.checked = settings.autoProgression !== false;
  const modalities = new Set(settings.modalities?.length ? settings.modalities : ["position"]);
  elements.modalityInputs.forEach((input) => {
    input.checked = modalities.has(input.dataset.modality);
  });
  syncSettingLabels();
  updateFeedbackVisibility();
  updateResponseButtons();
}

function applyRoutineRrtSettings(block, settings) {
  elements.rrtPremiseCount.value = clampNumber(settings.premiseCount ?? 2, 2, 6);
  elements.rrtTimerEnabled.checked = settings.timerEnabled !== false;
  elements.rrtTimerSeconds.value = clampNumber(settings.timerSeconds ?? 30, 5, 90);
  elements.rrtSessionMinutes.value = clampNumber(block.timeMinutes || routineExerciseMeta.rrt.defaultMinutes, 0.5, 60);
  elements.rrtTrialCount.value = routineTrialCount(block, Number(elements.rrtTimerSeconds.value), 1, 60);
  elements.rrtAutoProgression.checked = settings.autoProgression !== false;
  elements.rrtVisualNoise.value = clampNumber(settings.visualNoise ?? settings.visualNoiseSplits ?? 5, 0, 20);
  elements.rrtScrambleFactor.value = clampNumber(settings.scrambleFactor ?? 80, 0, 100);
  setRrtVocabularyEnabled("garbage", false);
  setRrtVocabularyEnabled("meaningful", false);
  setRrtVocabularyEnabled("emoji", false);
  setRrtVocabularyEnabled(settings.vocabulary === "meaningful" ? "meaningful" : settings.vocabulary === "emoji" ? "emoji" : "garbage", true);
  elements.rrtUseVoronoiEmoji.checked = Boolean(settings.voronoiEmoji);
  ensureRrtHasActiveObject();
  ensureRrtHasActiveMode();
  syncRrtSettingLabels();
}

function applyRoutineCctSettings(block, settings) {
  elements.cctDuration.value = clampNumber(block.timeMinutes || settings.durationMinutes || routineExerciseMeta.cct.defaultMinutes, 0.5, 60);
  elements.cctStartInterval.value = clampNumber(settings.startingIntervalSeconds ?? 3, 0.5, 10);
  elements.cctMinInterval.value = clampNumber(settings.minimumIntervalSeconds ?? 0.5, 0.5, 10);
  elements.cctAdaptive.checked = settings.adaptive !== false;
  elements.cctCorrectStep.value = clampNumber(settings.correctStepMs ?? 120, 0, 1000);
  elements.cctWrongStep.value = clampNumber(settings.wrongStepMs ?? 220, 0, 1500);
  const cueMode = settings.cueMode ?? "voice";
  elements.cctCueModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.cctCueMode === cueMode);
  });
  syncCctSettingLabels();
}

function applyRoutineIctSettings(block, settings) {
  const totalTrials = routineTrialCount(block, routineSecondsPerTrial({ exerciseId: "ict", settings }), 8, 320);
  elements.ictBlocks.value = 1;
  elements.ictTrialsPerBlock.value = totalTrials;
  elements.ictSessionMinutes.value = clampNumber(block.timeMinutes || routineExerciseMeta.ict.defaultMinutes, 0.5, 60);
  elements.ictCueType.value = settings.cueType ?? "arrows";
  elements.ictStopProbability.value = clampNumber(settings.stopProbability ?? 25, 5, 50);
  elements.ictCalibrationTrials.value = clampNumber(settings.calibrationTrials ?? 8, 0, 40);
  elements.ictFixationMs.value = clampNumber(settings.fixationMs ?? 500, 100, 2000);
  elements.ictSsd.value = clampNumber(settings.stopSignalDelayMs ?? 250, 80, 900);
  elements.ictSsdStep.value = clampNumber(settings.stopSignalStepMs ?? 50, 10, 150);
  elements.ictStopSignalMode.value = settings.stopSignalMode ?? "triangle";
  elements.ictSoftDeadlineEnabled.checked = settings.softDeadlineEnabled ?? true;
  elements.ictSoftDeadline.value = clampNumber(settings.softDeadlineMs ?? 1200, 350, 3000);
  syncIctSettingLabels();
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
  if (block.exerciseId === "nback") return Math.max(nBackTrialTimeLimits.min / 1000, Number(settings.trialTimeMs ?? nBackTrialTimeLimits.defaultValue) / 1000);
  if (block.exerciseId === "rrt") return Math.max(5, Number(settings.timerSeconds ?? 30));
  if (block.exerciseId === "cct") return Math.max(0.5, Number(settings.startingIntervalSeconds ?? 3));
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

function beginExerciseTransition() {
  if (!elements.appShell) return;
  clearTimeout(exerciseTransitionTimer);
  elements.appShell.classList.remove("exercise-entering");
  void elements.appShell.offsetWidth;
  elements.appShell.classList.add("exercise-entering");
  exerciseTransitionTimer = setTimeout(() => {
    elements.appShell.classList.remove("exercise-entering");
  }, 760);
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
  beginExerciseTransition();
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
  stopRoutineRun();
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
  }, nBackTrialTimeMs());
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
  elements.feedback.textContent = "";
  const savedProgress = saveNBackProgress("complete", score);
  elements.appShell.classList.remove("game-active", "nback-game-active");
  showSessionSummary({
    test: `${session.config.n}-back · ${session.config.activeModalities.map(formatModalityName).join(", ")}`,
    durationMs: elapsedSessionMs(session.startedAt),
    correct: score.hits,
    misses: score.misses,
    falseAlarms: score.falseAlarms,
    answerSpeedMs: averageNBackReactionTime()
  });
  handleRoutineExerciseFinished({ waitForSummary: true });
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
  beginExerciseTransition();
  elements.appShell.classList.add("rrt-open", "game-active", "rrt-game-active");
  elements.startRrt.disabled = true;
  elements.quitRrt.disabled = false;
  elements.rrtTrue.disabled = true;
  elements.rrtFalse.disabled = true;
  elements.rrtOutput.textContent = "";
  elements.rrtSessionTotal.textContent = rrt.config.trialCount;
  elements.rrtState.textContent = "Get ready";
  elements.rrtProgress.textContent = `0 / ${rrt.config.trialCount}`;
  renderRrtResultStrip();
  setRrtTimerProgress(0);
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
  stopRoutineRun();
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
  setRrtTimerProgress(0);
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
  elements.rrtPremiseStat.textContent = "";
  elements.rrtPremises.innerHTML = rrt.trial.premises.map((premise) => `<li>${premise}</li>`).join("");
  elements.rrtConclusion.textContent = rrt.trial.conclusion;
  elements.rrtFeedback.textContent = "";
  renderRrtResultStrip();
  elements.rrtTrue.classList.remove("correct-answer", "wrong-answer");
  elements.rrtFalse.classList.remove("correct-answer", "wrong-answer");
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
  renderRrtResultStrip();
  elements.rrtFeedback.textContent = "";
  const correctButton = result.expected ? elements.rrtTrue : elements.rrtFalse;
  const wrongButton = result.expected ? elements.rrtFalse : elements.rrtTrue;
  correctButton.classList.add("correct-answer");
  wrongButton.classList.add("wrong-answer");
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
  setRrtTimerProgress(0);
  elements.rrtFeedback.textContent = "Session complete.";
  const savedProgress = saveRrtProgress("complete");
  elements.rrtOutput.textContent = JSON.stringify({
    completedTrials: rrt.results.length,
    correct: rrt.results.filter((result) => result.correct).length,
    meanReactionTimeMs: meanRrtReactionTime(),
    settings: rrtSettingsSummary(),
    today: savedProgress.today
  }, null, 2);
  handleRoutineExerciseFinished();
}

function startRrtTimer() {
  if (!rrt.config.timerEnabled) {
    rrt.timeLeft = null;
    elements.rrtTimeLeft.textContent = "--";
    elements.rrtTimerUnit.textContent = "off";
    setRrtTimerProgress(0);
    return;
  }
  rrt.timeLeft = rrt.trial.timerSeconds ?? rrt.config.timerSeconds;
  elements.rrtTimeLeft.textContent = rrt.timeLeft;
  elements.rrtTimerUnit.textContent = "sec";
  setRrtTimerProgress(1, 0);
  requestAnimationFrame(() => {
    if (!rrt.running || !rrt.trial) return;
    setRrtTimerProgress(0, rrt.timeLeft * 1000);
  });
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
  elements.rrtPremiseStat.textContent = "";
}

function setRrtTimerProgress(progress, transitionMs = 0) {
  elements.rrtStageCard.style.setProperty("--rrt-timer-transition", `${Math.max(0, transitionMs)}ms`);
  elements.rrtStageCard.style.setProperty("--rrt-timer-progress", clampNumber(progress, 0, 1));
}

function renderRrtResultStrip() {
  const total = rrt.config?.trialCount ?? Number(elements.rrtTrialCount.value) ?? 12;
  elements.rrtStageCard.style.setProperty("--rrt-trial-count", total);
  elements.rrtResultStrip.innerHTML = Array.from({ length: total }, (_, index) => {
    const result = rrt.results[index];
    const className = result
      ? result.correct ? "correct" : "wrong"
      : index === rrt.trialIndex && rrt.running ? "current" : "pending";
    return `<span class="${className}" aria-label="${className}"></span>`;
  }).join("");
}

function readRrtConfig() {
  return createRelationalReasoningConfig({
    mode: "mixed",
    premiseCount: clampNumber(elements.rrtPremiseCount.value, 2, 6),
    trialCount: clampNumber(elements.rrtTrialCount.value, 1, 60),
    timerEnabled: elements.rrtTimerEnabled.checked,
    timerSeconds: clampNumber(elements.rrtTimerSeconds.value, 5, 90),
    vocabulary: selectedRrtVocabulary(),
    vocabularies: selectedRrtVocabulariesForConfig(),
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
    vocabularies: selectedRrtVocabulariesForConfig(),
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
  return selectedRrtVocabularies()[0] ?? "emoji";
}

function selectedRrtVocabularies() {
  return elements.rrtVocabularyChoices
    .filter((choice) => choice.checked)
    .map((choice) => choice.value);
}

function selectedRrtVocabulariesForConfig() {
  const vocabularies = selectedRrtVocabularies();
  if (elements.rrtUseVoronoiEmoji.checked && !vocabularies.includes("emoji")) vocabularies.push("emoji");
  return vocabularies.length ? vocabularies : ["emoji"];
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
  beginExerciseTransition();
  elements.appShell.classList.add("cct-open", "game-active", "cct-game-active");
  elements.appShell.classList.toggle("cct-voice-mode", cct.config.speakDigits && !cct.config.showDigits);
  elements.appShell.classList.toggle("cct-text-mode", cct.config.showDigits);
  elements.startCct.disabled = true;
  elements.quitCct.disabled = false;
  elements.cctSubmitAnswer.disabled = true;
  elements.cctAnswerInput.disabled = true;
  elements.cctAnswerInput.value = "";
  setCctAnswerButtonsDisabled(true);
  elements.cctDigit.textContent = "-";
  elements.cctState.textContent = "Get ready";
  elements.cctProgress.textContent = "0 answered";
  elements.cctFeedback.textContent = "";
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
  stopRoutineRun();
  const savedProgress = saveCctProgress("quit");
  cct.running = false;
  elements.quitDialog.close();
  elements.appShell.classList.remove("game-active", "cct-game-active");
  elements.appShell.classList.remove("cct-voice-mode", "cct-text-mode");
  elements.startCct.disabled = false;
  elements.quitCct.disabled = true;
  elements.cctSubmitAnswer.disabled = true;
  elements.cctAnswerInput.disabled = true;
  setCctAnswerButtonsDisabled(true);
  elements.cctState.textContent = "Ready";
  elements.cctProgress.textContent = "0 / 0";
  elements.cctDigit.textContent = "-";
  elements.cctFeedback.textContent = "";
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
  elements.cctFeedback.textContent = "";
  setCctAnswerButtonsDisabled(cct.previousDigit === null);
  updateCctStats();
  scheduleCct(showCctDigit, cct.currentIntervalMs);
  if (cct.config.speakDigits) requestAnimationFrame(() => speakCue(String(cct.currentDigit)));
}

function submitCctAnswer() {
  if (!cct.running || cct.previousDigit === null || cct.answeredCurrent) return;
  const value = elements.cctAnswerInput.value;
  if (!value) return;
  const result = scoreCctAnswer(cct.previousDigit, cct.currentDigit, value, Math.round(performance.now() - cct.digitStartedAt));
  cct.results.push({ ...result, intervalMs: cct.currentIntervalMs });
  cct.answeredCurrent = true;
  cct.currentIntervalMs = nextCctInterval(cct.config, cct.currentIntervalMs, result);
  setCctAnswerButtonsDisabled(true);
  elements.cctFeedback.textContent = "";
  updateCctStats();
}

function answerCctChoice(answer) {
  if (!cct.running || cct.previousDigit === null || cct.answeredCurrent) return;
  elements.cctAnswerInput.value = answer;
  submitCctAnswer();
}

function setCctAnswerButtonsDisabled(disabled) {
  elements.cctKeypadButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function finishCctSession() {
  clearCctTimers();
  clearExerciseCountdown(elements.cctStageCard);
  cct.running = false;
  elements.startCct.disabled = false;
  elements.quitCct.disabled = true;
  elements.cctSubmitAnswer.disabled = true;
  elements.cctAnswerInput.disabled = true;
  setCctAnswerButtonsDisabled(true);
  elements.appShell.classList.remove("game-active", "cct-game-active");
  elements.appShell.classList.remove("cct-voice-mode", "cct-text-mode");
  elements.cctState.textContent = "Complete";
  elements.cctFeedback.textContent = "";
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
  handleRoutineExerciseFinished();
}

function updateCctStats() {
  const correct = cct.results.filter((result) => result.correct).length;
  elements.cctCorrect.textContent = correct;
  elements.cctWrong.textContent = cct.results.length - correct;
  elements.cctIntervalStat.textContent = (cct.currentIntervalMs / 1000).toFixed(1);
  elements.cctTimeLeft.textContent = cct.running ? formatClock(Math.max(0, cct.endsAt - Date.now())) : formatClock(Number(elements.cctDuration.value) * 60 * 1000);
  renderCctResultStrip();
}

function renderCctResultStrip() {
  if (!elements.cctResultStrip) return;
  const slotCount = 24;
  const hasCurrent = cct.running && cct.previousDigit !== null && !cct.answeredCurrent;
  const items = cct.results.slice(-(slotCount - (hasCurrent ? 1 : 0)));
  const pendingCount = Math.max(0, slotCount - items.length - (hasCurrent ? 1 : 0));
  const html = [
    ...Array.from({ length: pendingCount }, () => `<span class="pending" aria-label="pending"></span>`),
    ...items.map((result) => `<span class="${result.correct ? "correct" : "wrong"}" aria-label="${result.correct ? "correct" : "incorrect"}"></span>`),
    ...(hasCurrent ? [`<span class="current" aria-label="current"></span>`] : [])
  ].join("");
  elements.cctResultStrip.style.setProperty("--cct-result-count", slotCount);
  elements.cctResultStrip.innerHTML = html;
}

function readCctConfig() {
  const cueMode = selectedCctCueMode();
  return createCctConfig({
    durationSeconds: clampNumber(elements.cctDuration.value, 0.5, 60) * 60,
    startingIntervalMs: clampNumber(elements.cctStartInterval.value, 0.5, 10) * 1000,
    minimumIntervalMs: clampNumber(elements.cctMinInterval.value, 0.5, 10) * 1000,
    speakDigits: cueMode === "voice",
    showDigits: cueMode === "text",
    adaptive: elements.cctAdaptive.checked,
    correctStepMs: clampNumber(elements.cctCorrectStep.value, 0, 1000),
    wrongStepMs: clampNumber(elements.cctWrongStep.value, 0, 1500)
  });
}

function cctSettingsSummary() {
  const cueMode = selectedCctCueMode();
  return {
    durationSeconds: Number(elements.cctDuration.value) * 60,
    startingIntervalMs: Number(elements.cctStartInterval.value) * 1000,
    minimumIntervalMs: Number(elements.cctMinInterval.value) * 1000,
    cueMode,
    speakDigits: cueMode === "voice",
    showDigits: cueMode === "text",
    adaptive: elements.cctAdaptive.checked,
    correctStepMs: Number(elements.cctCorrectStep.value),
    wrongStepMs: Number(elements.cctWrongStep.value)
  };
}

function selectedCctCueMode() {
  return elements.cctCueModeButtons.find((button) => button.classList.contains("active"))?.dataset.cctCueMode ?? "voice";
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
  beginExerciseTransition();
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
    trialCount: clampNumber(elements.ufovTrialCount.value, 4, 300),
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
  beginExerciseTransition();
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
  stopRoutineRun();
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
      showIctStopSignal();
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
  handleRoutineExerciseFinished();
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
    button.disabled = false;
    button.setAttribute("aria-disabled", String(disabled));
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
  const difficultyWeight = calculateExerciseWeight(exerciseId, sessionData.settings ?? {});
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
    difficultyWeight,
    weightedScore,
    microMetrics,
    settingsSnapshot: sessionData.settings,
    trialData: sessionData.trialData ?? []
  };
  const xpAward = awardSessionXp(progress, sessionRecord);
  sessionRecord.xpAward = xpAward;
  const coinAward = mindcareUiMode === "play" ? Math.round((durationMs / 60000) * sessionCoinsPerMinute) : 0;
  if (coinAward > 0) {
    creditScreenTimeWallet(coinAward, `${exerciseId.toUpperCase()} training`, { session: sessionRecord.id });
    pendingSessionCoinFloat += coinAward;
  }
  sessionRecord.coinAward = coinAward;

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
  renderHomePage();
  if (elements.appShell.classList.contains("profile-open")) renderProfile();
  if (elements.socialLeaderboardDialog?.open) renderSocialLeaderboard();
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
      difficultyWeight,
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
  if (!elements.statsGrid) {
    if (elements.appShell.classList.contains("profile-open")) renderProfile();
    return;
  }
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

  document.querySelectorAll(".profile-view-switch, .profile-timeframe-control").forEach((control) => {
    control.classList.remove("seg-sliding");
    control.style.removeProperty("--seg-x");
    control.style.removeProperty("--seg-y");
    control.style.removeProperty("--seg-w");
    control.style.removeProperty("--seg-h");
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

function loadXpProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(xpProgressStorageKey));
    return {
      totalXp: Math.max(0, Math.round(Number(saved?.totalXp) || 0)),
      events: Array.isArray(saved?.events) ? saved.events : []
    };
  } catch {
    return { totalXp: 0, events: [] };
  }
}

function saveXpProgress(progress) {
  try {
    localStorage.setItem(xpProgressStorageKey, JSON.stringify({
      totalXp: Math.max(0, Math.round(Number(progress.totalXp) || 0)),
      events: (progress.events ?? []).slice(0, 500)
    }));
  } catch {
    // Mindcare points are local-first until account sync exists.
  }
}

function awardXpEvent(type, amount, label, meta = {}) {
  const xp = Math.max(0, Math.round(Number(amount) || 0));
  if (!xp) return null;
  const progress = loadXpProgress();
  if (meta.sourceId && progress.events?.some((event) => event.sourceId === meta.sourceId)) {
    return null;
  }
  const event = {
    id: `xp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    label,
    amount: xp,
    sourceId: meta.sourceId ?? "",
    meta,
    createdAt: new Date().toISOString()
  };
  progress.totalXp = Math.max(0, Math.round(Number(progress.totalXp) || 0)) + xp;
  progress.events = [event, ...(progress.events ?? [])].slice(0, 500);
  saveXpProgress(progress);
  // XP feeds ranks only; coins come from the per-minute training rate and
  // daily quests so the earning rate shown in the app stays truthful.
  return event;
}

function loadScreenTimeWallet() {
  try {
    const saved = JSON.parse(localStorage.getItem(screenTimeWalletStorageKey));
    return {
      balance: Math.max(0, Math.round(Number(saved?.balance) || 0)),
      ledger: Array.isArray(saved?.ledger) ? saved.ledger : []
    };
  } catch {
    return { balance: 0, ledger: [] };
  }
}

function saveScreenTimeWallet(wallet) {
  try {
    localStorage.setItem(screenTimeWalletStorageKey, JSON.stringify({
      balance: Math.max(0, Math.round(Number(wallet.balance) || 0)),
      ledger: (wallet.ledger ?? []).slice(0, 300)
    }));
  } catch {
    // Wallet is local-first until account sync exists.
  }
}

function creditScreenTimeWallet(amount, label, meta = {}) {
  const points = Math.max(0, Math.round(Number(amount) || 0));
  if (!points) return;
  const wallet = loadScreenTimeWallet();
  wallet.balance += points;
  wallet.ledger = [{
    id: `wallet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: "earn",
    label,
    amount: points,
    meta,
    createdAt: new Date().toISOString()
  }, ...(wallet.ledger ?? [])].slice(0, 300);
  saveScreenTimeWallet(wallet);
}

function spendScreenTimeWallet(amount, label, meta = {}) {
  const points = Math.max(0, Math.round(Number(amount) || 0));
  const wallet = loadScreenTimeWallet();
  if (!points || wallet.balance < points) return false;
  wallet.balance -= points;
  wallet.ledger = [{
    id: `wallet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: "spend",
    label,
    amount: -points,
    meta,
    createdAt: new Date().toISOString()
  }, ...(wallet.ledger ?? [])].slice(0, 300);
  saveScreenTimeWallet(wallet);
  return true;
}

function loadDailyQuests() {
  const today = localDateKey();
  try {
    const saved = JSON.parse(localStorage.getItem(dailyQuestsStorageKey));
    if (saved?.dateKey === today && saved.quests) return saved;
  } catch {
    // Fall through to a fresh day.
  }
  return { dateKey: today, quests: {} };
}

function saveDailyQuests(state) {
  try {
    localStorage.setItem(dailyQuestsStorageKey, JSON.stringify(state));
  } catch {
    // Quest state is local-first until account sync exists.
  }
}

function loadCustomTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(customTasksStorageKey));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCustomTasks(tasks) {
  try {
    localStorage.setItem(customTasksStorageKey, JSON.stringify(tasks.slice(0, 30)));
  } catch {
    // Task list is local-first until account sync exists.
  }
}

function addCustomTask(label, reward) {
  const cleanLabel = String(label ?? "").trim().slice(0, 48);
  if (!cleanLabel) return false;
  const tasks = loadCustomTasks();
  tasks.push({
    id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: cleanLabel,
    reward: Math.max(5, Math.min(100, Math.round(Number(reward) || 25))),
    kind: "honor"
  });
  saveCustomTasks(tasks);
  return true;
}

const customTaskExerciseLabels = {
  any: "Any exercise",
  nback: "N-Back",
  rrt: "RRT",
  cct: "CCT",
  ict: "ICT"
};
const customTaskMinuteChoices = [5, 10, 15, 20, 30];

// User-built daily task: train a chosen exercise for a chosen number of
// minutes; pays the same 10 coins per minute as the preset train quests.
function addExerciseTask(exerciseId, minutes) {
  const cleanExercise = customTaskExerciseLabels[exerciseId] ? exerciseId : "any";
  const cleanMinutes = customTaskMinuteChoices.includes(Number(minutes)) ? Number(minutes) : 10;
  const tasks = loadCustomTasks();
  const duplicate = tasks.some((task) => task.kind === "exercise-minutes" && task.exerciseId === cleanExercise && task.target === cleanMinutes);
  if (duplicate) return false;
  tasks.push({
    id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: `${customTaskExerciseLabels[cleanExercise]} · ${cleanMinutes} min`,
    reward: cleanMinutes * 10,
    kind: "exercise-minutes",
    exerciseId: cleanExercise,
    target: cleanMinutes
  });
  saveCustomTasks(tasks);
  return true;
}

function removeCustomTask(id) {
  saveCustomTasks(loadCustomTasks().filter((task) => task.id !== id));
}

function dailyQuestViews(progress) {
  const state = loadDailyQuests();
  const minutesToday = trainingMinutesForDate(progress, leaderboardExerciseIds, localDateKey());
  return [...dailyQuestDefs, ...loadCustomTasks()].map((def) => {
    let progressPct = 0;
    if (def.kind === "honor") progressPct = 1;
    if (def.kind === "session") progressPct = minutesToday > 0 ? 1 : 0;
    if (def.kind === "minutes") progressPct = clamp01(minutesToday / def.target);
    if (def.kind === "exercise-minutes") {
      const ids = def.exerciseId === "any" ? leaderboardExerciseIds : [def.exerciseId];
      progressPct = clamp01(trainingMinutesForDate(progress, ids, localDateKey()) / def.target);
    }
    if (def.kind === "detox") progressPct = isDailyDetoxDoneToday() ? 1 : 0;
    const claimed = Boolean(state.quests[def.id]?.claimed);
    return {
      ...def,
      progressPct,
      claimed,
      claimable: progressPct >= 1 && !claimed
    };
  });
}

function claimDailyQuest(id) {
  const quest = dailyQuestViews(loadExerciseProgress()).find((entry) => entry.id === id);
  if (!quest || !quest.claimable) return;
  const state = loadDailyQuests();
  state.quests[id] = { claimed: true, claimedAt: new Date().toISOString() };
  saveDailyQuests(state);
  creditScreenTimeWallet(quest.reward, quest.label, { quest: id });
  renderHomePage();
}

function screenTimeNativePlugin() {
  return window.Capacitor?.Plugins?.ScreenTime ?? null;
}

function loadScreenTimeLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(screenTimeLocalStateStorageKey));
    return {
      selectionCount: Math.max(0, Math.round(Number(saved?.selectionCount) || 0)),
      unlockUntil: Math.max(0, Number(saved?.unlockUntil) || 0)
    };
  } catch {
    return { selectionCount: 0, unlockUntil: 0 };
  }
}

function saveScreenTimeLocalState(state) {
  try {
    localStorage.setItem(screenTimeLocalStateStorageKey, JSON.stringify(state));
  } catch {
    // Preview state is best-effort in the browser.
  }
}

async function refreshScreenTimeStatus({ rerender = true } = {}) {
  const before = JSON.stringify(screenTimeStatus);
  const native = screenTimeNativePlugin();
  if (native) {
    try {
      const status = await native.getStatus();
      screenTimeStatus.available = Boolean(status?.available);
      screenTimeStatus.authorized = Boolean(status?.authorized);
      screenTimeStatus.selectionCount = Math.max(0, Math.round(Number(status?.selectionCount) || 0));
      screenTimeStatus.shieldActive = Boolean(status?.shieldActive);
      screenTimeStatus.unlockUntil = Math.max(0, Number(status?.unlockUntil) || 0);
    } catch {
      screenTimeStatus.available = false;
    }
  } else {
    const local = loadScreenTimeLocalState();
    screenTimeStatus.available = false;
    screenTimeStatus.authorized = true;
    screenTimeStatus.selectionCount = local.selectionCount;
    screenTimeStatus.unlockUntil = local.unlockUntil > Date.now() ? local.unlockUntil : 0;
    screenTimeStatus.shieldActive = local.selectionCount > 0 && !screenTimeStatus.unlockUntil;
  }
  scheduleScreenTimeExpiryRefresh();
  if (rerender && before !== JSON.stringify(screenTimeStatus)) {
    renderHomePage();
    if (elements.screenTimeDialog?.open) renderScreenTimeDialog();
  }
}

function scheduleScreenTimeExpiryRefresh() {
  if (screenTimeExpiryTimer) {
    clearTimeout(screenTimeExpiryTimer);
    screenTimeExpiryTimer = null;
  }
  const remaining = screenTimeStatus.unlockUntil - Date.now();
  if (remaining > 0) {
    screenTimeExpiryTimer = setTimeout(() => refreshScreenTimeStatus(), remaining + 500);
  }
}

async function handleScreenTimeChooseApps() {
  const native = screenTimeNativePlugin();
  if (!native) {
    const local = loadScreenTimeLocalState();
    saveScreenTimeLocalState({ ...local, selectionCount: local.selectionCount ? 0 : 3 });
    await refreshScreenTimeStatus();
    return;
  }
  try {
    const auth = await native.requestAuthorization();
    if (!auth?.authorized) return;
    await native.presentAppPicker();
  } catch {
    // User cancelled the picker or authorization.
  }
  await refreshScreenTimeStatus();
}

async function handleScreenTimeUnlock(minutes) {
  const cost = minutes * screenTimePointsPerMinute;
  if (!spendScreenTimeWallet(cost, `${minutes} min screen time`, { minutes })) return;
  const native = screenTimeNativePlugin();
  if (native) {
    try {
      await native.unlock({ minutes });
    } catch {
      creditScreenTimeWallet(cost, "Unlock refund", { minutes });
    }
  } else {
    const local = loadScreenTimeLocalState();
    saveScreenTimeLocalState({ ...local, unlockUntil: Date.now() + minutes * 60000 });
  }
  closeScreenTimeDialog();
  await refreshScreenTimeStatus();
  renderHomePage();
}

async function handleScreenTimeLockNow() {
  const native = screenTimeNativePlugin();
  if (native) {
    try {
      await native.lockNow();
    } catch {
      // Shield reapplication failed; status refresh below reflects reality.
    }
  } else {
    const local = loadScreenTimeLocalState();
    saveScreenTimeLocalState({ ...local, unlockUntil: 0 });
  }
  await refreshScreenTimeStatus();
  renderHomePage();
}

function openScreenTimeDialog() {
  if (!elements.screenTimeDialog) return;
  renderScreenTimeDialog();
  if (typeof elements.screenTimeDialog.showModal === "function" && !elements.screenTimeDialog.open) {
    elements.screenTimeDialog.showModal();
  }
}

function closeScreenTimeDialog() {
  elements.screenTimeDialog?.close();
}

function renderScreenTimeDialog() {
  if (!elements.screenTimeDialogContent) return;
  const wallet = loadScreenTimeWallet();
  const hasSelection = screenTimeStatus.selectionCount > 0;
  const alreadyUnlocked = screenTimeStatus.unlockUntil > Date.now();
  const purchasable = hasSelection && !alreadyUnlocked;
  let note = `Every ${screenTimePointsPerMinute} points buys 1 minute. Earn points by training.`;
  if (!hasSelection) {
    note = "Choose apps to block first — then buy time back here.";
  } else if (alreadyUnlocked) {
    const until = new Date(screenTimeStatus.unlockUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    note = `Already unlocked until ${until}.`;
  }
  let appsLine;
  if (alreadyUnlocked) {
    const until = new Date(screenTimeStatus.unlockUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    appsLine = `<span>Unlocked until ${until}</span><button data-screentime-lock type="button">Lock now</button>`;
  } else if (hasSelection) {
    appsLine = `<span>${screenTimeStatus.selectionCount} app${screenTimeStatus.selectionCount === 1 ? "" : "s"} blocked</span><button data-screentime-apps type="button">Edit</button>`;
  } else {
    appsLine = `<span>No apps blocked${screenTimeNativePlugin() ? "" : " (preview)"}</span><button data-screentime-apps type="button">Choose apps</button>`;
  }
  elements.screenTimeDialogContent.innerHTML = `
    <div class="screen-time-apps-row">${appsLine}</div>
    <div class="screen-time-balance">
      <span>Available</span>
      <strong>${wallet.balance.toLocaleString()} <img src="assets/mindcare-coin-23.png" alt="coins"></strong>
    </div>
    <p class="screen-time-rate">${note}</p>
    <div class="screen-time-options">
      ${screenTimeUnlockOptions.map((minutes) => {
        const cost = minutes * screenTimePointsPerMinute;
        const buyable = purchasable && wallet.balance >= cost;
        return `
          <button data-screentime-buy="${minutes}" type="button" ${buyable ? "" : "disabled"}>
            <strong>${minutes} min</strong>
            <span>${cost.toLocaleString()} pts</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function handleScreenTimeDialogClick(event) {
  if (event.target.closest("[data-screentime-apps]")) {
    handleScreenTimeChooseApps().then(() => renderScreenTimeDialog());
    return;
  }
  if (event.target.closest("[data-screentime-lock]")) {
    handleScreenTimeLockNow().then(() => renderScreenTimeDialog());
    return;
  }
  const buyButton = event.target.closest("[data-screentime-buy]");
  if (!buyButton || buyButton.disabled) return;
  const minutes = Math.max(1, Math.round(Number(buyButton.dataset.screentimeBuy) || 0));
  handleScreenTimeUnlock(minutes);
}

function awardSessionXp(progress, sessionRecord) {
  const exerciseLabels = { nback: "N-Back", rrt: "RRT", cct: "CCT", ict: "ICT" };
  const minutes = Math.max(0, Number(sessionRecord.durationMs) || 0) / 60000;
  const trialXp = Math.min(90, Math.round((sessionRecord.completedTrials ?? 0) * 1.8));
  const timeXp = Math.min(90, Math.round(minutes * 10));
  const accuracyXp = Math.round(clamp01(Number(sessionRecord.rawAccuracy) || 0) * 35);
  const difficultyXp = Math.round(clamp01(sessionRecord.difficultyWeight?.overall ?? 0) * 45);
  const baseXp = 15 + trialXp + timeXp + accuracyXp + difficultyXp;
  const streak = calculateDailyTrainingStreak(progress, leaderboardExerciseIds);
  const multiplier = xpMultiplierForStreak(streak);
  return awardXpEvent("exercise_session", Math.round(baseXp * multiplier), `${exerciseLabels[sessionRecord.exerciseId] ?? "Exercise"} session`, {
    sourceId: sessionRecord.id,
    exerciseId: sessionRecord.exerciseId,
    multiplier,
    streak
  });
}

function currentXpMultiplier() {
  return xpMultiplierForStreak(calculateDailyTrainingStreak(loadExerciseProgress(), leaderboardExerciseIds));
}

function xpMultiplierForStreak(streak) {
  return Math.min(2, 1 + Math.max(0, Math.round(streak)) * 0.05);
}

function formatXpMultiplier(value) {
  return `${roundMetric(value)}x`;
}

function xpForDate(progress, dateKey) {
  return (progress.events ?? []).reduce((sum, event) => (
    localDateKey(new Date(event.createdAt)) === dateKey ? sum + Math.max(0, Math.round(event.amount) || 0) : sum
  ), 0);
}

function xpForCurrentMonth(progress) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return (progress.events ?? []).reduce((sum, event) => {
    const date = new Date(event.createdAt);
    if (Number.isNaN(date.getTime())) return sum;
    const eventMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return eventMonth === monthKey ? sum + Math.max(0, Math.round(event.amount) || 0) : sum;
  }, 0);
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  if (localDateKey(date) === localDateKey()) return "Today";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function nBackTrialTimeMs() {
  const value = clampNumber(elements.trialTime.value, nBackTrialTimeLimits.min, nBackTrialTimeLimits.max);
  if (String(elements.trialTime.value) !== String(value)) elements.trialTime.value = value;
  return value;
}

function showSessionSummary(summary) {
  elements.summaryTest.textContent = summary.test;
  elements.summaryTime.textContent = formatDuration(summary.durationMs);
  elements.summaryCorrect.textContent = summary.correct;
  elements.summaryMisses.textContent = summary.misses;
  elements.summaryFalseAlarms.textContent = summary.falseAlarms;
  elements.summarySpeed.textContent = Number.isFinite(summary.answerSpeedMs)
    ? `${Math.round(summary.answerSpeedMs)} ms`
    : "-";
  if (typeof elements.sessionSummaryDialog.showModal === "function") {
    elements.sessionSummaryDialog.showModal();
  }
}

function formatModalityName(modality) {
  const labels = {
    position: "Position",
    audio: "Sound",
    color: "Color",
    shape: "Shape"
  };
  return labels[modality] ?? modality;
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
  beginExerciseTransition();
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
    trialCount: clampNumber(elements.motTrialCount.value, 1, 120),
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
        ${position === "4" ? '<img class="center-mark" src="assets/brand/logo-white.png" alt="">' : ""}
      </span>
    `)
    .join("");
}

function showCues(trial) {
  clearBoard();
  const active = new Set(session.config.activeModalities);
  const cuePosition = active.has("position") ? trial.cues.position : "4";
  const cell = elements.board.querySelector(`[data-position="${cuePosition}"]`);
  if (cell) {
    cell.classList.add("active");
    const usesColor = active.has("color");
    const usesShape = active.has("shape");
    if (!usesColor && !usesShape) cell.classList.add("position-only");
    if (usesColor) cell.style.setProperty("--shape-color", trial.cues.color);
    if (usesColor || usesShape) {
      const shape = usesShape ? trial.cues.shape : "circle";
      const label = usesShape ? shapeLabels[shape] ?? "" : "";
      cell.innerHTML = `<span class="shape shape-${shape}">${label}</span>`;
    }
  }
  if (active.has("audio")) speakCue(trial.cues.audio);
}

function clearBoard() {
  elements.board.querySelectorAll(".grid-cell").forEach((cell) => {
    cell.classList.remove("active", "position-only");
    cell.style.removeProperty("--shape-color");
    cell.innerHTML = cell.dataset.position === "4" ? '<img class="center-mark" src="assets/brand/logo-white.png" alt="">' : "";
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
  elements.feedback.textContent = "";
  elements.output.textContent = JSON.stringify({
    input: "Press Start. Use A for position, F for color, J for shape, and L for audio when that cue matches N steps back.",
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
  if (mode !== "hide" && !session.running) elements.feedback.textContent = "";
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
    trialTimeMs: nBackTrialTimeMs(),
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
