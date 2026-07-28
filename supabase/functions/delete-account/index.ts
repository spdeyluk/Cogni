// Cogni · delete-account Edge Function
// ---------------------------------------------------------------------------
// Permanently deletes the signed-in user's account and data. Required by App
// Store guideline 5.1.1(v): apps with account creation must let users delete
// their account from inside the app.
//
// Deleting the auth user cascades to the public tables (entitlements,
// user_state, profiles, friend_requests) via their `on delete cascade`
// references to auth.users. We also best-effort cancel any Stripe subscription
// so a deleted account is never billed again.
//
// Deploy WITHOUT JWT verification (auth is checked in-function via getUser):
//   supabase functions deploy delete-account --no-verify-jwt
// ---------------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@^2";
import Stripe from "npm:stripe@^17.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    // Identify the caller from their Supabase JWT.
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json({ error: "not signed in" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Best-effort: cancel any active Stripe subscription before deleting.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      try {
        const { data: ent } = await admin
          .from("entitlements")
          .select("stripe_subscription_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (ent?.stripe_subscription_id) {
          const stripe = new Stripe(stripeKey, {
            apiVersion: "2024-06-20",
            httpClient: Stripe.createFetchHttpClient(),
          });
          await stripe.subscriptions.cancel(ent.stripe_subscription_id);
        }
      } catch (e) {
        console.error("[delete-account] stripe cancel failed (continuing)", e);
      }
    }

    // Delete the auth user — cascades to the user's rows in public tables.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return json({ ok: true });
  } catch (err) {
    console.error("[delete-account]", err);
    return json({ error: "delete failed" }, 500);
  }
});
