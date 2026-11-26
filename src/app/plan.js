// Cogni · Plan — the four-week path.
// ---------------------------------------------------------------------------
// A Duolingo-style roadmap of steps built from what the user wants to work on,
// how long they have each day, and the shape of their IQ profile (the two
// weakest indices get the most work). Every training step is a routine that
// runs through the ordinary routine engine; the IQ test and the retest are
// steps too. Steps open one at a time. Only the baseline (the free IQ test)
// sits outside the paywall; every training step and the retest are what Cogni
// Pass buys, all of them visible from day one.
//
// State lives in localStorage under a "cogni." key, so account sync carries
// it between devices like everything else. The generated steps are stored,
// not recomputed, so a plan stays the same plan even if the generator changes.
//
// The two questions (goals, minutes a day) are asked in the web onboarding,
// before the intro; the Plan tab always shows a road. Without answers the road
// is built from defaults, and "Change goals" on the Guide re-asks them.
// ---------------------------------------------------------------------------
import { MEASUREMENT_INDICES, MEASUREMENT_INDEX_ORDER, rankedIndices } from "../core/assessments/measurement.js";

let d = null;      // deps from main.js
let host = null;   // .plan-page section

const PLAN_KEY = "cogni.plan.v1";
const PREFS_KEY = "cogni.planPrefs.v1";
const PLAN_VERSION = 1;
// What the plan calls itself wherever it is named or sold.
const PLAN_NAME = "Your plan to reverse brainrot";
const WEEKS = 4;
const STEPS_PER_WEEK = 5;
// Steps outside the paywall (0-based index < FREE_STEPS): just the baseline,
// which is the IQ test everyone takes for free before the plan exists.
const FREE_STEPS = 1;

// What a step can target. Goals name the user's intent; the IQ profile adds
// weight to whichever indices measured lowest.
const GOALS = [
  { id: "iq", label: "Raise my IQ score", phrase: "a higher IQ score", blurb: "Everything the test measures, weakest first.", indices: [], exercises: [] },
  { id: "focus", label: "Sharper focus", phrase: "sharper focus", blurb: "Hold attention and resist the pull.", indices: ["psi"], exercises: ["cct", "ict", "reaction"] },
  { id: "memory", label: "Better memory", phrase: "better memory", blurb: "Hold more in mind, recall it cleanly.", indices: ["wmi"], exercises: ["nback", "gridmemory", "seqrecall", "numrecall"] },
  { id: "reasoning", label: "Clearer reasoning", phrase: "clearer reasoning", blurb: "See the rule. Spot the flaw.", indices: ["fri"], exercises: ["rrt", "fallacy"] },
  { id: "speed", label: "Faster thinking", phrase: "faster thinking", blurb: "Quicker, cleaner answers under time.", indices: ["psi"], exercises: ["reaction", "mentalmath", "cct"] },
  { id: "words", label: "Stronger with words", phrase: "stronger words", blurb: "Meaning, vocabulary, argument.", indices: ["vci"], exercises: ["verbal", "fallacy"] },
  { id: "numbers", label: "Stronger with numbers", phrase: "stronger numbers", blurb: "Quantity, proportion, arithmetic.", indices: ["qri"], exercises: ["mentalmath", "numrecall"] }
];
const MINUTE_OPTIONS = [10, 15, 25];
const DEFAULT_PREFS = { goals: ["iq"], minutes: 15 };

// Which exercises move which index. Working memory and speed have the most
// coverage because that is where the catalogue is deepest.
const INDEX_EXERCISES = {
  vci: ["verbal", "fallacy"],
  fri: ["rrt", "fallacy"],
  vsi: ["gridmemory", "nback", "seqrecall"],
  qri: ["mentalmath", "numrecall"],
  wmi: ["nback", "numrecall", "seqrecall", "gridmemory"],
  psi: ["reaction", "cct", "ict", "mentalmath"]
};
const CLASSIC = new Set(["nback", "rrt", "cct", "ict"]);
const ALL_EXERCISES = ["nback", "rrt", "cct", "ict", "gridmemory", "seqrecall", "numrecall", "verbal", "fallacy", "mentalmath", "reaction"];
const EXERCISE_NAMES = {
  nback: "N-Back", rrt: "Relational Reasoning", cct: "Cognitive Control", ict: "Inhibitory Control",
  gridmemory: "Grid Memory", seqrecall: "Sequence Memory", numrecall: "Number Recall", verbal: "Word Memory",
  fallacy: "Spot the Fallacy", mentalmath: "Mental Math", reaction: "Reaction Time"
};
const INDEX_TITLES = {
  vci: "Verbal comprehension", fri: "Fluid reasoning", vsi: "Visual-spatial",
  qri: "Quantitative reasoning", wmi: "Working memory", psi: "Processing speed"
};
const WEEK_THEMES = [
  { name: "Baseline", blurb: "Measure first, then easy sessions to learn each exercise." },
  { name: "Build", blurb: "Full sessions. The weak indices get the most time." },
  { name: "Push", blurb: "Longer blocks, default difficulty. This is where the number moves." },
  { name: "Retest", blurb: "Hold the gains for four days, then sit the test again." }
];
// A mini game runs one round; this is roughly how long that takes.
const MINI_MINUTES = 3.5;

