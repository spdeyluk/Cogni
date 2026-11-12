// IQ Battle: 1v1 duels over the same seeded set of reasoning items, plus the
// public status layer (IQ score, battle rating, leaderboards, friends).
//
// Wiring: main.js calls initBattle(deps) once, then showBattle() for the tab and
// renderRanksPage(host) for the Ranks page. Server rules live in
// supabase/battles.sql (security-definer functions settle duels and move Elo).

let d = null;            // deps from main.js
let host = null;         // .battle-page section
let my = null;           // my profiles row (cached)
let view = "hub";        // hub | arena | result
let hub = { battles: [], names: new Map(), friends: [], loading: false, error: "" };
let arena = null;        // in-flight round state
let result = null;       // last result shown
let loading = null;      // match loading / countdown screen state
let hubChannel = null;
let roundChannel = null;
let friendPickerOpen = false;   // the "Play with friends" panel
let lobby = null;               // my open lobby row (host side)
let lobbyChannel = null;
let publicLobbies = [];
let lobbyBusy = false;
const LOBBY_KEY = "cogni.lobby.v1";

const ROUNDS = 8;
const PLAN = ["fluid", "verbal", "quant", "fluid", "weights", "verbal", "spatial", "quant"];
const TEXT_LIMIT_MS = 20000;
const VISUAL_LIMIT_MS = 30000;
const MAX_B = 1.3;
const BOT_NAME = "Cogni";

export function initBattle(deps) {
  d = deps;
  host = document.querySelector(".battle-page");
  if (!host) return;
  host.addEventListener("click", onHostClick);
}

// ---------------------------------------------------------------------------
// Public status: push my display name + latest IQ score to profiles, read back
// my ratings. Rating columns are protected server-side; we only write status.
// ---------------------------------------------------------------------------
const STATUS_COLUMNS = "id, handle, display_name, avatar_initial, iq_score, iq_percentile, iq_taken_at, battle_rating, battle_wins, battle_losses, battle_draws";
const REFERRAL_COLUMNS = ", referral_code, referrals";
let statusColumns = STATUS_COLUMNS + REFERRAL_COLUMNS;

// Until referrals.sql has run, selecting the referral columns 400s; drop back
// to the base columns rather than losing ratings and IQ on the hub.
async function selectMyStatus(query) {
  let result = await query(statusColumns);
  if (result.error && statusColumns !== STATUS_COLUMNS && /referral/i.test(result.error.message ?? "")) {
    statusColumns = STATUS_COLUMNS;
    result = await query(statusColumns);
  }
  return result;
}

export async function syncPublicStatus() {
  const me = d?.getAuthUser();
  if (!d?.supabaseEnabled || !me || d.isGuest()) return null;
  const latest = (d.loadCatSessions() ?? [])[0] ?? null;
  const patch = {
    display_name: d.profileDisplayName(d.loadUserProfile()).slice(0, 40),
    last_seen_at: new Date().toISOString()
  };
  if (latest?.score) {
    patch.iq_score = Math.round(latest.score);
    patch.iq_percentile = Number(latest.percentile ?? 0) || null;
    patch.iq_taken_at = latest.completedAt ?? new Date().toISOString();
  }
  try {
    const { data } = await selectMyStatus((columns) => d.supabase
      .from("profiles")
      .update(patch)
      .eq("id", me.id)
      .select(columns)
      .maybeSingle());
    if (data) my = data;
  } catch {
    // Status is best effort; the UI falls back to local data.
  }
  return my;
}

export function myStatus() { return my; }

