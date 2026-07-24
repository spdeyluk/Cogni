// Cogni · lead-sync Edge Function
// ---------------------------------------------------------------------------
// The one bit of custom backend that survives the Supabase migration: pushing a
// captured lead to Brevo (email/SMS list). Wire it as a Database Webhook:
//   Dashboard -> Database -> Webhooks -> Create
//     table: public.leads, event: INSERT, type: Supabase Edge Function -> lead-sync
//
// Set these as function secrets (Dashboard -> Edge Functions -> lead-sync ->
// Secrets), NOT in the client:
//   BREVO_API_KEY   — your Brevo v3 API key
//   BREVO_LIST_ID   — (optional) numeric list id to add contacts to
//
// Deploy:  supabase functions deploy lead-sync
// ---------------------------------------------------------------------------

const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
const brevoListId = Number(Deno.env.get("BREVO_LIST_ID")) || null;

// Brevo only accepts internationally formatted mobile numbers.
function normalizeSmsNumber(raw: string | null): string | null {
  let digits = String(raw ?? "").replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  return /^\+[0-9]{8,15}$/.test(digits) ? digits : null;
}

async function postBrevoContact(body: unknown) {
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok || res.status === 204) return { ok: true };
  return { ok: false, status: res.status, detail: await res.text() };
}

Deno.serve(async (request) => {
  if (!brevoApiKey) return new Response("BREVO_API_KEY not set", { status: 200 });

  let lead: Record<string, unknown> = {};
  try {
    const payload = await request.json();
    // Database Webhook payloads look like { type, table, record, old_record }.
    lead = payload?.record ?? payload ?? {};
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const email = typeof lead.email === "string" ? lead.email : "";
  const sms = normalizeSmsNumber(lead.phone as string | null);
  if (!email && !sms) return new Response("nothing to sync", { status: 200 });

  const attributes: Record<string, unknown> = { LEAD_SOURCE: lead.source ?? "web" };
  if (sms) attributes.SMS = sms;
  if (Number.isFinite(lead.score as number)) attributes.IQ_SCORE = lead.score;

  const body = {
    updateEnabled: true,
    attributes,
    ...(email ? { email } : {}),
    ...(brevoListId ? { listIds: [brevoListId] } : {}),
  };

  let result = await postBrevoContact(body);
  if (!result.ok && attributes.SMS) {
    // A bad/duplicate SMS number must not lose the email lead.
    delete attributes.SMS;
    result = await postBrevoContact(body);
  }
  if (!result.ok) console.error(`[brevo] sync failed (${result.status}): ${result.detail}`);

  return new Response(JSON.stringify({ ok: result.ok }), {
    headers: { "Content-Type": "application/json" },
  });
});
