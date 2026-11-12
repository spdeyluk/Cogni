// Referral unlock for the IQ test (web build).
//
// Everyone gets a code. A link like getcogni.app/?ref=CODE is remembered in
// localStorage until the visitor signs up, then claimed once through the
// referral_claim RPC (which only counts brand-new accounts). Three sign-ups
// unlock the IQ test for good; Cogni Pass unlocks it immediately.

export const REFERRALS_NEEDED = 3;
const STORAGE_KEY = "cogni.referral.v1";

let d = null;
let dialog = null;

export function initReferral(deps) {
  d = deps;
  document.addEventListener("click", onDocumentClick);
}

// Remember ?ref=CODE from the landing URL and strip it so it never gets
// shared on, then copied, as someone else's link.
export function captureReferralCode() {
  try {
    const url = new URL(window.location.href);
    const code = normalizeCode(url.searchParams.get("ref"));
    if (!code) return;
    localStorage.setItem(STORAGE_KEY, code);
    url.searchParams.delete("ref");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch { /* storage or URL unavailable */ }
}

function pendingCode() {
  try { return normalizeCode(localStorage.getItem(STORAGE_KEY)); } catch { return ""; }
}

function clearPending() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function normalizeCode(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16);
}

// Called after sign-in. Resolves true when a referral was recorded.
export async function claimPendingReferral() {
  const code = pendingCode();
  if (!code || !d?.supabaseEnabled || !d.getAuthUser() || d.isGuest()) return false;
  try {
    const { data, error } = await d.supabase.rpc("referral_claim", { p_code: code });
    if (error) {
      // A missing function means the migration is not applied yet: keep the
      // code so it can be claimed once it is. Anything else is final.
      if (!/function|schema cache/i.test(error.message)) clearPending();
      return false;
    }
    clearPending();
    return Number(data) > 0;
  } catch {
    return false;
  }
}

export function referralCount() {
  return Number(d?.myStatus()?.referrals ?? 0) || 0;
}

export function referralUnlocked() {
  return referralCount() >= REFERRALS_NEEDED;
}

export function referralLink() {
  const code = d?.myStatus()?.referral_code;
  if (!code) return "";
  return `${window.location.origin}/?ref=${code}`;
}

// ---------------------------------------------------------------------------
// Markup: one panel used inline on the IQ page and inside the dialog.
// ---------------------------------------------------------------------------
export function referralPanelHtml({ compact = false } = {}) {
  const esc = d.escapeHtml;
  const count = Math.min(REFERRALS_NEEDED, referralCount());
  const link = referralLink();
  const signedIn = Boolean(d.getAuthUser()) && !d.isGuest();
  const dots = Array.from({ length: REFERRALS_NEEDED }, (_, i) => `<i class="${i < count ? "is-on" : ""}"></i>`).join("");
  const linkRow = !signedIn
    ? `<p class="referral-note">Sign in to get your invite link.</p>`
    : link
      ? `<div class="referral-link"><input type="text" readonly value="${esc(link)}" aria-label="Your invite link"><button type="button" class="battle-pill" data-referral-copy>Copy</button></div>`
      : `<p class="referral-note">Preparing your invite link…</p>`;
  return `
    <div class="referral-panel${compact ? " is-compact" : ""}" data-referral-panel>
      <p class="battle-eyebrow">IQ test · locked</p>
      <h3 class="referral-title">Invite ${REFERRALS_NEEDED} friends to unlock it</h3>
      <p class="referral-sub">When ${REFERRALS_NEEDED} people sign up with your link, the test opens for good. Your score then goes on your profile and the leaderboard, and into every duel.</p>
      <div class="referral-progress" aria-label="${count} of ${REFERRALS_NEEDED} signed up">${dots}<span>${count} of ${REFERRALS_NEEDED} signed up</span></div>
      ${linkRow}
      <div class="referral-actions">
        ${signedIn && link && typeof navigator.share === "function" ? `<button type="button" class="battle-secondary" data-referral-share>Share link</button>` : ""}
        <button type="button" class="battle-secondary" data-referral-pass>Or get Cogni Pass</button>
      </div>
    </div>`;
}

// Re-fill every inline panel on the page (after the profile row loads).
export function refreshReferralPanels() {
  for (const host of document.querySelectorAll("[data-referral-host]")) {
    host.innerHTML = referralPanelHtml({ compact: host.dataset.referralHost === "compact" });
  }
  if (dialog?.open) dialog.querySelector(".referral-dialog-body").innerHTML = referralPanelHtml();
}

export function openReferralDialog() {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "referral-dialog";
    dialog.innerHTML = `
      <div class="referral-dialog-card">
        <button type="button" class="referral-dialog-close" data-referral-close aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="referral-dialog-body"></div>
      </div>`;
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
  }
  dialog.querySelector(".referral-dialog-body").innerHTML = referralPanelHtml();
  if (!dialog.open) dialog.showModal();
  d.syncPublicStatus?.().then(() => { if (dialog.open) refreshReferralPanels(); }).catch(() => {});
}

async function onDocumentClick(event) {
  const copy = event.target.closest("[data-referral-copy]");
  if (copy) {
    const link = referralLink();
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = "Copied";
      setTimeout(() => { copy.textContent = "Copy"; }, 1600);
    } catch {
      copy.closest(".referral-link")?.querySelector("input")?.select();
    }
    return;
  }
  if (event.target.closest("[data-referral-share]")) {
    try { await navigator.share({ title: "Cogni", text: "Take the IQ test on Cogni and duel me.", url: referralLink() }); } catch { /* cancelled */ }
    return;
  }
  if (event.target.closest("[data-referral-pass]")) {
    dialog?.close();
    d.openPricingModal();
    return;
  }
  if (event.target.closest("[data-referral-close]")) dialog?.close();
}
