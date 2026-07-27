// Cogni · stripe-webhook Edge Function
// ---------------------------------------------------------------------------
// The single source of truth for who is Pro. Stripe calls this after every
// subscription change; we verify the signature and write the result into
// public.entitlements with the service_role key. Nothing else writes that table.
//
// Secrets (share the same STRIPE_SECRET_KEY + price ids as create-checkout):
//   STRIPE_SECRET_KEY            sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET        whsec_...  (from the Stripe webhook endpoint you create)
//   STRIPE_PRICE_PLUS_MONTHLY / _ANNUAL / STRIPE_PRICE_PRO_MONTHLY / _ANNUAL
//
// Deploy WITHOUT JWT verification (Stripe doesn't send a Supabase token):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Then in Stripe -> Developers -> Webhooks -> Add endpoint:
//   URL:  https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.created,
//           customer.subscription.updated, customer.subscription.deleted
//   Copy the signing secret (whsec_...) into STRIPE_WEBHOOK_SECRET.
// ---------------------------------------------------------------------------
import Stripe from "npm:stripe@^17.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Map each configured Stripe price id to the tier it grants.
const PRICE_TIER: Record<string, "plus" | "pro"> = {};
const plusIds = [Deno.env.get("STRIPE_PRICE_PLUS_MONTHLY"), Deno.env.get("STRIPE_PRICE_PLUS_ANNUAL")];
const proIds = [Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), Deno.env.get("STRIPE_PRICE_PRO_ANNUAL")];
for (const id of plusIds) if (id) PRICE_TIER[id] = "plus";
for (const id of proIds) if (id) PRICE_TIER[id] = "pro";

async function applySubscription(sub: Stripe.Subscription, fallbackUserId?: string) {
  const userId = (sub.metadata?.user_id as string | undefined) || fallbackUserId;
  if (!userId) {
    console.error("[webhook] subscription without user_id", sub.id);
    return;
  }
  const priceId = sub.items.data[0]?.price?.id ?? "";
  const active = sub.status === "active" || sub.status === "trialing";
  const tier = active ? (PRICE_TIER[priceId] ?? "free") : "free";
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

  const { error } = await admin.from("entitlements").upsert({
    user_id: userId,
    tier,
    status: sub.status,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) console.error("[webhook] upsert failed", error);
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature ?? "", webhookSecret, undefined, cryptoProvider,
    );
  } catch (err) {
    console.error("[webhook] bad signature", err);
    return new Response("bad signature", { status: 400 });
  }

  try {
    if (event.type.startsWith("customer.subscription.")) {
      await applySubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await applySubscription(sub, session.client_reference_id ?? undefined);
      }
    }
  } catch (err) {
    console.error("[webhook] handler error", err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
