-- ===========================================================================
-- Cogni · Apple In-App Purchase entitlements
-- ---------------------------------------------------------------------------
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run.
--
-- Extends the table stripe.sql created rather than adding a second one: a user
-- has ONE tier no matter where they paid, and every gate in the app already
-- reads public.entitlements. Web subscribers arrive via stripe-webhook, iOS
-- subscribers via apple-webhook / verify-apple-purchase. Both use the
-- service_role key, so RLS still keeps the row unforgeable by clients.
-- ===========================================================================

-- Which store the current subscription came from. Needed so a renewal from one
-- provider can't be overwritten by a stale event from the other.
alter table public.entitlements
  add column if not exists source text
    check (source is null or source in ('stripe', 'apple'));

-- Apple's stable per-subscriber key. originalTransactionId stays constant
-- across renewals, upgrades and restores, so it is what we match on.
alter table public.entitlements
  add column if not exists apple_original_transaction_id text;

-- Apple's product id for the active subscription, for support and debugging.
alter table public.entitlements
  add column if not exists apple_product_id text;

create unique index if not exists entitlements_apple_original_tx_idx
  on public.entitlements(apple_original_transaction_id)
  where apple_original_transaction_id is not null;

-- stripe_customer_id was implicitly the identity of a paying user; an Apple
-- subscriber has none, so make sure nothing depends on it being present.
alter table public.entitlements
  alter column stripe_customer_id drop not null;