export function initPlan(deps) {
  d = deps;
  host = document.querySelector(".plan-page");
  if (!host) return;
  host.addEventListener("click", onHostClick);
  // The sticky week header follows the scroll.
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => { ticking = false; syncUnitHeader(); });
  }, { passive: true });
}

export function showPlan() {
  if (!host || d.isGameRunning()) return;
  d.appShell.classList.remove(...d.sectionResetClasses);
  d.appShell.classList.add("plan-open");
  d.setActiveTab("plan");
  d.setPageHeader("Plan", "Your plan to reverse brainrot, one step at a time.");
  selectedKey = null;
  guideOpen = false;
  editOpen = false;
  renderPlan();
  // After the page's own enter work, so the current stop ends up on screen.
  window.requestAnimationFrame(() => window.requestAnimationFrame(revealCurrent));
}

function isOpen() { return d?.appShell.classList.contains("plan-open"); }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export function loadPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAN_KEY));
    if (saved && saved.v === PLAN_VERSION && Array.isArray(saved.steps)) return saved;
  } catch { /* fall through */ }
  return null;
}
function savePlan(plan) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch { /* private mode */ }
}
export function hasPlan() { return Boolean(loadPlan()); }

// Goals and minutes a day: answered in onboarding or in the Plan's editor.
export function loadPlanPrefs() {
  try { return normalizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY))); } catch { return null; }
}
function normalizePrefs(raw) {
  if (!raw || typeof raw !== "object") return null;
  const goals = Array.isArray(raw.goals) ? raw.goals.filter((id) => GOALS.some((g) => g.id === id)).slice(0, 2) : [];
  const minutes = MINUTE_OPTIONS.includes(Number(raw.minutes)) ? Number(raw.minutes) : DEFAULT_PREFS.minutes;
  return goals.length ? { goals, minutes } : null;
}
// A plan counts as under way once a step the person did themselves is done.
// The baseline step is ticked by the generator when a sitting already exists.
function planStarted(plan) {
  return plan.steps.some((s, i) => s.done && !(i === 0 && s.kind === "iq"));
}
function latestRecord() { return (d?.loadCatSessions?.() ?? [])[0] ?? null; }

// Save the answers and build the plan from them. A plan already under way is
// kept unless `rebuild` is set (the editor); the same answers on an untouched
// plan keep that plan too, so re-saving does not reshuffle the road.
export function setPlanPrefs(raw, { rebuild = false } = {}) {
  const prefs = normalizePrefs(raw);
  if (!prefs) return loadPlan();
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  const existing = loadPlan();
  if (existing && !rebuild) {
    const same = existing.minutes === prefs.minutes && existing.goals.join() === prefs.goals.join();
    if (same || planStarted(existing)) return existing;
  }
  const plan = buildPlan({ ...prefs, record: latestRecord() });
  savePlan(plan);
  if (isOpen()) renderPlan();
  return plan;
}

// The Plan tab always has a road: without answers it is built from defaults.
function ensurePlan() {
  const existing = loadPlan();
  if (existing) return existing;
  const plan = buildPlan({ ...(loadPlanPrefs() ?? DEFAULT_PREFS), record: latestRecord() });
  savePlan(plan);
  return plan;
}

// The two questions as markup, shared with the onboarding. `attr` names the
// data attribute the host's click handler listens for.
export function planGoalButtonsHtml(selected, attr) {
  return GOALS.map((g) => {
    const on = selected.includes(g.id);
    return `<button class="plan-goal${on ? " is-on" : ""}" ${attr}="${g.id}" type="button" aria-pressed="${on}"><strong>${esc(g.label)}</strong><span>${esc(g.blurb)}</span></button>`;
  }).join("");
}
export function planMinuteButtonsHtml(minutes, attr) {
  return MINUTE_OPTIONS.map((m) => {
    const on = minutes === m;
    return `<button class="plan-minute${on ? " is-on" : ""}" ${attr}="${m}" type="button" role="radio" aria-checked="${on}"><b>${m}</b><span>min</span></button>`;
  }).join("");
}