async function loadMyStatus() {
  const me = d.getAuthUser();
  if (!d.supabaseEnabled || !me || d.isGuest()) return null;
  const { data } = await selectMyStatus((columns) => d.supabase
    .from("profiles")
    .select(columns)
    .eq("id", me.id)
    .maybeSingle());
  if (data) my = data;
  return my;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function showBattle() {
  if (!host || d.isGameRunning()) return;
  d.appShell.classList.remove(...d.sectionResetClasses);
  d.appShell.classList.add("battle-open");
  d.setActiveTab("battle");
  d.setPageHeader("Cogni", "IQ duels. Same questions, fastest right answers win.");
  if (view === "arena" && arena) { renderArena(); return; }
  if (view === "result" && result) { renderResult(); return; }
  if (view === "loading" && loading) { renderLoading(); return; }
  view = "hub";
  renderHub();
  refreshHub();
}

function isOpen() { return d.appShell.classList.contains("battle-open"); }

function onHostClick(event) {
  const t = event.target;
  const act = (sel) => t.closest(sel);
  if (act("[data-battle-quick]")) { startQuickMatch(); return; }
  if (act("[data-battle-practice]")) { startPractice(); return; }
  if (act("[data-battle-friends]")) { toggleFriendsPanel(); return; }
  const mk = act("[data-lobby-create]");
  if (mk) { createLobby(mk.dataset.lobbyCreate); return; }
  if (act("[data-lobby-join-submit]")) { joinLobby(host.querySelector("[data-lobby-code]")?.value); return; }
  const jn = act("[data-lobby-join]");
  if (jn) { joinLobby(jn.dataset.lobbyJoin); return; }
  if (act("[data-lobby-close]")) { closeLobby(); return; }
  if (act("[data-lobby-copy]")) { copyLobbyLink(); return; }
  if (act("[data-lobby-refresh]")) { loadPublicLobbies().then(renderHub); return; }
  const ch = act("[data-battle-challenge]");
  if (ch) { challengeUser(ch.dataset.battleChallenge); return; }
  const play = act("[data-battle-play]");
  if (play) { const row = hub.battles.find((b) => b.id === play.dataset.battlePlay); if (row) prepareRound(row, row.mode === "friend" ? "Friend duel" : "Quick 1v1"); return; }
  const cancel = act("[data-battle-cancel]");
  if (cancel) { cancelOpen(cancel.dataset.battleCancel); return; }
  const ans = act("[data-battle-answer]");
  if (ans) { answer(Number(ans.dataset.battleAnswer)); return; }
  if (act("[data-battle-back]")) { leaveToHub(); return; }
  if (act("[data-battle-rematch]")) { rematch(); return; }
  if (act("[data-battle-take-test]")) { d.showAssessments(); return; }
  if (act("[data-battle-ranks]")) { d.showCommunity?.(); return; }
}

function leaveToHub() {
  stopTimer();
  unwatchRound();
  unwatchPublicLobbies();
  stopLoading();
  arena = null;
  result = null;
  view = "hub";
  renderHub();
  refreshHub();
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------
async function refreshHub() {
  const me = d.getAuthUser();
  if (!d.supabaseEnabled || !me || d.isGuest()) { hub = { ...hub, battles: [], loading: false }; renderHub(); return; }
  hub.loading = true;
  hub.error = "";
  renderHub();
  try {
    await Promise.all([loadMyStatus(), loadBattles(), loadFriends()]);
  } catch (error) {
    hub.error = error?.message || "Could not load battles.";
  }
  hub.loading = false;
  if (view === "hub") renderHub();
  watchHub();
}

async function loadBattles() {
  const me = d.getAuthUser();
  const { data, error } = await d.supabase
    .from("battles")
    .select("*")
    .or(`challenger.eq.${me.id},opponent.eq.${me.id}`)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  hub.battles = data ?? [];
  await loadNames(hub.battles.flatMap((b) => [b.challenger, b.opponent]));
}

async function loadNames(ids) {
  const want = [...new Set(ids)].filter((id) => id && !hub.names.has(id));
  if (!want.length) return;
  const { data } = await d.supabase
    .from("profiles")
    .select("id, handle, display_name, iq_score, battle_rating")
    .in("id", want);
  (data ?? []).forEach((row) => hub.names.set(row.id, row));
}

async function loadFriends() {
  const me = d.getAuthUser();
  if (!d.supabaseEnabled || !me || d.isGuest()) { hub.friends = []; return; }
  const { data } = await d.supabase
    .from("friend_requests")
    .select("from_user, to_user, status")
    .eq("status", "accepted")
    .or(`from_user.eq.${me.id},to_user.eq.${me.id}`);
  const ids = (data ?? []).map((r) => (r.from_user === me.id ? r.to_user : r.from_user));
  await loadNames(ids);
  hub.friends = ids.map((id) => hub.names.get(id)).filter(Boolean);
}

function nameOf(id) {
  if (!id) return "Waiting…";
  const me = d.getAuthUser();
  if (me && id === me.id) return "You";
  const row = hub.names.get(id);
  return displayName(row);
}

function displayName(row) {
  if (!row) return "Player";
  return row.display_name || String(row.handle || "").replace(/^@/, "") || "Player";
}

function watchHub() {
  const me = d.getAuthUser();
  if (!me || hubChannel || !d.supabaseEnabled) return;
  const onChange = () => { if (isOpen() && view === "hub") loadBattles().then(() => loadMyStatus()).then(renderHub).catch(() => {}); };
  hubChannel = d.supabase.channel(`battles:${me.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "battles", filter: `challenger=eq.${me.id}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "battles", filter: `opponent=eq.${me.id}` }, onChange)
    .subscribe();
}

function mySide(row) {
  const me = d.getAuthUser();
  return row.challenger === me?.id ? "challenger" : "opponent";
}
function otherId(row) { return mySide(row) === "challenger" ? row.opponent : row.challenger; }
function myDone(row) { return Boolean(row[`${mySide(row)}_done_at`]); }
function theirDone(row) { const s = mySide(row) === "challenger" ? "opponent" : "challenger"; return Boolean(row[`${s}_done_at`]); }

function renderHub() {
  if (!host) return;
  const me = d.getAuthUser();
  const signedIn = Boolean(me) && !d.isGuest() && d.supabaseEnabled;
  const esc = d.escapeHtml;
  const latest = (d.loadCatSessions() ?? [])[0] ?? null;
  const iq = my?.iq_score ?? latest?.score ?? null;
  const pct = my?.iq_percentile ?? latest?.percentile ?? null;
  const rating = my?.battle_rating ?? 1000;
  const w = my?.battle_wins ?? 0, l = my?.battle_losses ?? 0, dr = my?.battle_draws ?? 0;

  const yourTurn = hub.battles.filter((b) => (b.status === "active" || b.status === "open") && !myDone(b));
  const waiting = hub.battles.filter((b) => (b.status === "active" || b.status === "open") && myDone(b));
  const finished = hub.battles.filter((b) => b.status === "finished").slice(0, 6);

  const rowHtml = (b, kind) => {
    const who = nameOf(otherId(b));
    const side = mySide(b);
    const mine = b[`${side}_score`];
    const theirs = b[`${side === "challenger" ? "opponent" : "challenger"}_score`];
    const delta = b[`${side}_delta`];
    if (kind === "turn") {
      return `<li class="battle-row">
        <div><strong>${esc(who)}</strong><span>${b.mode === "friend" ? "Friend duel" : "Quick 1v1"} · ${timeAgo(b.created_at)}</span></div>
        <button class="battle-pill" data-battle-play="${esc(b.id)}" type="button">Play</button>
      </li>`;
    }
    if (kind === "wait") {
      const open = b.status === "open";
      return `<li class="battle-row is-dim">
        <div><strong>${esc(open ? "Searching for an opponent" : who)}</strong><span>${open ? "Your round is in. The next player to search is matched with you." : `Waiting for ${esc(who)} to play`}${mine != null ? ` · you scored ${mine}` : ""}</span></div>
        ${open ? `<button class="battle-pill is-ghost" data-battle-cancel="${esc(b.id)}" type="button">Cancel</button>` : ""}
      </li>`;
    }
    const won = b.winner === me?.id, draw = !b.winner;
    return `<li class="battle-row">
      <div><strong>${esc(who)}</strong><span>${mine} – ${theirs} · ${timeAgo(b.finished_at ?? b.created_at)}</span></div>
      <b class="battle-outcome ${won ? "is-win" : draw ? "is-draw" : "is-loss"}">${won ? "Win" : draw ? "Draw" : "Loss"}${delta != null ? ` <i>${delta > 0 ? "+" : ""}${delta}</i>` : ""}</b>
    </li>`;
  };

  host.innerHTML = `
    <div class="battle-hub is-home">
      <header class="home-head">
        <h1 class="home-brand">Cogni<span>.</span></h1>
      </header>

      <div class="home-actions">
        <button class="battle-primary home-cta" data-battle-quick type="button">Quick 1v1</button>
        <button class="battle-secondary home-cta${friendPickerOpen ? " is-open" : ""}" data-battle-friends type="button" aria-expanded="${friendPickerOpen ? "true" : "false"}">Play with friends</button>
      </div>
      <button class="battle-link home-practice" data-battle-practice type="button">Practice against ${BOT_NAME}</button>

      ${friendPickerOpen ? renderLobbyPanel() : ""}
      ${hub.error ? `<p class="battle-error">${esc(hub.error)}</p>` : ""}
      ${!signedIn ? `<p class="battle-note">Sign in to play rated duels and lobbies. Practice is open to everyone.</p>` : ""}


      <section class="home-stats" aria-label="Your status">
        <div><span class="battle-eyebrow">Rating</span><strong>${rating}</strong></div>
        <div><span class="battle-eyebrow">IQ</span>${iq
          ? `<strong>${Math.round(iq)}</strong>`
          : `<strong class="is-empty">—</strong><button class="battle-link" data-battle-take-test type="button">Take the test</button>`}</div>
      </section>

      ${yourTurn.length ? `<section class="battle-list"><h3>Your turn</h3><ul>${yourTurn.map((b) => rowHtml(b, "turn")).join("")}</ul></section>` : ""}
      ${waiting.length ? `<section class="battle-list"><h3>Waiting</h3><ul>${waiting.map((b) => rowHtml(b, "wait")).join("")}</ul></section>` : ""}
      ${finished.length ? `<section class="battle-list"><h3>Recent</h3><ul>${finished.map((b) => rowHtml(b, "done")).join("")}</ul></section>` : ""}

      <footer class="home-foot">
        <button class="battle-link" data-battle-ranks type="button">Leaderboard</button>
        <details class="home-how">
          <summary>How it works</summary>
          <ol>
            <li>Eight items: pattern, verbal, number, spatial and weights. Both players get the same set.</li>
            <li>Right answer is 100. Up to 50 more for speed. Nothing for a miss.</li>
            <li>Rating moves like chess Elo. Beat someone above you and it moves more.</li>
          </ol>
        </details>
      </footer>
    </div>`;
}

// ---------------------------------------------------------------------------
// Lobbies: play with friends. Host opens a room (public or private), guest
// joins by code, link, or from the public list; the server makes the battle.
// ---------------------------------------------------------------------------
function toggleFriendsPanel() {
  friendPickerOpen = !friendPickerOpen;
  renderHub();
  if (friendPickerOpen) {
    loadFriends().then(renderHub).catch(() => {});
    loadPublicLobbies().then(renderHub).catch(() => {});
    watchPublicLobbies();
  } else {
    unwatchPublicLobbies();
  }
}

function renderLobbyPanel() {
  const esc = d.escapeHtml;
  if (!d.getAuthUser() || d.isGuest()) return `<section class="lobby-panel"><p class="battle-note">Sign in to open a lobby or join one.</p></section>`;
  if (lobby) {
    return `<section class="lobby-panel is-waiting">
      <span class="battle-eyebrow">${lobby.visibility === "public" ? "Public lobby" : "Private lobby"}</span>
      <strong class="lobby-code">${esc(lobby.code)}</strong>
      <p class="battle-note">Waiting for a friend to join. Share the code or the link; the duel starts the moment they do.</p>
      <div class="lobby-link"><input type="text" readonly value="${esc(lobbyLink(lobby.code))}" aria-label="Lobby link"><button class="battle-pill" data-lobby-copy type="button">Copy</button></div>
      <button class="battle-link" data-lobby-close type="button">Close lobby</button>
    </section>`;
  }
  const rooms = publicLobbies.map((r) => `
    <li class="battle-row">
      <div><strong>${esc(displayName(r))}</strong><span>Rating ${r.battle_rating ?? 1000}${r.iq_score ? ` · IQ ${r.iq_score}` : ""} · ${timeAgo(r.created_at)}</span></div>
      <button class="battle-pill" data-lobby-join="${esc(r.code)}" type="button" ${lobbyBusy ? "disabled" : ""}>Join</button>
    </li>`).join("");
  const friends = hub.friends.map((f) => `
    <li class="battle-row">
      <div><strong>${esc(displayName(f))}</strong><span>${f.iq_score ? `IQ ${f.iq_score} · ` : ""}Rating ${f.battle_rating ?? 1000}</span></div>
      <button class="battle-pill is-ghost" data-battle-challenge="${esc(f.id)}" type="button">Challenge</button>
    </li>`).join("");
  return `<section class="lobby-panel">
    <div class="lobby-create">
      <button class="battle-secondary" data-lobby-create="private" type="button" ${lobbyBusy ? "disabled" : ""}><span>Private lobby</span><small>Only with the code</small></button>
      <button class="battle-secondary" data-lobby-create="public" type="button" ${lobbyBusy ? "disabled" : ""}><span>Public lobby</span><small>Anyone can join</small></button>
    </div>
    <form class="lobby-join" onsubmit="return false">
      <input type="text" data-lobby-code maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Enter a code" aria-label="Lobby code">
      <button class="battle-pill" data-lobby-join-submit type="button" ${lobbyBusy ? "disabled" : ""}>Join</button>
    </form>
    <div class="lobby-section">
      <h3>Public lobbies <button class="battle-link" data-lobby-refresh type="button">Refresh</button></h3>
      ${rooms ? `<ul>${rooms}</ul>` : `<p class="battle-note">No open rooms right now. Open a public one and the next player sees it here.</p>`}
    </div>
    ${friends ? `<div class="lobby-section"><h3>Challenge a friend</h3><ul>${friends}</ul></div>` : ""}
  </section>`;
}

function lobbyLink(code) { return `${window.location.origin}/?lobby=${code}`; }

async function createLobby(visibility) {
  if (!d.requireAuth("Sign in to open a lobby.")) return;
  if (!d.supabaseEnabled || lobbyBusy) return;
  const seed = newSeed();
  const ids = pickItemIds(seed);
  lobbyBusy = true; hub.error = ""; renderHub();
  try {
    const { data, error } = await d.supabase.rpc("lobby_create", { p_visibility: visibility, p_seed: seed, p_item_ids: ids });
    if (error) throw new Error(error.message);
    lobby = data;
    watchLobby(data.id);
  } catch (error) {
    hub.error = lobbyError(error);
  }
  lobbyBusy = false;
  renderHub();
}

async function joinLobby(code) {
  const clean = String(code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!clean) return;
  if (!d.requireAuth("Sign in to join a lobby.")) return;
  if (!d.supabaseEnabled || lobbyBusy) return;
  lobbyBusy = true; hub.error = ""; renderHub();
  try {
    const { data, error } = await d.supabase.rpc("lobby_join", { p_code: clean });
    if (error) throw new Error(error.message);
    lobbyBusy = false;
    friendPickerOpen = false;
    unwatchPublicLobbies();
    await loadNames([data.challenger, data.opponent]);
    if (!isOpen()) showBattle();
    prepareRound(data, "Lobby duel");
    return;
  } catch (error) {
    hub.error = lobbyError(error);
  }
  lobbyBusy = false;
  renderHub();
}

async function closeLobby() {
  const id = lobby?.id;
  lobby = null;
  unwatchLobby();
  renderHub();
  if (id) { try { await d.supabase.rpc("lobby_close", { p_lobby: id }); } catch { /* best effort */ } }
}

async function copyLobbyLink() {
  if (!lobby) return;
  const btn = host.querySelector("[data-lobby-copy]");
  try { await navigator.clipboard.writeText(lobbyLink(lobby.code)); if (btn) { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy"; }, 1600); } }
  catch { host.querySelector(".lobby-link input")?.select(); }
}

async function loadPublicLobbies() {
  const me = d.getAuthUser();
  if (!d.supabaseEnabled || !me || d.isGuest()) { publicLobbies = []; return; }
  const { data, error } = await d.supabase.from("open_lobbies").select("*").limit(20);
  if (error) { publicLobbies = []; return; }
  publicLobbies = (data ?? []).filter((r) => r.host !== me.id);
}

// Host side: the lobby row flips to "started" with a battle id when someone joins.
function watchLobby(id) {
  unwatchLobby();
  if (!d.supabaseEnabled) return;
  lobbyChannel = d.supabase.channel(`lobby:${id}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${id}` }, (payload) => {
      const row = payload?.new;
      if (row?.status === "started" && row.battle_id) startFromLobby(row);
    })
    .subscribe();
  // Belt and braces: realtime can miss a message, so poll too while waiting.
  const poll = async () => {
    if (!lobby || lobby.id !== id) return;
    const { data } = await d.supabase.from("lobbies").select("*").eq("id", id).maybeSingle();
    if (data?.status === "started" && data.battle_id) { startFromLobby(data); return; }
    if (data?.status === "closed") { lobby = null; unwatchLobby(); renderHub(); return; }
    setTimeout(poll, 4000);
  };
  setTimeout(poll, 4000);
}

function unwatchLobby() {
  if (lobbyChannel) { try { d.supabase.removeChannel(lobbyChannel); } catch { /* ignore */ } }
  lobbyChannel = null;
}

async function startFromLobby(row) {
  if (!lobby || lobby.id !== row.id) return;
  lobby = null;
  unwatchLobby();
  friendPickerOpen = false;
  unwatchPublicLobbies();
  const { data } = await d.supabase.from("battles").select("*").eq("id", row.battle_id).maybeSingle();
  if (!data) { renderHub(); return; }
  await loadNames([data.challenger, data.opponent]);
  if (!isOpen()) showBattle();
  prepareRound(data, "Lobby duel");
}

let publicChannel = null;
function watchPublicLobbies() {
  if (publicChannel || !d.supabaseEnabled || !d.getAuthUser() || d.isGuest()) return;
  publicChannel = d.supabase.channel("lobbies:public")
    .on("postgres_changes", { event: "*", schema: "public", table: "lobbies" }, () => {
      if (friendPickerOpen && view === "hub") loadPublicLobbies().then(renderHub).catch(() => {});
    })
    .subscribe();
}
function unwatchPublicLobbies() {
  if (publicChannel) { try { d.supabase.removeChannel(publicChannel); } catch { /* ignore */ } }
  publicChannel = null;
}

function lobbyError(error) {
  const m = error?.message || "";
  if (/function .*does not exist|lobby_|schema cache|open_lobbies/i.test(m)) return "Lobbies are not switched on for this server yet.";
  if (/lobby not found/i.test(m)) return "No open lobby with that code.";
  if (/your own lobby/i.test(m)) return "That is your own lobby.";
  if (/not signed in|JWT/i.test(m)) return "Sign in to use lobbies.";
  return m || "Something went wrong.";
}

// A ?lobby=CODE link is remembered until the visitor is signed in, then joined.
export function captureLobbyCode() {
  try {
    const url = new URL(window.location.href);
    const code = String(url.searchParams.get("lobby") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!code) return;
    sessionStorage.setItem(LOBBY_KEY, code);
    url.searchParams.delete("lobby");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch { /* ignore */ }
}

export async function claimPendingLobby() {
  let code = "";
  try { code = sessionStorage.getItem(LOBBY_KEY) ?? ""; sessionStorage.removeItem(LOBBY_KEY); } catch { /* ignore */ }
  if (!code || !d?.getAuthUser() || d.isGuest()) return false;
  if (!isOpen()) showBattle();
  await joinLobby(code);
  return true;
}

function renderFriendPicker() {
  const esc = d.escapeHtml;
  if (!d.getAuthUser() || d.isGuest()) return `<section class="battle-friends"><p class="battle-note">Sign in to challenge friends.</p></section>`;
  if (!hub.friends.length) {
    return `<section class="battle-friends"><p class="battle-note">No friends yet. Add people by their @username on the leaderboard, then challenge them here.</p></section>`;
  }
  return `<section class="battle-friends"><ul>${hub.friends.map((f) => `
    <li class="battle-row">
      <div><strong>${esc(displayName(f))}</strong><span>${f.iq_score ? `IQ ${f.iq_score} · ` : ""}Rating ${f.battle_rating ?? 1000}</span></div>
      <button class="battle-pill" data-battle-challenge="${esc(f.id)}" type="button">Challenge</button>
    </li>`).join("")}</ul></section>`;
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// ---------------------------------------------------------------------------
// Item sets
// ---------------------------------------------------------------------------
function rngFrom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GENERATED_DOMAIN = { fluid: "mx", spatial: "rot", weights: "fw" };

function pickItemIds(seed) {
  const rng = rngFrom(seed);
  const used = new Set();
  return PLAN.map((domain, slot) => {
    // Visual formats are generated from the seed, so no two duels share a puzzle.
    if (GENERATED_DOMAIN[domain]) {
      const level = 4 + Math.floor(rng() * 3);
      return d.generatedItemId(GENERATED_DOMAIN[domain], seed, slot, level);
    }
    const pool = d.catItemBank.filter((it) => it.domain === domain && Math.abs(it.b) <= MAX_B && !used.has(it.id));
    const list = pool.length ? pool : d.catItemBank.filter((it) => it.domain === domain && !used.has(it.id));
    const pick = list[Math.floor(rng() * list.length)];
    used.add(pick.id);
    return pick.id;
  });
}

function newSeed() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function limitFor(item) { return (item.matrix || item.figure || item.weights) ? VISUAL_LIMIT_MS : TEXT_LIMIT_MS; }

// ---------------------------------------------------------------------------
// Starting duels
// ---------------------------------------------------------------------------
async function startQuickMatch() {
  if (!d.requireAuth("Sign in to play rated battles.")) return;
  if (!d.supabaseEnabled) return;
  const seed = newSeed();
  const ids = pickItemIds(seed);
  hub.error = "";
  showLoading({ eyebrow: "Quick 1v1", title: "Finding an opponent", sub: "Looking for someone searching right now.", spinner: true, cancel: true });
  try {
    const { data, error } = await d.supabase.rpc("battle_quick_match", { p_seed: seed, p_item_ids: ids });
    if (error) throw new Error(error.message);
    if (view !== "loading") return; // cancelled while searching
    if (myDone(data)) { stopLoading(); view = "hub"; hub.error = "You already have a round waiting for an opponent."; renderHub(); return; }
    await loadNames([data.challenger, data.opponent]);
    prepareRound(data, "Quick 1v1");
  } catch (error) {
    stopLoading(); view = "hub";
    hub.error = friendlyError(error);
    renderHub();
  }
}

export async function challengeUser(opponentId) {
  if (!d.requireAuth("Sign in to challenge friends.")) return;
  if (!opponentId || !d.supabaseEnabled) return;
  const seed = newSeed();
  const ids = pickItemIds(seed);
  try {
    const { data, error } = await d.supabase.rpc("battle_challenge", { p_opponent: opponentId, p_seed: seed, p_item_ids: ids });
    if (error) throw new Error(error.message);
    await loadNames([data.challenger, data.opponent]);
    if (!isOpen()) showBattle();
    prepareRound(data, "Friend duel");
  } catch (error) {
    hub.error = friendlyError(error);
    if (!isOpen()) showBattle();
    renderHub();
  }
}

async function cancelOpen(id) {
  try { await d.supabase.rpc("battle_cancel", { p_battle: id }); } catch { /* best effort */ }
  await loadBattles().catch(() => {});
  renderHub();
}

function startPractice() {
  const seed = newSeed();
  const row = {
    id: `local-${seed}`, local: true, status: "active", mode: "practice",
    challenger: d.getAuthUser()?.id ?? "me", opponent: "bot", seed, item_ids: pickItemIds(seed), created_at: new Date().toISOString()
  };
  prepareRound(row, "Practice");
}

function friendlyError(error) {
  const m = error?.message || "";
  if (/function .*does not exist|battle_quick_match|schema cache/i.test(m)) return "Battles are not switched on for this server yet.";
  if (/not signed in|JWT/i.test(m)) return "Sign in to play rated battles.";
  return m || "Something went wrong.";
}

// ---------------------------------------------------------------------------
// Loading screen: searching, then "you vs X" with a short countdown.
// ---------------------------------------------------------------------------
let loadingTimer = null;

function showLoading(state) {
  stopLoading();
  loading = state;
  view = "loading";
  renderLoading();
}

function stopLoading() {
  if (loadingTimer) window.clearInterval(loadingTimer);
  loadingTimer = null;
  loading = null;
}

function renderLoading() {
  if (!host || !loading) return;
  const esc = d.escapeHtml;
  const l = loading;
  host.innerHTML = `
    <div class="battle-loading" role="status" aria-live="polite">
      ${l.count != null
        ? `<div class="battle-count"><span key="${l.count}">${l.count}</span></div>`
        : `<div class="battle-spinner" aria-hidden="true"></div>`}
      <p class="battle-eyebrow">${esc(l.eyebrow ?? "")}</p>
      <h2 class="battle-loading-title">${l.vs ? `You <i>vs</i> ${esc(l.vs)}` : esc(l.title ?? "")}</h2>
      ${l.sub ? `<p class="battle-note">${esc(l.sub)}</p>` : ""}
      ${l.cancel ? `<button class="battle-link battle-loading-cancel" data-battle-back type="button">Cancel</button>` : ""}
    </div>`;
}

// Hold the match card for three seconds, then drop into the arena.
function prepareRound(row, eyebrow) {
  const me = d.getAuthUser();
  const who = row.local ? BOT_NAME : nameOf(otherId(row));
  const seatOpen = !row.local && !row.opponent;
  showLoading(seatOpen
    ? { eyebrow, title: "No one is searching right now", sub: "Your round still counts. The next player to search plays this same set against your score.", count: 3 }
    : { eyebrow, vs: who, sub: "Same eight questions. Fastest right answers win.", count: 3 });
  loadingTimer = window.setInterval(() => {
    if (!loading || view !== "loading") { stopLoading(); return; }
    loading.count -= 1;
    if (loading.count > 0) { renderLoading(); return; }
    stopLoading();
    playRound(row);
  }, 1000);
}

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------
let timerHandle = null;
let itemStartedAt = 0;

function playRound(row) {
  stopTimer();
  unwatchRound();
  const items = (row.item_ids ?? []).map((id) => d.catItem(id)).filter(Boolean);
  if (!items.length) { hub.error = "This battle has no items."; renderHub(); return; }
  arena = { row, items, index: 0, answers: [], score: 0, correct: 0, ms: 0, locked: false };
  view = "arena";
  renderArena();
  startTimer();
}

function renderArena() {
  if (!arena) return;
  const esc = d.escapeHtml;
  const { row, items, index } = arena;
  const item = items[index];
  const me = d.getAuthUser();
  const them = row.local ? BOT_NAME : nameOf(otherId(row));
  const side = row.local ? null : mySide(row);
  const theirScoreKnown = !row.local && theirDone(row) && myDone(row);
  const theirScore = theirScoreKnown ? row[`${side === "challenger" ? "opponent" : "challenger"}_score`] : null;
  const order = d.catOptionOrder(item);
  const visual = item.matrix || item.figure || item.weights;

  const stage = item.matrix ? d.catMatrixSvg(item.matrix)
    : item.figure ? `<div class="cat-figure-target">${d.catCellSvg(item.figure.target)}</div>`
    : item.weights ? d.catWeightsSvg(item.weights) : "";

  const options = item.weights ? order.map((src, i) => `<button type="button" data-battle-answer="${i}" aria-label="Option ${i + 1}">${d.catCellSvg(item.weights.optionCells[src])}</button>`)
    : item.figure ? order.map((src, i) => `<button type="button" data-battle-answer="${i}" aria-label="Option ${i + 1}">${d.catCellSvg(item.figure.optionCells[src])}</button>`)
    : item.matrix ? order.map((src, i) => `<button type="button" data-battle-answer="${i}" aria-label="Option ${i + 1}">${d.catCellSvg(item.matrix.optionCells[src])}</button>`)
    : order.map((src, i) => `<button type="button" data-battle-answer="${i}">${esc(item.options[src])}</button>`);

  host.innerHTML = `
    <div class="battle-arena">
      <header class="battle-arena-top">
        <div class="battle-side is-you"><span>You</span><strong>${arena.score}</strong></div>
        <ol class="battle-dots" aria-label="Round ${index + 1} of ${items.length}">
          ${items.map((_, i) => `<li class="${i < index ? (arena.answers[i]?.correct ? "is-hit" : "is-miss") : i === index ? "is-now" : ""}"></li>`).join("")}
        </ol>
        <div class="battle-side is-them"><span>${esc(them)}</span><strong>${theirScore != null ? theirScore : "·"}</strong></div>
      </header>
      <div class="battle-timer" aria-hidden="true"><i id="battle-timer-bar"></i></div>
      <p class="battle-domain">${esc(d.domainLabel(item.domain))} · ${index + 1} / ${items.length}</p>
      <h2 class="battle-prompt ${visual ? "" : "is-text"}">${esc(item.prompt)}</h2>
      <div class="battle-stage">${stage}</div>
      <div class="cat-options ${visual ? "cat-options-matrix" : ""} battle-options">${options.join("")}</div>
      <button class="battle-link battle-quit" data-battle-back type="button">Leave round</button>
    </div>`;
}

function startTimer() {
  stopTimer();
  if (!arena) return;
  const item = arena.items[arena.index];
  const limit = limitFor(item);
  itemStartedAt = Date.now();
  const bar = () => document.querySelector("#battle-timer-bar");
  if (bar()) bar().style.width = "100%";
  timerHandle = window.setInterval(() => {
    if (!arena) { stopTimer(); return; }
    if (!isOpen()) { // user navigated away: the round is forfeited item by item
      answer(null, true);
      return;
    }
    const remaining = limit - (Date.now() - itemStartedAt);
    if (remaining <= 0) { answer(null); return; }
    const el = bar();
    if (el) el.style.width = `${Math.max(0, (remaining / limit) * 100)}%`;
  }, 100);
}

function stopTimer() {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = null;
}

function answer(displayIndex, silent = false) {
  if (!arena || arena.locked) return;
  arena.locked = true;
  stopTimer();
  const item = arena.items[arena.index];
  const limit = limitFor(item);
  const ms = Math.min(limit, Date.now() - itemStartedAt);
  const chosen = displayIndex == null ? null : d.catOptionOrder(item)[displayIndex] ?? null;
  const correct = chosen !== null && chosen === item.answerIndex;
  const points = correct ? 100 + Math.round(50 * Math.max(0, (limit - ms) / limit)) : 0;
  arena.answers.push({ itemId: item.id, chosen, correct, ms, points });
  arena.score += points;
  arena.correct += correct ? 1 : 0;
  arena.ms += ms;

  const flash = () => {
    if (silent || !isOpen()) return Promise.resolve();
    const btn = displayIndex == null ? null : host.querySelector(`[data-battle-answer="${displayIndex}"]`);
    if (btn) btn.classList.add(correct ? "is-correct" : "is-wrong");
    const right = host.querySelector(`[data-battle-answer="${d.catOptionOrder(item).indexOf(item.answerIndex)}"]`);
    if (right && !correct) right.classList.add("is-reveal");
    return new Promise((r) => window.setTimeout(r, correct ? 350 : 700));
  };

  flash().then(() => {
    if (!arena) return;
    arena.index += 1;
    arena.locked = false;
    if (arena.index >= arena.items.length) { finishRound(); return; }
    if (isOpen()) renderArena();
    startTimer();
  });
}

async function finishRound() {
  stopTimer();
  const a = arena;
  arena = null;
  if (!a) return;
  if (a.row.local) {
    const bot = simulateBot(a);
    result = { row: a.row, local: true, mine: a.score, theirs: bot.score, correct: a.correct, theirCorrect: bot.correct, them: BOT_NAME, settled: true, delta: null };
    view = "result";
    if (isOpen()) renderResult();
    return;
  }
  result = { row: a.row, mine: a.score, correct: a.correct, them: nameOf(otherId(a.row)), settled: false, theirs: null, delta: null };
  view = "result";
  if (isOpen()) renderResult();
  try {
    const { data, error } = await d.supabase.rpc("battle_submit", { p_battle: a.row.id, p_score: a.score, p_correct: a.correct, p_ms: a.ms });
    if (error) throw new Error(error.message);
    applyServerRow(data);
  } catch (error) {
    result.error = friendlyError(error);
    if (isOpen() && view === "result") renderResult();
  }
}

function applyServerRow(row) {
  if (!result || result.row.id !== row.id) return;
  result.row = row;
  const side = mySide(row);
  const other = side === "challenger" ? "opponent" : "challenger";
  if (row.status === "finished") {
    result.settled = true;
    result.theirs = row[`${other}_score`];
    result.theirCorrect = row[`${other}_correct`];
    result.delta = row[`${side}_delta`];
    result.them = nameOf(row[other]);
    unwatchRound();
    loadMyStatus().then(() => { if (isOpen() && view === "result") renderResult(); d.onStatusChange?.(); });
  } else {
    loadNames([row.challenger, row.opponent]).then(() => { result.them = nameOf(row[other]); if (isOpen() && view === "result") renderResult(); });
    watchRound(row.id);
  }
  if (isOpen() && view === "result") renderResult();
}

function watchRound(id) {
  if (roundChannel || !d.supabaseEnabled) return;
  roundChannel = d.supabase.channel(`battle:${id}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battles", filter: `id=eq.${id}` }, (payload) => {
      if (payload?.new) applyServerRow(payload.new);
    })
    .subscribe();
}

function unwatchRound() {
  if (roundChannel) { try { d.supabase.removeChannel(roundChannel); } catch { /* ignore */ } }
  roundChannel = null;
}

function simulateBot(a) {
  const rng = rngFrom(`${a.row.seed}-bot`);
  let score = 0, correct = 0;
  a.items.forEach((item) => {
    const limit = limitFor(item);
    const hard = Math.abs(item.b) / MAX_B;           // harder items miss more
    const p = 0.78 - 0.28 * hard;
    if (rng() < p) {
      const ms = limit * (0.25 + 0.5 * rng());
      score += 100 + Math.round(50 * (limit - ms) / limit);
      correct += 1;
    }
  });
  return { score, correct };
}

function renderResult() {
  if (!result) return;
  const esc = d.escapeHtml;
  const r = result;
  const outcome = !r.settled ? "Waiting" : r.mine > r.theirs ? "Victory" : r.mine < r.theirs ? "Defeat" : "Draw";
  const cls = !r.settled ? "is-wait" : r.mine > r.theirs ? "is-win" : r.mine < r.theirs ? "is-loss" : "is-draw";
  const open = r.row.status === "open";
  host.innerHTML = `
    <div class="battle-result ${cls}">
      <p class="battle-eyebrow">${r.local ? "Practice round · unrated" : r.row.mode === "friend" ? "Friend challenge" : "Quick match"}</p>
      <h2 class="battle-outcome-title">${outcome}${r.settled && r.delta != null ? `<span class="battle-delta">${r.delta > 0 ? "+" : ""}${r.delta}</span>` : ""}</h2>
      <div class="battle-scoreboard">
        <div class="battle-side is-you"><span>You</span><strong>${r.mine}</strong><em>${r.correct} of ${ROUNDS} right</em></div>
        <i class="battle-vs">vs</i>
        <div class="battle-side is-them"><span>${esc(r.them)}</span><strong>${r.settled ? r.theirs : "·"}</strong><em>${r.settled && r.theirCorrect != null ? `${r.theirCorrect} of ${ROUNDS} right` : open ? "No opponent yet" : "Still playing"}</em></div>
      </div>
      ${!r.settled && !r.error ? `<p class="battle-note">${open ? "Your score is locked in. The next player to search gets matched against it and you'll see the result here and in Recent." : `We'll settle it the moment ${esc(r.them)} finishes. You can leave; the result lands in Recent.`}</p>` : ""}
      ${r.error ? `<p class="battle-error">${esc(r.error)}</p>` : ""}
      <div class="battle-result-actions">
        ${r.local ? `<button class="battle-primary" data-battle-practice type="button"><span>Play again</span></button>` : r.settled && r.row.mode === "friend" ? `<button class="battle-primary" data-battle-rematch type="button"><span>Rematch</span></button>` : r.settled ? `<button class="battle-primary" data-battle-quick type="button"><span>Quick match</span></button>` : ""}
        <button class="battle-secondary" data-battle-back type="button"><span>Back to Battle</span></button>
      </div>
    </div>`;
}

function rematch() {
  const r = result;
  if (!r || r.local) return;
  const other = otherId(r.row);
  leaveToHub();
  if (other) challengeUser(other);
}

// ---------------------------------------------------------------------------
// Ranks page: IQ leaderboard, battle leaderboard, friends.
// ---------------------------------------------------------------------------
let ranksTab = "iq";
let ranksData = { iq: null, battle: null, incoming: [], outgoing: [], status: "", statusState: "" };

export async function renderRanksPage(pageHost) {
  if (!pageHost) return;
  const esc = d.escapeHtml;
  const me = d.getAuthUser();
  const signedIn = Boolean(me) && !d.isGuest() && d.supabaseEnabled;

  pageHost.onclick = async (event) => {
    const t = event.target;
    const tab = t.closest("[data-ranks-tab]");
    if (tab) { ranksTab = tab.dataset.ranksTab; renderRanksPage(pageHost); return; }
    const ch = t.closest("[data-battle-challenge]");
    if (ch) { challengeUser(ch.dataset.battleChallenge); return; }
    if (t.closest("[data-ranks-add]")) { await addFriend(pageHost); return; }
    const resp = t.closest("[data-ranks-respond]");
    if (resp) {
      try {
        await d.socialApiRequest("/api/friend-requests/respond", { method: "POST", body: { requestId: resp.dataset.requestId, action: resp.dataset.ranksRespond } });
        ranksData.status = resp.dataset.ranksRespond === "accept" ? "Friend added." : "Request ignored.";
        ranksData.statusState = "success";
      } catch (error) { ranksData.status = error.message; ranksData.statusState = "error"; }
      await loadRanksSocial();
      renderRanksPage(pageHost);
    }
  };
  pageHost.onkeydown = (event) => {
    if (event.key === "Enter" && event.target.closest("[data-ranks-input]")) { event.preventDefault(); addFriend(pageHost); }
  };

  const board = ranksData[ranksTab];
  const rowHtml = (row, i) => {
    const mine = me && row.id === me.id;
    const value = ranksTab === "iq" ? row.iq_score : row.battle_rating;
    const sub = ranksTab === "iq"
      ? (row.iq_percentile ? `Top ${Math.max(1, Math.round(100 - row.iq_percentile))}%` : "")
      : `${row.battle_wins}W · ${row.battle_losses}L`;
    return `<li class="ranks-row ${mine ? "is-me" : ""}">
      <span class="ranks-pos">${i + 1}</span>
      <div class="ranks-who"><strong>${esc(displayName(row))}</strong><span>${esc(row.handle ?? "")}</span></div>
      <span class="ranks-sub">${sub}</span>
      <strong class="ranks-val">${value}</strong>
      ${signedIn && !mine ? `<button class="battle-pill is-ghost" data-battle-challenge="${esc(row.id)}" type="button">Duel</button>` : ""}
    </li>`;
  };

  pageHost.innerHTML = `
    <div class="ranks">
      <nav class="ranks-tabs" aria-label="Leaderboards">
        <button class="${ranksTab === "iq" ? "active" : ""}" data-ranks-tab="iq" type="button">IQ</button>
        <button class="${ranksTab === "battle" ? "active" : ""}" data-ranks-tab="battle" type="button">Battle rating</button>
      </nav>
      <section class="ranks-board">
        ${!signedIn ? `<p class="battle-note">Sign in to see where you stand.</p>`
          : board == null ? `<p class="battle-note">Loading…</p>`
          : !board.length ? `<p class="battle-note">${ranksTab === "iq" ? "Nobody has a score yet. Take the IQ test to be first." : "No rated duels yet. Win one and you're on the board."}</p>`
          : `<ol>${board.map(rowHtml).join("")}</ol>`}
      </section>

      <section class="ranks-friends">
        <h3>Friends</h3>
        ${signedIn ? `
          <div class="ranks-add">
            <input data-ranks-input type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="@username">
            <button class="battle-pill" data-ranks-add type="button">Add</button>
          </div>
          ${ranksData.status ? `<p class="battle-status ${ranksData.statusState}">${esc(ranksData.status)}</p>` : ""}
          ${ranksData.incoming.length ? `<ul class="ranks-requests">${ranksData.incoming.map((r) => `
            <li class="battle-row"><div><strong>${esc(r.fromHandle)}</strong><span>wants to be friends</span></div>
              <div class="battle-row-actions">
                <button class="battle-pill" data-ranks-respond="accept" data-request-id="${esc(r.id)}" type="button">Accept</button>
                <button class="battle-pill is-ghost" data-ranks-respond="decline" data-request-id="${esc(r.id)}" type="button">Ignore</button>
              </div></li>`).join("")}</ul>` : ""}
          ${hub.friends.length ? `<ul>${hub.friends.map((f) => `
            <li class="battle-row"><div><strong>${esc(displayName(f))}</strong><span>${f.iq_score ? `IQ ${f.iq_score} · ` : ""}Rating ${f.battle_rating ?? 1000}</span></div>
              <button class="battle-pill" data-battle-challenge="${esc(f.id)}" type="button">Challenge</button></li>`).join("")}</ul>`
          : `<p class="battle-note">No friends yet. Add someone by their @username.</p>`}
          ${ranksData.outgoing.length ? `<p class="battle-note">Pending: ${ranksData.outgoing.map((r) => esc(r.toHandle)).join(", ")}</p>` : ""}
        ` : `<p class="battle-note">Sign in to add friends and challenge them.</p>`}
      </section>
    </div>`;

  if (signedIn && board == null) {
    await loadRanksBoards();
    await loadRanksSocial();
    renderRanksPage(pageHost);
  }
}

async function loadRanksBoards() {
  try {
    const [iq, battle] = await Promise.all([
      d.supabase.from("iq_leaderboard").select("*").limit(50),
      d.supabase.from("battle_leaderboard").select("*").limit(50)
    ]);
    ranksData.iq = iq.data ?? [];
    ranksData.battle = battle.data ?? [];
  } catch {
    ranksData.iq = ranksData.iq ?? [];
    ranksData.battle = ranksData.battle ?? [];
  }
}

async function loadRanksSocial() {
  try {
    const data = await d.socialApiRequest("/api/friend-requests");
    ranksData.incoming = data.incoming ?? [];
    ranksData.outgoing = data.outgoing ?? [];
  } catch { ranksData.incoming = []; ranksData.outgoing = []; }
  await loadFriends().catch(() => {});
}

async function addFriend(pageHost) {
  const input = pageHost.querySelector("[data-ranks-input]");
  const raw = String(input?.value ?? "").trim();
  if (!raw) { ranksData.status = "Enter a @username."; ranksData.statusState = "error"; renderRanksPage(pageHost); return; }
  const toHandle = raw.startsWith("@") ? raw.toLowerCase() : `@${raw.toLowerCase()}`;
  ranksData.status = "Sending…"; ranksData.statusState = "loading";
  renderRanksPage(pageHost);
  try {
    await d.upsertSocialProfile(d.loadUserProfile());
    const res = await d.socialApiRequest("/api/friend-requests", { method: "POST", body: { toHandle } });
    ranksData.status = res.duplicate ? `Already connected with ${toHandle}.` : `Request sent to ${toHandle}.`;
    ranksData.statusState = "success";
  } catch (error) {
    ranksData.status = error.message || "Could not send.";
    ranksData.statusState = "error";
  }
  await loadRanksSocial();
  renderRanksPage(pageHost);
}

// Invalidate caches when the account changes.
export function resetBattleState() {
  stopTimer(); unwatchRound();
  if (hubChannel) { try { d.supabase.removeChannel(hubChannel); } catch { /* ignore */ } hubChannel = null; }
  my = null; arena = null; result = null; view = "hub";
  lobby = null; unwatchLobby(); unwatchPublicLobbies(); friendPickerOpen = false; publicLobbies = []; lobbyBusy = false; stopLoading();
  hub = { battles: [], names: new Map(), friends: [], loading: false, error: "" };
  ranksData = { iq: null, battle: null, incoming: [], outgoing: [], status: "", statusState: "" };
}
