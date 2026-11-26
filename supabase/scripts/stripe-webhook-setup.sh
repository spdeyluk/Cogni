#!/usr/bin/env bash
# Creates the live Stripe webhook endpoint for Cogni Pass and stores its signing
# secret as the STRIPE_WEBHOOK_SECRET Supabase secret, without ever printing it.
# Run from the repo root:  bash supabase/scripts/stripe-webhook-setup.sh
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
REF="vuydvhvlcagelwbztewx"
URL="https://${REF}.supabase.co/functions/v1/stripe-webhook"

existing=$(stripe webhook_endpoints list --live 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(e["id"] for e in d.get("data",[]) if e.get("url")=="'"$URL"'"))')
if [ -n "$existing" ]; then
  echo "A webhook endpoint for $URL already exists: $existing"
  echo "Reveal its signing secret in the Stripe dashboard and run:"
  echo "  supabase secrets set --project-ref $REF STRIPE_WEBHOOK_SECRET=\"\$(pbpaste)\""
  exit 0
fi

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
r = subprocess.run(["supabase", "secrets", "set", "--project-ref", "'"$REF"'", "STRIPE_WEBHOOK_SECRET=" + secret], capture_output=True, text=True)
print("STRIPE_WEBHOOK_SECRET:", "stored" if r.returncode == 0 else "FAILED " + (r.stdout + r.stderr).replace(secret, "<hidden>")[-300:])
'