function currentStepIndex(plan) {
  const i = plan.steps.findIndex((s) => !s.done);
  return i < 0 ? plan.steps.length : i;
}
function stepNeedsPass(index) { return index >= FREE_STEPS && !d.planUnlocked(); }

// Editor draft (goals, minutes), kept while the "Change goals" card is open.
let draft = { goals: [], minutes: 15 };
let editOpen = false;      // the "Change goals" card over the road
let selectedKey = null;    // the stop whose bubble is open: a step id, or "c<week>" for a chest
let guideOpen = false;     // the Guide card under the week header

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedPick(rand, weights, exclude = new Set()) {
  const entries = Object.entries(weights).filter(([k, w]) => w > 0 && !exclude.has(k));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = rand() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries.at(-1)[0];
}

// The latest sitting's two weakest indices, lowest first (empty without one).
function weakestIndices(record) {
  if (!record?.indices) return [];
  const ranked = rankedIndices(record.indices);
  return ranked.slice(-2).reverse().map((e) => e.key);
}

export function buildPlan({ goals, minutes, record, seed = Date.now() }) {
  const rand = mulberry32(seed);
  const goalDefs = goals.map((id) => GOALS.find((g) => g.id === id)).filter(Boolean);
  const weak = weakestIndices(record);

  // Index weights: everything 1; weakest 3, second weakest 2; goal indices +2.
  const indexWeights = Object.fromEntries(MEASUREMENT_INDEX_ORDER.map((k) => [k, 1]));
  if (weak[0]) indexWeights[weak[0]] += 2;
  if (weak[1]) indexWeights[weak[1]] += 1;
  goalDefs.forEach((g) => g.indices.forEach((k) => { indexWeights[k] += 2; }));
  // "Raise my IQ" with no sitting yet: spread evenly; the retest fixes it later.

  // Exercise weights: 1 each; goal exercises +2; weak-index exercises +1.
  const exerciseWeights = Object.fromEntries(ALL_EXERCISES.map((id) => [id, 1]));
  goalDefs.forEach((g) => g.exercises.forEach((id) => { exerciseWeights[id] += 2; }));
  weak.forEach((k) => INDEX_EXERCISES[k].forEach((id) => { exerciseWeights[id] += 1; }));

  const blocksPerStep = minutes >= 25 ? 4 : minutes >= 15 ? 3 : 2;
  const classicMinutesByWeek = [3, 4, 5, 5];

  const steps = [];
  let lastFocus = null;
  for (let week = 0; week < WEEKS; week += 1) {
    for (let n = 0; n < STEPS_PER_WEEK; n += 1) {
      const index = week * STEPS_PER_WEEK + n;
      if (index === 0) {
        steps.push({ id: `s${index}`, week, kind: "iq", title: "Your baseline", blurb: "Six abilities, one score. The plan is built around your weakest two.", done: null });
        continue;
      }
      if (index === WEEKS * STEPS_PER_WEEK - 1) {
        steps.push({ id: `s${index}`, week, kind: "retest", title: "Retake the IQ test", blurb: "Four weeks on: same test, see what moved.", done: null });
        continue;
      }
      const focus = weightedPick(rand, indexWeights, new Set(lastFocus ? [lastFocus] : []));
      lastFocus = focus;
      // Two blocks from the focus index, the rest from the wider pool.
      const picked = [];
      const focusPool = Object.fromEntries(INDEX_EXERCISES[focus].map((id) => [id, exerciseWeights[id]]));
      while (picked.length < Math.min(2, blocksPerStep)) {
        const id = weightedPick(rand, focusPool, new Set(picked));
        if (!id) break;
        picked.push(id);
      }
      while (picked.length < blocksPerStep) {
        const id = weightedPick(rand, exerciseWeights, new Set(picked));
        if (!id) break;
        picked.push(id);
      }
      const classicMinutes = classicMinutesByWeek[week];
      const blocks = picked.map((exerciseId) => ({
        exerciseId,
        timeMinutes: CLASSIC.has(exerciseId) ? classicMinutes : null,
        easy: week === 0
      }));
      steps.push({
        id: `s${index}`, week, kind: "train", focus,
        title: INDEX_TITLES[focus],
        blurb: MEASUREMENT_INDICES[focus].blurb,
        blocks,
        minutes: estimateMinutes(blocks),
        done: null,
        replays: 0
      });
    }
  }

  const plan = {
    v: PLAN_VERSION,
    createdAt: new Date().toISOString(),
    seed,
    goals,
    minutes,
    weak,
    baseline: record ? { id: record.id, score: Math.round(record.score), completedAt: record.completedAt } : null,
    retest: null,
    steps
  };
  // A sitting already on file is the baseline: step one is done before it starts.
  if (record) plan.steps[0].done = record.completedAt ?? plan.createdAt;
  return plan;
}

