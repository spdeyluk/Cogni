// Cogni · apple-webhook Edge Function
// ---------------------------------------------------------------------------
// App Store Server Notifications V2. Apple calls this on renewal, cancellation,
// refund, billing failure and so on — the Apple-side twin of stripe-webhook.
//
// The notification is only read for its originalTransactionId; the entitlement
// is then re-fetched from Apple's App Store Server API over an authenticated
// connection. A spoofed notification therefore cannot grant anything: the
// lookup returns whatever is actually true for that subscription.
//
// Secrets: the same APPLE_* set as apple-verify.
//
// Deploy WITHOUT JWT verification (Apple sends no Supabase token):
//   supabase functions deploy apple-webhook --no-verify-jwt
//
// Then App Store Connect -> your app -> App Information -> App Store Server
// Notifications -> V2 URL:
//   https://<project-ref>.supabase.co/functions/v1/apple-webhook
// ---------------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@^2";
import { appleSubscriptionState, decodeJws, json, cors } from "../_shared/apple.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { signedPayload } = await req.json().catch(() => ({}));
    if (typeof signedPayload !== "string") return json({ error: "bad payload" }, 400);

    const notification = decodeJws(signedPayload);
    const renewalInfo = decodeJws(notification?.data?.signedRenewalInfo ?? "");
    const txInfo = decodeJws(notification?.data?.signedTransactionInfo ?? "");
    const originalId = renewalInfo?.originalTransactionId ?? txInfo?.originalTransactionId;
    if (!originalId) {
      // Nothing actionable (e.g. a TEST notification). Ack so Apple stops retrying.
      return json({ ok: true, ignored: notification?.notificationType ?? "unknown" });
    }

    // We only know which user this is if they have already been linked by a
    // purchase through apple-verify. Ack anything else rather than retrying.
    const { data: row } = await admin
      .from("entitlements")
      .select("user_id")
      .eq("apple_original_transaction_id", String(originalId))
      .maybeSingle();
    if (!row?.user_id) {
      return json({ ok: true, ignored: "unlinked transaction" });
    }

    const state = await appleSubscriptionState(String(originalId));
    if (!state.found) return json({ ok: true, ignored: "not found upstream" });

    await admin.from("entitlements").update({
      tier: state.active ? "pro" : "free",
      status: state.status,
      source: "apple",
      apple_product_id: state.productId ?? null,
      current_period_end: state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", row.user_id);

    return json({ ok: true });
  } catch (err) {
    console.error("[apple-webhook]", err);
    // 500 makes Apple retry, which is what we want for a transient failure.
    return json({ error: "handler failed" }, 500);
  }
});
