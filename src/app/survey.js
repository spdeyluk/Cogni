// Cogni · The two question runs around the test.
// ---------------------------------------------------------------------------
// Tap-to-answer screens in the onboarding's visual language.
//   "profile" — the first time a test is started: age, gender, education,
//               email. All required, four taps and a field.
//   "plan"    — the moment the first test finishes, before the report opens:
//               what to improve on and how long each day (required), then
//               screen time, games + ranks, and what fills your days (all
//               skippable). The answers rebuild the four-week plan.
// Everything lives in one record in localStorage under a "cogni." key, so
// account sync carries it between devices like the rest of the app state, and
// each finished run is also upserted into public.survey_responses (d.persist).
// ---------------------------------------------------------------------------
import { PLAN_GOALS, PLAN_MINUTES } from "./plan.js";

let d = null;
const KEY = "cogni.profileSurvey.v1";
const VERSION = 1;

const AGE = [["u18", "Under 18"], ["18-24", "18–24"], ["25-34", "25–34"], ["35-44", "35–44"], ["45-54", "45–54"], ["55-64", "55–64"], ["65+", "65+"]];
const GENDER = [["woman", "Woman"], ["man", "Man"], ["nonbinary", "Non-binary"], ["na", "Prefer not to say"]];
const EDUCATION = [["school", "Still in school"], ["highschool", "High school"], ["college", "Some college"], ["bachelor", "Bachelor's"], ["master", "Master's"], ["doctorate", "Doctorate"], ["other", "Other"]];
const SCREEN = [["lt2", "Under 2 hours"], ["2-4", "2–4 hours"], ["4-6", "4–6 hours"], ["6-8", "6–8 hours"], ["8+", "More than 8 hours"]];
const TIERS = {
  lol: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"],
  valorant: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant"],
  dota2: ["Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"],
  fortnite: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Elite", "Champion", "Unreal"],
  rocket: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion", "Grand Champion", "Supersonic Legend"],
  apex: ["Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Apex Predator"],
  ow2: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster", "Champion"],
  cod: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crimson", "Iridescent", "Top 250"],
  brawl: ["Bronze", "Silver", "Gold", "Diamond", "Mythic", "Legendary", "Masters", "Pro"]
};
const GAMES = [
  { id: "chess", label: "Chess", rankTitle: "Your chess rating", ranks: ["Under 800", "800–1200", "1200–1600", "1600–2000", "2000+"] },
  { id: "lol", label: "League of Legends", ranks: TIERS.lol },
  { id: "valorant", label: "Valorant", ranks: TIERS.valorant },
  { id: "cs2", label: "Counter-Strike 2", rankTitle: "Your Premier rating in CS2", ranks: ["Under 5,000", "5,000–10,000", "10,000–15,000", "15,000–20,000", "20,000–25,000", "25,000+"] },
  { id: "dota2", label: "Dota 2", ranks: TIERS.dota2 },
  { id: "fortnite", label: "Fortnite", ranks: TIERS.fortnite },
  { id: "rocket", label: "Rocket League", ranks: TIERS.rocket },
  { id: "apex", label: "Apex Legends", ranks: TIERS.apex },
  { id: "ow2", label: "Overwatch 2", ranks: TIERS.ow2 },
  { id: "cod", label: "Call of Duty", ranks: TIERS.cod },
  { id: "tft", label: "Teamfight Tactics", ranks: TIERS.lol },
  { id: "clash", label: "Clash Royale", rankTitle: "Your trophies in Clash Royale", ranks: ["Under 4,000", "4,000–6,000", "6,000–8,000", "8,000+"] },
  { id: "brawl", label: "Brawl Stars", ranks: TIERS.brawl },
  { id: "other", label: "Other games" },
  { id: "none", label: "I don't play games", exclusive: true }
];
const INTERESTS = [
  ["student", "Student"], ["software", "Software & engineering"], ["finance", "Finance & trading"], ["content", "Content creation"],
  ["design", "Design & art"], ["music", "Music"], ["writing", "Writing"], ["science", "Science & research"],
  ["health", "Medicine & health"], ["law", "Law"], ["teaching", "Teaching"], ["business", "Business & startups"],
  ["marketing", "Sales & marketing"], ["gaming", "Gaming"], ["sports", "Sports & fitness"], ["cooking", "Cooking"],
  ["reading", "Reading"], ["languages", "Languages"], ["puzzles", "Puzzles & chess"], ["crafts", "Crafts & DIY"],
  ["photo", "Photography & film"], ["travel", "Travel"]
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initSurvey(deps) { d = deps; }

export function loadSurvey() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.v === VERSION ? saved : null;
  } catch { return null; }
}
// The about-you run is done once it has been completed on any device.
export function profileSurveyDone() { return Boolean(loadSurvey()?.completedAt); }
// The plan run is done once answered here, or when the plan already has
// preferences from an earlier version that asked them during onboarding.
export function planSurveyDone() { return Boolean(loadSurvey()?.planAt) || Boolean(d?.planPrefsExist?.()); }
function save(answers) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...answers })); } catch { /* private mode */ }
}
function blank() {
  return {
    age: null, gender: null, education: null, email: null,
    goals: [], minutes: null, screenTime: null, games: [], ranks: {}, interests: [], skipped: [],
    startedAt: new Date().toISOString(), completedAt: null, planAt: null
  };
}

