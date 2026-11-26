#!/usr/bin/env bash
# Creates the live Stripe webhook endpoint for Cogni Pass and stores its signing
# secret as the STRIPE_WEBHOOK_SECRET Supabase secret, without ever printing it.
# Run from the repo root:  bash supabase/scripts/stripe-webhook-setup.sh
# Safe to re-run: an existing endpoint for the URL is replaced so its secret can be stored.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
REF="vuydvhvlcagelwbztewx"
URL="https://${REF}.supabase.co/functions/v1/stripe-webhook"

# The signing secret is only ever shown at creation. If an endpoint for this URL
# already exists (for example from a run whose secret step failed), rotate it:
# delete and recreate, so a fresh secret can be stored.
existing=$(stripe webhook_endpoints list --live 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(e["id"] for e in d.get("data",[]) if e.get("url")=="'"$URL"'"))')
for id in $existing; do
  echo "Replacing existing endpoint $id (its secret cannot be read back)"
  stripe webhook_endpoints delete "$id" --live --confirm >/dev/null
done

stripe webhook_endpoints create --live \
  --url "$URL" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "description=Cogni Pass entitlements (getcogni.app)" \
| python3 -c '
import json, sys, subprocess, re
raw = sys.stdin.read()
try:
    o = json.loads(raw)
except Exception:
    print("Stripe did not return JSON:", re.sub(r"whsec_[A-Za-z0-9]+", "whsec_<hidden>", raw)[:300]); sys.exit(1)
secret = o.pop("secret", None)
print("Webhook endpoint:", o.get("id"), o.get("status"), o.get("url"))
print("Events:", ", ".join(o.get("enabled_events", [])))
if not secret:
    print("No signing secret in the response; reveal it in the dashboard and set STRIPE_WEBHOOK_SECRET by hand."); sys.exit(1)
r = subprocess.run(["supabase", "secrets", "set", "--yes", "--project-ref", "'"$REF"'", "STRIPE_WEBHOOK_SECRET=" + secret], capture_output=True, text=True)
print("STRIPE_WEBHOOK_SECRET:", "stored" if r.returncode == 0 else "FAILED " + (r.stdout + r.stderr).replace(secret, "<hidden>")[-300:])
'
