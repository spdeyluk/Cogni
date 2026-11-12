-- Cogni referral unlock. Run in the Supabase SQL editor after battles.sql.
-- Idempotent.
--
-- Every profile carries a referral code. A brand-new account that signs up
-- through ?ref=CODE claims it once; the referrer's count goes up. Three
-- referrals unlock the IQ test (the client also unlocks it for Cogni Pass).

alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by   uuid references auth.users(id) on delete set null,
  add column if not exists referrals     integer not null default 0;

-- Backfill codes for existing rows before the trigger below pins the column.
update public.profiles
   set referral_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
 where referral_code is null;

alter table public.profiles
  alter column referral_code set default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

create unique index if not exists profiles_referral_code_idx on public.profiles (referral_code);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

-- Pin the server-owned columns: ratings (from battles.sql) and now referrals.
create or replace function public.protect_profile_rating()
returns trigger
language plpgsql
as $$
begin
  if current_setting('cogni.allow_rating_write', true) is distinct from 'on' then
    new.battle_rating := old.battle_rating;
    new.battle_wins   := old.battle_wins;
    new.battle_losses := old.battle_losses;
    new.battle_draws  := old.battle_draws;
    new.referral_code := old.referral_code;
    new.referred_by   := old.referred_by;
    new.referrals     := old.referrals;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_rating on public.profiles;
create trigger protect_profile_rating
  before update on public.profiles
  for each row execute function public.protect_profile_rating();

-- Claim a referral for the signed-in user. Returns the referrer's new count,
-- or 0 when nothing changed (already referred, own code, old account).
create or replace function public.referral_claim(p_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  referrer uuid;
  mine public.profiles;
  joined timestamptz;
  total integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if code = '' then return 0; end if;

  select * into mine from public.profiles where id = me for update;
  if not found then return 0; end if;
  if mine.referred_by is not null then return 0; end if;

  -- Only accounts created in the last two days count: an old account
  -- pasting a friend's link is not a new sign-up.
  select created_at into joined from auth.users where id = me;
  if joined is null or joined < now() - interval '2 days' then return 0; end if;

  select id into referrer from public.profiles where referral_code = code;
  if referrer is null or referrer = me then return 0; end if;

  perform set_config('cogni.allow_rating_write', 'on', true);
  update public.profiles set referred_by = referrer where id = me;
  update public.profiles set referrals = referrals + 1 where id = referrer
    returning referrals into total;
  perform set_config('cogni.allow_rating_write', 'off', true);
  return coalesce(total, 0);
end;
$$;

grant execute on function public.referral_claim(text) to authenticated;