// The screens of each run, in order. Rank screens appear for each ranked game picked.
function steps(kind, a) {
  if (kind === "profile") {
    return [
      { id: "age", kind: "single", key: "age", required: true, eyebrow: "About you", title: "How old are you?", options: AGE, cols: 2 },
      { id: "gender", kind: "single", key: "gender", required: true, eyebrow: "About you", title: "How do you identify?", options: GENDER, cols: 2 },
      { id: "education", kind: "single", key: "education", required: true, eyebrow: "About you", title: "Your education so far?", body: "The highest level you have finished or are in now.", options: EDUCATION, cols: 2 },
      { id: "email", kind: "email", key: "email", required: true, eyebrow: "About you", title: "Where should your results go?", body: "Your report and plan are tied to this address.", placeholder: "you@example.com" }
    ];
  }
  const list = [
    { id: "goals", kind: "multi", key: "goals", required: true, max: 2, eyebrow: "Your plan to reverse brainrot", title: "What do you want to improve?", body: "Pick up to two. Your four-week plan is built around it.", options: PLAN_GOALS.map((g) => [g.id, g.label, g.blurb]), cols: 2 },
    { id: "minutes", kind: "single", key: "minutes", required: true, eyebrow: "Your plan to reverse brainrot", title: "How long each day?", body: "Short and daily beats long and rare. You can change this any time.", options: PLAN_MINUTES.map((m) => [String(m), `${m} minutes`]), cols: 3 },
    { id: "screen", kind: "single", key: "screenTime", eyebrow: "Your days", title: "How much screen time a day?", body: "Phone and computer together, roughly.", options: SCREEN, cols: 2 },
    { id: "games", kind: "multi", key: "games", eyebrow: "Your games", title: "Which games do you play?", body: "Tick any. We ask your rank next.", options: GAMES.map((g) => [g.id, g.label]), cols: 3, wide: true }
  ];
  for (const id of a.games) {
    const g = GAMES.find((x) => x.id === id);
    if (!g?.ranks) continue;
    list.push({ id: `rank:${g.id}`, kind: "single", key: ["ranks", g.id], eyebrow: "Your games", title: g.rankTitle || `Your rank in ${g.label}`, body: "Your current rank, or the one you held most recently.", options: [...g.ranks.map((r) => [r, r]), ["unranked", "Unranked"]], cols: 2 });
  }
  list.push({ id: "interests", kind: "multi", key: "interests", eyebrow: "Your days", title: "What fills your days?", body: "Work, study, hobbies. Tick everything that applies.", options: INTERESTS, cols: 3, wide: true });
  return list;
}
const getAnswer = (a, key) => Array.isArray(key) ? a[key[0]]?.[key[1]] ?? null : a[key];
function setAnswer(a, key, value) {
  if (Array.isArray(key)) { a[key[0]] = { ...(a[key[0]] ?? {}), [key[1]]: value }; return; }
  a[key] = value;
}
function clearAnswer(a, key) {
  if (Array.isArray(key)) { if (a[key[0]]) delete a[key[0]][key[1]]; return; }
  a[key] = Array.isArray(a[key]) ? [] : null;
}
function answered(step, a) {
  const value = getAnswer(a, step.key);
  if (step.kind === "multi") return (value ?? []).length > 0;
  if (step.kind === "email") return EMAIL_RE.test(String(value ?? "").trim());
  return value != null;
}

