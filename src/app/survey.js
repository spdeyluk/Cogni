// Cogni · About-you survey — asked once, the first time a test is started.
// ---------------------------------------------------------------------------
// A short run of tap-to-answer screens in the onboarding's visual language:
// age, gender and education (required), then screen time, the games you play
// and your rank in each, and what fills your days (all skippable). Answers
// live in localStorage under a "cogni." key, so account sync carries them.
// ---------------------------------------------------------------------------
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

export function initSurvey(deps) { d = deps; }

export function loadSurvey() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.v === VERSION ? saved : null;
  } catch { return null; }
}
export function profileSurveyDone() { return Boolean(loadSurvey()?.completedAt); }
function save(answers) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...answers })); } catch { /* private mode */ }
}
function blank() {
  return { age: null, gender: null, education: null, screenTime: null, games: [], ranks: {}, interests: [], skipped: [], startedAt: new Date().toISOString(), completedAt: null };
}

// The screens, in order. Rank screens appear for each ranked game picked.
function steps(a) {
  const list = [
    { id: "age", kind: "single", key: "age", required: true, eyebrow: "About you", title: "How old are you?", options: AGE, cols: 2 },
    { id: "gender", kind: "single", key: "gender", required: true, eyebrow: "About you", title: "How do you identify?", options: GENDER, cols: 2 },
    { id: "education", kind: "single", key: "education", required: true, eyebrow: "About you", title: "Your education so far?", body: "The highest level you have finished or are in now.", options: EDUCATION, cols: 2 },
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

// Show the survey unless it has been completed; `onDone` runs either way.
export function runProfileSurvey(onDone = () => {}) {
  if (profileSurveyDone()) { onDone(); return; }
  if (document.querySelector("#profile-survey")) return;
  const esc = (v) => d.escapeHtml(v);
  const answers = { ...blank(), ...(loadSurvey() ?? {}) };
  answers.completedAt = null;
  let index = 0;
  let timer = null;

  const overlay = document.createElement("div");
  overlay.className = "web-onboarding profile-survey";
  overlay.id = "profile-survey";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "About you");
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

  const optionHtml = (step, [id, label]) => {
    const value = getAnswer(answers, step.key);
    const on = step.kind === "multi" ? (value ?? []).includes(id) : value === id;
    const role = step.kind === "multi" ? "checkbox" : "radio";
    const pressed = step.kind === "multi" ? `aria-checked="${on}"` : `aria-checked="${on}"`;
    return `<button class="sv-opt${step.kind === "single" ? " is-single" : ""}${on ? " is-on" : ""}" data-sv-opt="${esc(id)}" type="button" role="${role}" ${pressed}>${step.kind === "multi" ? `<span class="sv-tick" aria-hidden="true">${tick}</span>` : ""}<span>${esc(label)}</span></button>`;
  };
  const render = () => {
    window.clearTimeout(timer); timer = null;
    const list = steps(answers);
    index = Math.max(0, Math.min(list.length - 1, index));
    const step = list[index];
    const value = getAnswer(answers, step.key);
    const picked = step.kind === "multi" ? (value ?? []).length > 0 : value != null;
    count.textContent = `${index + 1} of ${list.length}`;
    bar.style.width = `${Math.round(((index) / list.length) * 100)}%`;
    const next = step.kind === "multi"
      ? `<button type="button" class="web-onboarding-next" data-sv-next>${picked ? "Continue" : step.required ? "Continue" : "Skip"}${arrow}</button>`
      : (picked ? `<button type="button" class="web-onboarding-next" data-sv-next>Continue${arrow}</button>` : "");
    const skip = !step.required && step.kind === "single" && !picked ? `<button type="button" class="web-onboarding-later" data-sv-skip>Skip</button>` : "";
    stage.innerHTML = `
      <div class="web-onboarding-slide ob-cta ob-q sv-slide" data-step="${step.id}">
        <p class="web-onboarding-eyebrow">${esc(step.eyebrow)}${step.required ? "" : " · optional"}</p>
        <h2 class="web-onboarding-title">${esc(step.title)}</h2>
        ${step.body ? `<p class="web-onboarding-body">${esc(step.body)}</p>` : ""}
        <div class="sv-opts${step.wide ? " is-wide" : ""}" role="${step.kind === "multi" ? "group" : "radiogroup"}" aria-label="${esc(step.title)}" style="--cols:${step.cols}">${step.options.map((o) => optionHtml(step, o)).join("")}</div>
      </div>
      <div class="web-onboarding-footer sv-foot">
        <div class="web-onboarding-actions">
          ${index > 0 ? '<button type="button" class="web-onboarding-back" data-sv-back>Back</button>' : ""}
          ${skip}${next}
        </div>
      </div>`;
  };
  const advance = () => {
    save(answers);
    const list = steps(answers);
    if (index >= list.length - 1) { finish(); return; }
    index += 1;
    render();
  };
  const finish = () => {
    window.clearTimeout(timer);
    answers.completedAt = new Date().toISOString();
    save(answers);
    document.documentElement.classList.remove("web-onboarding-open");
    document.removeEventListener("keydown", onKey);
    overlay.classList.add("is-leaving");
    window.setTimeout(() => overlay.remove(), 220);
    onDone(answers);
  };
  overlay.addEventListener("click", (event) => {
    const list = steps(answers);
    const step = list[index];
    const opt = event.target.closest("[data-sv-opt]");
    if (opt) {
      const id = opt.dataset.svOpt;
      if (step.kind === "multi") {
        let picks = [...(getAnswer(answers, step.key) ?? [])];
        const def = step.key === "games" ? GAMES.find((g) => g.id === id) : null;
        if (picks.includes(id)) picks = picks.filter((p) => p !== id);
        else if (def?.exclusive) picks = [id];
        else picks = [...picks.filter((p) => !(step.key === "games" && GAMES.find((g) => g.id === p)?.exclusive)), id];
        setAnswer(answers, step.key, picks);
        answers.skipped = answers.skipped.filter((s) => s !== step.id);
        render();
        return;
      }
      setAnswer(answers, step.key, id);
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
      if (step.kind === "multi" && !(getAnswer(answers, step.key) ?? []).length && !answers.skipped.includes(step.id)) answers.skipped.push(step.id);
      advance();
    }
  });
  const onKey = (event) => {
    if (!overlay.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); window.clearTimeout(timer); index -= 1; render(); return; }
    if (event.key === "ArrowRight") {
      const next = stage.querySelector("[data-sv-next], [data-sv-skip]");
      if (next) { event.preventDefault(); next.click(); }
    }
  };
  document.addEventListener("keydown", onKey);
  render();
  document.documentElement.classList.add("web-onboarding-open");
  document.body.appendChild(overlay);
}