function estimateMinutes(blocks) {
  const total = blocks.reduce((sum, b) => sum + (b.timeMinutes ?? MINI_MINUTES), 0);
  return Math.max(1, Math.round(total));
}

// ---------------------------------------------------------------------------
// Events from the rest of the app
// ---------------------------------------------------------------------------
// A sitting was saved: it completes a pending IQ step, or the retest at the end.
export function notifyIqSitting(record) {
  const plan = loadPlan();
  if (!plan || !record) return;
  const current = currentStepIndex(plan);
  const step = plan.steps[current];
  if (!step || (step.kind !== "iq" && step.kind !== "retest")) return;
  step.done = record.completedAt ?? new Date().toISOString();
  if (step.kind === "iq") plan.baseline = { id: record.id, score: Math.round(record.score), completedAt: record.completedAt };
  if (step.kind === "retest") plan.retest = { id: record.id, score: Math.round(record.score), completedAt: record.completedAt };
  savePlan(plan);
  if (isOpen()) renderPlan();
}

// A plan routine ran to the end. Ids are "plan:<stepId>".
function completeStep(stepId) {
  const plan = loadPlan();
  if (!plan) return;
  const index = plan.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return;
  const step = plan.steps[index];
  if (step.done) step.replays = (step.replays ?? 0) + 1;
  else step.done = new Date().toISOString();
  savePlan(plan);
  selectedKey = null;
  const done = plan.steps.filter((s) => s.done).length;
  showPlan();
  d.showToast?.(done >= plan.steps.length ? "Plan complete." : `Step ${index + 1} done.`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function startStep(plan, index) {
  const step = plan.steps[index];
  if (!step) return;
  if (stepNeedsPass(index) && !step.done) { d.openPricingModal(); return; }
  if (step.kind === "iq" || step.kind === "retest") { d.startIqTest(); return; }
  const routine = {
    id: `plan:${step.id}`,
    name: `Step ${index + 1} · ${step.title}`,
    blocks: step.blocks.map((b) => {
      const block = d.createRoutineBlock(b.exerciseId);
      if (b.timeMinutes) block.timeMinutes = b.timeMinutes;
      if (b.easy && d.easySettings?.[b.exerciseId]) block.settings = { ...block.settings, ...d.easySettings[b.exerciseId] };
      return block;
    }),
    onComplete: () => completeStep(step.id)
  };
  d.startRoutine(routine);
}

function onHostClick(event) {
  const t = event.target;
  const goal = t.closest("[data-plan-goal]");
  if (goal) {
    const id = goal.dataset.planGoal;
    if (draft.goals.includes(id)) draft.goals = draft.goals.filter((g) => g !== id);
    else if (draft.goals.length < 2) draft.goals = [...draft.goals, id];
    renderPlan();
    return;
  }
  const mins = t.closest("[data-plan-minutes]");
  if (mins) { draft.minutes = Number(mins.dataset.planMinutes); renderPlan(); return; }
  if (t.closest("[data-plan-build]")) {
    if (!draft.goals.length) return;
    editOpen = false;
    guideOpen = false;
    selectedKey = null;
    setPlanPrefs({ goals: draft.goals, minutes: draft.minutes }, { rebuild: true });
    renderPlan();
    d.showToast?.("Plan rebuilt.");
    return;
  }
  if (t.closest("[data-plan-edit]")) {
    const plan = loadPlan();
    draft = { goals: [...(plan?.goals ?? [])], minutes: plan?.minutes ?? DEFAULT_PREFS.minutes };
    editOpen = !editOpen;
    guideOpen = false;
    selectedKey = null;
    renderPlan();
    if (editOpen) host.querySelector(".plan-editor")?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (t.closest("[data-plan-edit-cancel]")) { editOpen = false; renderPlan(); return; }
  const start = t.closest("[data-plan-start]");
  if (start) { const plan = loadPlan(); if (plan) startStep(plan, Number(start.dataset.planStart)); return; }
  // Pro mode hides every [data-open-pricing] control, so the Plan's own
  // Pass buttons use their own hook.
  if (t.closest("[data-plan-pass]")) { d.openPricingModal(); return; }
  if (t.closest("[data-plan-guide]")) { guideOpen = !guideOpen; renderPlan(); return; }
  const node = t.closest("[data-plan-step]");
  if (node) { togglePop(`s${node.dataset.planStep}`); return; }
  const chest = t.closest("[data-plan-chest]");
  if (chest) { togglePop(`c${chest.dataset.planChest}`); return; }
  // A tap on the empty road closes whatever bubble is open.
  if (selectedKey && t.closest(".plan-road") && !t.closest(".plan-pop")) { selectedKey = null; renderPlan(); return; }
  if (t.closest("[data-plan-next-cycle]")) {
    const plan = loadPlan();
    if (!plan) return;
    const record = (d.loadCatSessions() ?? [])[0] ?? null;
    savePlan(buildPlan({ goals: plan.goals, minutes: plan.minutes, record }));
    selectedKey = null;
    renderPlan();
    return;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
export function renderPlan() {
  if (!host) return;
  host.innerHTML = roadHtml(ensurePlan());
  window.requestAnimationFrame(syncUnitHeader);
}

const esc = (v) => d.escapeHtml(v);

// "Change goals": the two questions again, over the road. Rebuilding starts a
// fresh four weeks from step one.
function editorHtml(plan) {
  const record = latestRecord();
  const weak = weakestIndices(record);
  const profileLine = weak.length
    ? `Your last sitting puts <b>${esc(INDEX_TITLES[weak[0]].toLowerCase())}</b> and <b>${esc(INDEX_TITLES[weak[1]].toLowerCase())}</b> lowest. The plan leans into both.`
    : `No sitting yet. Step one is the IQ test, and the plan tunes itself to the result.`;
  const note = planStarted(plan) ? "Rebuilding starts a fresh four weeks from step one. Progress on this plan resets." : "Rebuilding starts a fresh four weeks from step one.";
  return `
      <section class="plan-card plan-setup plan-editor" aria-label="Change goals">
        <p class="plan-eyebrow">1 · What do you want to work on?</p>
        <p class="plan-help">Pick up to two.</p>
        <div class="plan-goals" role="group" aria-label="Goals">${planGoalButtonsHtml(draft.goals, "data-plan-goal")}</div>

        <p class="plan-eyebrow">2 · How long each day?</p>
        <div class="plan-minutes" role="radiogroup" aria-label="Minutes a day">${planMinuteButtonsHtml(draft.minutes, "data-plan-minutes")}</div>

        <p class="plan-profile">${profileLine} ${esc(note)}</p>
        <div class="plan-edit-actions">
          <button class="battle-primary home-cta plan-build" data-plan-build type="button" ${draft.goals.length ? "" : "disabled"}>Rebuild my plan</button>
          <button class="battle-link" data-plan-edit-cancel type="button">Cancel</button>
        </div>
      </section>`;
}

// ---- the road ----
// Stops snake down the column on a sine wave, eight stops to a full swing.
// --k is the stop's place on that wave; the CSS multiplies it by --plan-amp.
function waveK(pos) { return Math.round(Math.sin((pos * Math.PI) / 4) * 100) / 100; }

function roadHtml(plan) {
  const current = currentStepIndex(plan);
  const total = plan.steps.length;
  const done = plan.steps.filter((s) => s.done).length;
  const finished = current >= total;
  const unlocked = d.planUnlocked();

  let pos = 0;
  let body = "";
  for (let w = 0; w < WEEKS; w += 1) {
    if (w > 0) body += `<li class="plan-week" data-week="${w}" aria-label="Week ${w + 1}"><span>Week ${w + 1} · ${esc(WEEK_THEMES[w].name)}</span></li>`;
    plan.steps.forEach((step, index) => {
      if (step.week !== w) return;
      body += stepHtml(plan, step, index, current, pos);
      pos += 1;
      // The paywall starts right after the baseline; the divider says so.
      if (!unlocked && index === FREE_STEPS - 1 && !finished) body += gateHtml();
    });
    if (w < WEEKS - 1) { body += chestHtml(plan, w, pos); pos += 1; }
  }

  return `
    <div class="plan is-road" style="--plan-progress:${((done / total) * 100).toFixed(1)}%">
      ${unitHeaderHtml(plan, current, finished, done)}
      ${editOpen ? editorHtml(plan) : ""}
      ${guideOpen ? guideHtml(plan, current, finished) : ""}
      ${finished ? finishedHtml(plan) : ""}
      <ol class="plan-road">${body}</ol>
    </div>`;
}

// The sticky card at the top: the plan's name, which week is on screen, how
// far along the plan is, and the Guide button. syncUnitHeader() updates the
// eyebrow on scroll.
function unitHeaderHtml(plan, current, finished, done) {
  const total = plan.steps.length;
  const week = finished ? WEEKS - 1 : plan.steps[current].week;
  const stepLabel = `Step ${Math.min(current + 1, total)} of ${total}`;
  const eyebrow = finished ? "Plan complete" : `Week ${week + 1} of ${WEEKS} · ${stepLabel}`;
  const title = finished ? "Four weeks done" : PLAN_NAME;
  return `
    <header class="plan-unit" data-week="${week}" data-current-week="${week}" data-step-label="${esc(stepLabel)}" data-finished="${finished ? 1 : 0}">
      <div class="plan-unit-text">
        <p class="plan-unit-eyebrow">${esc(eyebrow)}</p>
        <h2>${esc(title)}</h2>
      </div>
      <button class="plan-unit-btn${guideOpen ? " is-on" : ""}" data-plan-guide type="button" aria-expanded="${guideOpen}" aria-label="Plan guide">${bookSvg()}<span>Guide</span></button>
      <div class="plan-unit-bar" role="progressbar" aria-label="Plan progress" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}"><i></i></div>
    </header>`;
}

// Point the sticky header's eyebrow at whichever week's stops are under it.
function syncUnitHeader() {
  if (!host || !isOpen()) return;
  const unit = host.querySelector(".plan-unit");
  if (!unit || unit.dataset.finished === "1") return;
  const line = unit.getBoundingClientRect().bottom + 28;
  const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  let week = 0;
  host.querySelectorAll(".plan-week[data-week]").forEach((el) => {
    if (atEnd || el.getBoundingClientRect().top < line) week = Number(el.dataset.week);
  });
  if (unit.dataset.week === String(week)) return;
  unit.dataset.week = String(week);
  const own = unit.dataset.currentWeek === String(week);
  unit.querySelector(".plan-unit-eyebrow").textContent = `Week ${week + 1} of ${WEEKS} · ${own ? unit.dataset.stepLabel : WEEK_THEMES[week].name}`;
}

// Opening the tab lands on the current stop when it is below the fold.
function revealCurrent() {
  if (!host || !isOpen()) return;
  const node = host.querySelector(".plan-step.is-current .plan-node");
  if (!node) return;
  const r = node.getBoundingClientRect();
  if (r.top >= 140 && r.bottom <= window.innerHeight - 140) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - window.innerHeight * 0.42), behavior: "auto" });
}

function togglePop(key) {
  selectedKey = selectedKey === key ? null : key;
  renderPlan();
  if (!selectedKey) return;
  host.querySelector(".plan-pop")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// The Guide: what this plan is aiming at and what each week does.
function guideHtml(plan, current, finished) {
  const total = plan.steps.length;
  const week = finished ? WEEKS : plan.steps[current].week + 1;
  const streak = d.trainingStreak?.() ?? 0;
  const goalLabels = plan.goals.map((id) => GOALS.find((g) => g.id === id)?.phrase).filter(Boolean);
  const sub = `${goalLabels.length ? capitalize(joinAnd(goalLabels)) : "Your plan"}, ${plan.minutes} minutes a day.`;
  const weakLine = plan.weak.length
    ? `Leaning into <b>${esc(INDEX_TITLES[plan.weak[0]].toLowerCase())}</b> and <b>${esc(INDEX_TITLES[plan.weak[1]].toLowerCase())}</b>, the two lowest in the sitting this plan was built from.`
    : `Built without a sitting. The test at step one decides what the next cycle leans into.`;
  return `
    <section class="plan-card plan-guide" aria-label="Plan guide">
      <p class="plan-guide-sub">${esc(sub)}</p>
      <p class="plan-profile">${weakLine}</p>
      <div class="plan-progress-row">
        <div><span class="battle-eyebrow">Step</span><strong>${Math.min(current + 1, total)}<i>/${total}</i></strong></div>
        <div><span class="battle-eyebrow">Week</span><strong>${week}<i>/${WEEKS}</i></strong></div>
        <div><span class="battle-eyebrow">Streak</span><strong>${streak}<i> day${streak === 1 ? "" : "s"}</i></strong></div>
      </div>
      <ol class="plan-guide-weeks">
        ${WEEK_THEMES.map((t, i) => {
          const weekDone = plan.steps.filter((s) => s.week === i).every((s) => s.done);
          return `<li class="${weekDone ? "is-done" : ""}${!finished && i === week - 1 ? " is-current" : ""}"><span class="plan-guide-num">${weekDone ? checkSvg() : i + 1}</span><div><strong>Week ${i + 1} · ${esc(t.name)}</strong><p>${esc(t.blurb)}</p></div></li>`;
        }).join("")}
      </ol>
      <footer class="plan-guide-foot">
        <button class="battle-link" data-plan-edit type="button">Change goals or time</button>
      </footer>
    </section>`;
}

function stepHtml(plan, step, index, current, pos) {
  const isDone = Boolean(step.done);
  const isCurrent = index === current;
  const locked = index > current;
  const needsPass = stepNeedsPass(index) && !isDone;
  const open = selectedKey === step.id;
  const cls = ["plan-step"];
  if (isDone) cls.push("is-done");
  if (isCurrent) cls.push("is-current");
  if (locked) cls.push("is-locked");
  if (needsPass) cls.push("needs-pass");
  if (open) cls.push("is-open");

  const icon = step.kind === "retest" ? trophySvg() : step.kind === "iq" ? d.iqIcon() : d.exerciseIcon(step.blocks[0].exerciseId);
  const face = isDone ? checkSvg() : icon;
  // Every Pass-gated stop shows what it is; the badge says it is paywalled.
  const badge = needsPass ? `<span class="plan-node-badge" aria-hidden="true">${lockSvg()}</span>` : "";
  const weekSteps = plan.steps.filter((s) => s.week === step.week);
  const arc = Math.round((weekSteps.filter((s) => s.done).length / weekSteps.length) * 100);
  const tip = isCurrent && !open ? `<span class="plan-tip" aria-hidden="true">${needsPass ? "Unlock" : step.kind === "train" ? "Start" : "Test"}</span>` : "";

  return `
    <li class="${cls.join(" ")}" style="--k:${waveK(pos)}">
      <div class="plan-node-wrap">
        ${tip}
        <button class="plan-node" data-plan-step="${index}" type="button" aria-label="Step ${index + 1}: ${esc(step.title)}${needsPass ? " (Cogni Pass)" : ""}" aria-expanded="${open}" style="--arc:${arc}%">
          ${isCurrent ? '<span class="plan-node-ring" aria-hidden="true"></span>' : ""}
          <span class="plan-node-face"><span class="plan-node-icon">${face}</span></span>
          ${badge}
        </button>
      </div>
      ${open ? popHtml(plan, step, index, current, { isDone, isCurrent, locked, needsPass }) : ""}
    </li>`;
}

// The bubble under a tapped stop. Charcoal for the current step and for any
// Pass-gated step (it sells the Pass), a plain card for a finished one, a flat
// grey note for a step a Pass holder has not reached yet.
function popHtml(plan, step, index, current, s) {
  const total = plan.steps.length;
  const meta = step.kind === "train"
    ? `${step.blocks.length} exercises · ~${step.minutes} min`
    : step.kind === "iq"
      ? (s.isDone && plan.baseline ? (d.planUnlocked() ? `IQ ${plan.baseline.score}` : "Taken · score with Cogni Pass") : "About 15 minutes")
      : (s.isDone && plan.retest ? (d.planUnlocked() ? `IQ ${plan.retest.score}` : "Taken · score with Cogni Pass") : "Same test, four weeks on");
  const chips = step.kind === "train"
    ? `<ul class="plan-chips">${step.blocks.map((b) => `<li>${esc(EXERCISE_NAMES[b.exerciseId] ?? b.exerciseId)}${b.timeMinutes ? ` <i>${b.timeMinutes} min</i>` : ""}</li>`).join("")}</ul>`
    : "";

  let tone = "is-current";
  let body = "";
  if (s.needsPass) {
    tone = "is-current is-pass";
    body = `<p class="plan-pop-note">${esc(step.blurb)}</p>${chips}<p class="plan-pop-note">${PLAN_NAME} is part of Cogni Pass: every training step and the retest, ${total - FREE_STEPS} steps in all.</p><button class="plan-pop-btn" data-plan-pass type="button">Get Cogni Pass</button>`;
  } else if (s.locked) {
    tone = "is-locked";
    body = `${chips}<p class="plan-pop-note">Finish step ${current + 1} first.</p>`;
  } else if (s.isDone) {
    tone = "is-done";
    body = `${chips}<button class="plan-pop-btn" data-plan-start="${index}" type="button">${step.kind === "train" ? "Practice again" : "Open the test"}</button>`;
  } else {
    body = `<p class="plan-pop-note">${esc(step.blurb)}</p>${chips}<button class="plan-pop-btn" data-plan-start="${index}" type="button">${step.kind === "train" ? "Start" : step.kind === "iq" ? "Take the test" : "Retake the test"}</button>`;
  }

  return `
    <div class="plan-pop ${tone}" role="group" aria-label="Step ${index + 1}">
      <p class="plan-pop-eyebrow">Step ${index + 1} of ${total}${s.isDone ? " · Done" : s.needsPass ? " · Pass" : ""}</p>
      <h3>${esc(step.title)}</h3>
      <p class="plan-pop-meta">${esc(meta)}</p>
      ${body}
    </div>`;
}

// A chest closes each of the first three weeks; it opens with the week's recap.
function chestHtml(plan, w, pos) {
  const weekSteps = plan.steps.filter((s) => s.week === w);
  const complete = weekSteps.every((s) => s.done);
  const key = `c${w}`;
  const open = selectedKey === key;
  const mins = weekSteps.reduce((sum, s) => sum + (s.kind === "train" ? s.minutes : 15), 0);
  const replays = weekSteps.reduce((sum, s) => sum + (s.replays ?? 0), 0);
  const recap = complete
    ? `${weekSteps.length} steps · about ${mins} minutes${replays ? ` · ${replays} replay${replays === 1 ? "" : "s"}` : ""}`
    : `Finish week ${w + 1} to open this.`;
  return `
    <li class="plan-chest${complete ? " is-done" : " is-locked"}${open ? " is-open" : ""}" style="--k:${waveK(pos)}">
      <div class="plan-node-wrap">
        <button class="plan-chest-btn" data-plan-chest="${w}" type="button" aria-label="Week ${w + 1} recap" aria-expanded="${open}">${chestSvg()}</button>
      </div>
      ${open ? `
      <div class="plan-pop ${complete ? "is-done" : "is-locked"}" role="group" aria-label="Week ${w + 1} recap">
        <p class="plan-pop-eyebrow">Week ${w + 1} · ${esc(WEEK_THEMES[w].name)}</p>
        <h3>${complete ? "Week done" : "Not yet"}</h3>
        <p class="plan-pop-meta">${esc(recap)}</p>
      </div>` : ""}
    </li>`;
}

function gateHtml() {
  return `<li class="plan-gate" aria-label="Cogni Pass from here"><button data-plan-pass type="button">${lockSvg()}<span>Cogni Pass from here</span></button></li>`;
}

function finishedHtml(plan) {
  const before = d.planUnlocked() ? plan.baseline?.score ?? null : null;
  const after = d.planUnlocked() ? plan.retest?.score ?? null : null;
  const delta = before != null && after != null ? after - before : null;
  return `
    <section class="plan-card plan-finished">
      <p class="plan-eyebrow">Four weeks done</p>
      <div class="plan-finished-scores">
        <div><span class="battle-eyebrow">Before</span><strong>${before ?? "—"}</strong></div>
        <span class="plan-finished-arrow" aria-hidden="true">→</span>
        <div><span class="battle-eyebrow">After</span><strong>${after ?? "—"}</strong></div>
        ${delta != null ? `<b class="plan-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}">${delta > 0 ? "+" : ""}${delta}</b>` : ""}
      </div>
      <p class="plan-blurb">${delta == null ? "Both sittings in, the change shows here." : delta >= 5 ? "That is a real move. The next cycle builds on the new profile." : delta > 0 ? "Up a little. Four more weeks usually shows more." : "Scores wobble by a few points between sittings. The next cycle re-aims at what is lowest now."}</p>
      <button class="battle-primary home-cta" data-plan-next-cycle type="button">Start the next four weeks</button>
    </section>`;
}

function checkSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>`;
}
function lockSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
}
function trophySvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a2.5 2.5 0 0 0 2.7 3.4M16.5 6H19a2.5 2.5 0 0 1-2.7 3.4"/><path d="M12 14v3M9 20.5h6M10.2 17h3.6v3.5h-3.6z"/></svg>`;
}
function bookSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5z"/><path d="M4.5 18.5A2.5 2.5 0 0 1 7 16h12.5"/><path d="M9.5 7.5h6M9.5 11h4"/></svg>`;
}
function chestSvg() {
  return `<svg viewBox="0 0 56 46" aria-hidden="true"><rect x="4" y="18" width="48" height="24" rx="5" fill="currentColor" opacity=".55"/><path d="M4 20a10 10 0 0 1 10-10h28a10 10 0 0 1 10 10v3H4z" fill="currentColor"/><rect x="4" y="22" width="48" height="2.5" fill="var(--bg)" opacity=".55"/><rect x="22" y="17" width="12" height="12" rx="3" fill="var(--bg)"/><circle cx="28" cy="22" r="1.8" fill="currentColor"/><path d="M28 23v2.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}
function joinAnd(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