export function runProfileSurvey(onDone = () => {}) {
  if (profileSurveyDone()) { onDone(); return; }
  runSurvey("profile", onDone);
}
export function runPlanSurvey(onDone = () => {}) {
  if (planSurveyDone()) { onDone(); return; }
  runSurvey("plan", onDone);
}

// One run of screens over the app; `onDone` runs when the last one is answered.
function runSurvey(kind, onDone) {
  if (document.querySelector("#profile-survey")) return;
  const esc = (v) => d.escapeHtml(v);
  const answers = { ...blank(), ...(loadSurvey() ?? {}) };
  if (kind === "profile") { answers.completedAt = null; if (!answers.email) answers.email = d.accountEmail?.() || null; }
  else answers.planAt = null;
  let index = 0;
  let timer = null;

  const overlay = document.createElement("div");
  overlay.className = `web-onboarding profile-survey is-${kind}`;
  overlay.id = "profile-survey";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", kind === "profile" ? "About you" : "Your plan");
  overlay.innerHTML = `
    <div class="web-onboarding-inner">
      <header class="web-onboarding-top">
        <span class="web-onboarding-brand"><img src="assets/brand/logo-brain.png" alt="">Cogni</span>
        <span class="sv-count" aria-live="polite"></span>
      </header>
      <div class="sv-bar" aria-hidden="true"><i></i></div>
      <div class="web-onboarding-stage" id="profile-survey-stage"></div>
    </div>`;
  const stage = overlay.querySelector("#profile-survey-stage");
  const count = overlay.querySelector(".sv-count");
  const bar = overlay.querySelector(".sv-bar i");
  const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

  const optionHtml = (step, [id, label, sub]) => {
    const value = getAnswer(answers, step.key);
    const on = step.kind === "multi" ? (value ?? []).includes(id) : String(value) === id;
    const role = step.kind === "multi" ? "checkbox" : "radio";
    return `<button class="sv-opt${step.kind === "single" ? " is-single" : ""}${sub ? " has-sub" : ""}${on ? " is-on" : ""}" data-sv-opt="${esc(id)}" type="button" role="${role}" aria-checked="${on}">${step.kind === "multi" ? `<span class="sv-tick" aria-hidden="true">${tick}</span>` : ""}<span class="sv-opt-text"><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
  };
  const fieldHtml = (step) => {
    const value = getAnswer(answers, step.key) ?? "";
    return `<div class="sv-field"><input class="sv-input" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="${esc(step.placeholder ?? "")}" value="${esc(value)}" data-sv-input aria-label="${esc(step.title)}"></div>`;
  };
  const render = () => {
    window.clearTimeout(timer); timer = null;
    const list = steps(kind, answers);
    index = Math.max(0, Math.min(list.length - 1, index));
    const step = list[index];
    const picked = answered(step, answers);
    count.textContent = `${index + 1} of ${list.length}`;
    bar.style.width = `${Math.round(((index) / list.length) * 100)}%`;
    const next = step.kind === "multi" || step.kind === "email"
      ? `<button type="button" class="web-onboarding-next" data-sv-next ${step.required && !picked ? "disabled" : ""}>${picked || step.required ? "Continue" : "Skip"}${arrow}</button>`
      : (picked ? `<button type="button" class="web-onboarding-next" data-sv-next>Continue${arrow}</button>` : "");
    const skip = !step.required && step.kind === "single" && !picked ? `<button type="button" class="web-onboarding-later" data-sv-skip>Skip</button>` : "";
    stage.innerHTML = `
      <div class="web-onboarding-slide ob-cta ob-q sv-slide" data-step="${step.id}">
        <p class="web-onboarding-eyebrow">${esc(step.eyebrow)}${step.required ? "" : " · optional"}</p>
        <h2 class="web-onboarding-title">${esc(step.title)}</h2>
        ${step.body ? `<p class="web-onboarding-body">${esc(step.body)}</p>` : ""}
        ${step.kind === "email"
          ? fieldHtml(step)
          : `<div class="sv-opts${step.wide ? " is-wide" : ""}" role="${step.kind === "multi" ? "group" : "radiogroup"}" aria-label="${esc(step.title)}" style="--cols:${step.cols}">${step.options.map((o) => optionHtml(step, o)).join("")}</div>`}
      </div>
      <div class="web-onboarding-footer sv-foot">
        <div class="web-onboarding-actions">
          ${index > 0 ? '<button type="button" class="web-onboarding-back" data-sv-back>Back</button>' : ""}
          ${skip}${next}
        </div>
      </div>`;
    if (step.kind === "email") {
      const input = stage.querySelector("[data-sv-input]");
      input?.addEventListener("input", () => {
        setAnswer(answers, step.key, input.value.trim());
        const button = stage.querySelector("[data-sv-next]");
        if (button) button.disabled = !answered(step, answers);
      });
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && answered(step, answers)) { event.preventDefault(); advance(); }
      });
      window.setTimeout(() => input?.focus(), 60);
    }
  };
  const advance = () => {
    save(answers);
    const list = steps(kind, answers);
    if (index >= list.length - 1) { finish(); return; }
    index += 1;
    render();
  };
  const finish = () => {
    window.clearTimeout(timer);
    const now = new Date().toISOString();
    if (kind === "profile") answers.completedAt = now;
    else {
      answers.planAt = now;
      // The plan is rebuilt from the two required answers.
      try { d.setPlanPrefs?.({ goals: answers.goals, minutes: Number(answers.minutes) }, { rebuild: true }); } catch { /* plan module */ }
    }
    save(answers);
    // Also into Supabase, so the answers can be browsed outside this browser.
    try { d.persist?.(answers, kind); } catch { /* best effort */ }
    document.documentElement.classList.remove("web-onboarding-open");
    document.removeEventListener("keydown", onKey);
    overlay.classList.add("is-leaving");
    window.setTimeout(() => overlay.remove(), 220);
    onDone(answers);
  };
  overlay.addEventListener("click", (event) => {
    const list = steps(kind, answers);
    const step = list[index];
    const opt = event.target.closest("[data-sv-opt]");
    if (opt) {
      const id = opt.dataset.svOpt;
      if (step.kind === "multi") {
        let picks = [...(getAnswer(answers, step.key) ?? [])];
        const def = step.key === "games" ? GAMES.find((g) => g.id === id) : null;
        if (picks.includes(id)) picks = picks.filter((p) => p !== id);
        else if (def?.exclusive) picks = [id];
        else if (step.max && picks.length >= step.max) return; // full: unpick one first
        else picks = [...picks.filter((p) => !(step.key === "games" && GAMES.find((g) => g.id === p)?.exclusive)), id];
        setAnswer(answers, step.key, picks);
        answers.skipped = answers.skipped.filter((s) => s !== step.id);
        render();
        return;
      }
      setAnswer(answers, step.key, step.key === "minutes" ? Number(id) : id);
      answers.skipped = answers.skipped.filter((s) => s !== step.id);
      for (const button of stage.querySelectorAll("[data-sv-opt]")) {
        const on = button.dataset.svOpt === id;
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-checked", String(on));
      }
      // A tap answers and moves on; a beat so the choice is seen landing.
      window.clearTimeout(timer);
      timer = window.setTimeout(advance, d.reduceMotion?.() ? 0 : 220);
      return;
    }
    if (event.target.closest("[data-sv-back]")) { window.clearTimeout(timer); index -= 1; render(); return; }
    if (event.target.closest("[data-sv-skip]")) {
      clearAnswer(answers, step.key);
      if (!answers.skipped.includes(step.id)) answers.skipped.push(step.id);
      advance();
      return;
    }
    if (event.target.closest("[data-sv-next]")) {
      if (step.required && !answered(step, answers)) return;
      if (step.kind === "multi" && !(getAnswer(answers, step.key) ?? []).length && !answers.skipped.includes(step.id)) answers.skipped.push(step.id);
      advance();
    }
  });
  const onKey = (event) => {
    if (!overlay.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (event.target?.matches?.("input")) return; // typing in the email field
    if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); window.clearTimeout(timer); index -= 1; render(); return; }
    if (event.key === "ArrowRight") {
      const next = stage.querySelector("[data-sv-next]:not([disabled]), [data-sv-skip]");
      if (next) { event.preventDefault(); next.click(); }
    }
  };
  document.addEventListener("keydown", onKey);
  render();
  document.documentElement.classList.add("web-onboarding-open");
  document.body.appendChild(overlay);
}
