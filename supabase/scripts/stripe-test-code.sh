#!/usr/bin/env bash
# Free end-to-end test of Cogni Pass on the LIVE Stripe account.
#
#   bash supabase/scripts/stripe-test-code.sh            # set up: one-use 100%-off code COGNITEST (24 h)
#   bash supabase/scripts/stripe-test-code.sh cleanup sub_xxx   # after the test: cancel that subscription,
#                                                               # retire the code, restore the Payment Link
#
# Setup creates a coupon (100% off, first invoice only, one redemption, expires in
# a day), a promotion code COGNITEST on it, and switches the Pass Payment Link to
# accept promotion codes and to skip the card form when nothing is due. Nothing is
# charged: the first invoice is $0 and cleanup cancels the subscription before the
# next one. Stripe secret keys are never printed or stored by this script.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
LINK="plink_1UfyVm9XSnaDI8In9XqCf5H4"
CODE="COGNITEST"
command -v stripe >/dev/null || { echo "stripe CLI not found (expected in ~/.local/bin)"; exit 1; }

mode="${1:-setup}"
case "$mode" in
  setup)
    exp=$(( $(date +%s) + 86400 ))
    python3 - "$exp" "$LINK" "$CODE" <<'PY'
import json, subprocess, sys
exp, link_id, code = sys.argv[1:]
def stripe(*args):
    r = subprocess.run(["stripe", *args, "--live"], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("stripe " + " ".join(args[:2]) + " failed: " + (r.stderr or r.stdout).strip()[:400])
    return json.loads(r.stdout)
existing = [p for p in stripe("promotion_codes", "list", "-d", f"code={code}", "-d", "active=true", "-d", "limit=5").get("data", []) if p.get("active")]
if existing:
    promo = existing[0]
    print(f"promotion code {code} already active ({promo['id']}), reusing it")
else:
    coupon = stripe("coupons", "create", "-d", "percent_off=100", "-d", "duration=once", "-d", "max_redemptions=1",
                    "-d", f"redeem_by={exp}", "-d", "name=Cogni Pass test (one use)")
    promo = stripe("promotion_codes", "create", "-d", f"coupon={coupon['id']}", "-d", f"code={code}",
                   "-d", "max_redemptions=1", "-d", f"expires_at={exp}")
    print(f"coupon {coupon['id']}: 100% off once, 1 redemption")
    print(f"promotion code {promo['code']} ({promo['id']}): active, 1 redemption, expires in 24 h")
link = stripe("payment_links", "update", link_id, "-d", "allow_promotion_codes=true", "-d", "payment_method_collection=if_required")
print(f"payment link {link['id']}: promotion codes {'on' if link['allow_promotion_codes'] else 'off'}, card only when something is due ({link['payment_method_collection']})")
print()
print("Next: sign in to https://getcogni.app with your real account, open Cogni Pass, click Get Cogni Pass,")
print(f"enter the code {code} on the Stripe page, and complete it. Nothing is charged.")
PY
    ;;
  cleanup)
    sub="${2:-}"
    [ -n "$sub" ] || { echo "usage: $0 cleanup sub_xxx"; exit 1; }
    python3 - "$sub" "$LINK" "$CODE" <<'PY'
import json, subprocess, sys
sub_id, link_id, code = sys.argv[1:]
def stripe(*args, ok_fail=False):
    r = subprocess.run(["stripe", *args, "--live"], capture_output=True, text=True)
    if r.returncode != 0:
        if ok_fail: print("  (skipped:", (r.stderr or r.stdout).strip()[:160] + ")"); return None
        sys.exit("stripe " + " ".join(args[:2]) + " failed: " + (r.stderr or r.stdout).strip()[:400])
    return json.loads(r.stdout)
sub = stripe("subscriptions", "cancel", sub_id, ok_fail=True)
if sub: print(f"subscription {sub['id']}: {sub['status']}")
for p in stripe("promotion_codes", "list", "-d", f"code={code}", "-d", "active=true", "-d", "limit=5").get("data", []):
    stripe("promotion_codes", "update", p["id"], "-d", "active=false")
    print(f"promotion code {code} ({p['id']}): retired")
link = stripe("payment_links", "update", link_id, "-d", "allow_promotion_codes=false", "-d", "payment_method_collection=always")
print(f"payment link {link['id']}: promotion codes off, card always collected")
PY
    ;;
  *) echo "usage: $0 [setup|cleanup sub_xxx]"; exit 1 ;;
esac
