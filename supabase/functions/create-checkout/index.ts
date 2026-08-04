// Cogni · create-checkout Edge Function
// ---------------------------------------------------------------------------
// Starts a Stripe Checkout session for the signed-in user and returns its URL,
// which the client redirects to. The Stripe secret key lives only here (a
// function secret), never in the browser.
//
// Secrets (Dashboard -> Edge Functions -> create-checkout -> Secrets, or
// `supabase secrets set KEY=value`):
//   STRIPE_SECRET_KEY            sk_live_... (or sk_test_...)
//   STRIPE_PRICE_BASIC_MONTHLY   price_...   (create these 4 in Stripe -> Products)
//   STRIPE_PRICE_BASIC_ANNUAL    price_...
//   STRIPE_PRICE_PRO_MONTHLY     price_...
//   STRIPE_PRICE_PRO_ANNUAL      price_...
//   STRIPE_PRICE_PRO_WEEKLY      price_...   (the native paywall's weekly plan)
//   STRIPE_PRICE_MEASUREMENT_MONTHLY price_...  (web: Cogni Measurement, EUR 14.99/mo)
//   SITE_URL                     https://getcogni.app   (where Stripe returns to)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the platform.
//
// Deploy:  supabase functions deploy create-checkout
// ---------------------------------------------------------------------------
import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://getcogni.app";

const PRICES: Record<string, string | undefined> = {
  "basic:monthly": Deno.env.get("STRIPE_PRICE_BASIC_MONTHLY"),
  "basic:annual": Deno.env.get("STRIPE_PRICE_BASIC_ANNUAL"),
  "pro:monthly": Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
  "pro:annual": Deno.env.get("STRIPE_PRICE_PRO_ANNUAL"),
  // The native paywall sells yearly or weekly. Until this price exists in
  // Stripe and the secret is set, a weekly checkout returns "unknown plan".
  "pro:weekly": Deno.env.get("STRIPE_PRICE_PRO_WEEKLY"),
  // Web sells exactly one thing: the Cogni Measurement report, monthly.
  "measurement:monthly": Deno.env.get("STRIPE_PRICE_MEASUREMENT_MONTHLY"),
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    // Identify the caller from their Supabase JWT (sent by supabase.functions.invoke).
    const authHeader = req.headers.get("Authorization") ?? "";
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json({ error: "not signed in" }, 401);

    const { plan, billing } = await req.json().catch(() => ({}));
    const priceId = PRICES[`${plan}:${billing}`];
    if (!priceId) return json({ error: "unknown plan" }, 400);

    // Reuse the user's Stripe customer if we've seen them, else create one.
    // The service_role client bypasses RLS to read/write the mapping.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: ent } = await admin
      .from("entitlements")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = ent?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("entitlements")
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/home?checkout=success`,
      cancel_url: `${SITE_URL}/home?checkout=cancelled`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("[create-checkout]", err);
    return json({ error: "checkout failed" }, 500);
  }
});
