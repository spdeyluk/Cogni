-- ===========================================================================
-- Cogni · Stripe entitlements
-- ---------------------------------------------------------------------------
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run.
--
-- One row per user describing what they've paid for. Clients may only READ
-- their own row; the ONLY writer is the stripe-webhook Edge Function, which
-- uses the service_role key (bypasses RLS). This is what makes the paywall
-- unforgeable: a user can flip localStorage all they like, but the source of
-- truth is a row only Stripe's verified webhook can set.
-- ===========================================================================

create table if not exists public.entitlements (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  tier                   text not null default 'free' check (tier in ('free','basic','pro')),
  status                 text not null default 'inactive',   -- raw Stripe subscription status
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists entitlements_customer_idx on public.entitlements(stripe_customer_id);

alter table public.entitlements enable row level security;

-- Users can read only their own entitlement.
drop policy if exists "entitlements select own" on public.entitlements;
create policy "entitlements select own"
  on public.entitlements for select to authenticated using (auth.uid() = user_id);

-- No insert / update / delete policy on purpose: clients can never write here.
-- The stripe-webhook function writes via service_role, which bypasses RLS.
