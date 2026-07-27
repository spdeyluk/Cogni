# Connecting Stripe (web payments)

The code is done. These are the dashboard/CLI steps only you can do, because they
need your Stripe + Supabase credentials. ~15 minutes.

> **iOS note:** this is web/desktop only. Apple requires StoreKit in-app purchase
> for subscriptions inside the iOS app — Stripe can't be used there. The iOS app
> needs a separate IAP flow later; it can write to the same `entitlements` table.

---

## 1. Database (1 min)

Supabase Dashboard → **SQL Editor** → New query → paste `supabase/stripe.sql` → **Run**.
Creates the `entitlements` table (users read their own row; only the webhook writes it).

## 2. Create the 4 prices in Stripe (5 min)

Stripe Dashboard → **Products** → add a product with a recurring price for each.
Copy each **Price ID** (`price_...`):

| Plan | Billing | Amount | Shown in app as |
|------|---------|--------|-----------------|
| Basic | Monthly | **$9 / month** | $9/mo |
| Basic | Yearly  | **$59 / year** | $4.92/mo |
| Pro  | Monthly | **$19 / month** | $19/mo |
| Pro  | Yearly  | **$149 / year** | $12.42/mo |

(**Basic** = all exercises + data. **Pro** = also routines, AI coach and the IQ test.)

## 3. Deploy the two functions (2 min)

From the repo root (needs the Supabase CLI + `supabase login` + `supabase link`):

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook is required — Stripe calls it without a Supabase token.

## 4. Set the secrets (2 min)

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_PRICE_BASIC_MONTHLY=price_xxx \
  STRIPE_PRICE_BASIC_ANNUAL=price_xxx \
  STRIPE_PRICE_PRO_MONTHLY=price_xxx \
  STRIPE_PRICE_PRO_ANNUAL=price_xxx \
  SITE_URL=https://getcogni.app
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are provided
automatically — don't set them.)

## 5. Create the webhook, then add its secret (2 min)

Stripe → **Developers → Webhooks → Add endpoint**:

- **URL:** `https://vuydvhvlcagelwbztewx.supabase.co/functions/v1/stripe-webhook`
- **Events:** `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`

Copy the endpoint's **Signing secret** (`whsec_...`) and set it:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## 6. Test

Use Stripe **test mode** first (`sk_test_...` key + test price IDs + test webhook).
Open the app → Upgrade → pay with card `4242 4242 4242 4242`, any future expiry/CVC.
You should land back on `/home`, see "Welcome to Pro", and the Profile / Screen Time /
Advanced settings paywalls should unlock within a few seconds. Flip to live keys when happy.

---

### How it fits together
- **Upgrade button** → `create-checkout` (has your secret key) → Stripe Checkout page.
- Payment → Stripe → **`stripe-webhook`** verifies the signature and writes `entitlements`
  with the service_role key. That row is the unforgeable source of truth.
- The app calls `refreshEntitlement()` on sign-in and after checkout, mirroring the row into
  a local flag that `isProUser()` reads. Someone editing localStorage gains nothing —
  a page reload re-reads the real entitlement.
