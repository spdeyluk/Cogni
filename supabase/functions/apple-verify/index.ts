// Cogni · apple-verify Edge Function
// ---------------------------------------------------------------------------
// The iOS app calls this straight after a purchase or a restore. It takes the
// signed transaction (JWS) StoreKit handed the client, asks Apple what that
// subscription's real status is, and writes the answer into public.entitlements.
//
// Security note: the JWS from the client is only ever used to READ an id out of
// it. The entitlement decision comes from an authenticated call to Apple's App
// Store Server API, so a tampered or invented payload can't grant anything —
// the lookup simply returns the truth (or 404s).
//
// Secrets (Dashboard -> Edge Functions -> apple-verify -> Secrets):
//   APPLE_ISSUER_ID    App Store Connect -> Users and Access -> Integrations
//   APPLE_KEY_ID       the key id of the .p8 you generated there
//   APPLE_PRIVATE_KEY  full contents of the .p8, newlines included
//   APPLE_BUNDLE_ID    com.spidey.cogni
//   APPLE_ENVIRONMENT  "Production" or "Sandbox" (default Production, falls
//                      back to Sandbox automatically so TestFlight works)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// Deploy: supabase functions deploy apple-verify
// ---------------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@^2";
import {
  appleSubscriptionState,
  decodeJws,
  json,
  cors,
  type AppleState,
} from "../_shared/apple.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    // Identify the caller from their Supabase JWT.
    const authed = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json({ error: "not signed in" }, 401);

    const { jws } = await req.json().catch(() => ({}));
    if (typeof jws !== "string" || !jws) return json({ error: "jws required" }, 400);

    // Read the id only — this payload is not trusted for anything else.
    const claims = decodeJws(jws);
    const originalId = claims?.originalTransactionId ?? claims?.transactionId;
    if (!originalId) return json({ error: "malformed transaction" }, 400);

    const state: AppleState = await appleSubscriptionState(String(originalId));
    if (!state.found) return json({ error: "unknown transaction" }, 404);

    await admin.from("entitlements").upsert({
      user_id: user.id,
      tier: state.active ? "pro" : "free",
      status: state.status,
      source: "apple",
      apple_original_transaction_id: String(originalId),
      apple_product_id: state.productId ?? null,
      current_period_end: state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return json({ tier: state.active ? "pro" : "free", status: state.status });
  } catch (err) {
    console.error("[apple-verify]", err);
    return json({ error: "verification failed" }, 500);
  }
});
