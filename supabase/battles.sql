-- Cogni social layer, part 2: public IQ status and 1v1 battles.
-- Run in the Supabase SQL editor after schema.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Profiles carry the status fields every other user may see.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name   text,
  add column if not exists iq_score       integer check (iq_score is null or iq_score between 40 and 200),
  add column if not exists iq_percentile  numeric,
  add column if not exists iq_taken_at    timestamptz,
  add column if not exists battle_rating  integer not null default 1000,
  add column if not exists battle_wins    integer not null default 0,
  add column if not exists battle_losses  integer not null default 0,
  add column if not exists battle_draws   integer not null default 0,
  add column if not exists last_seen_at   timestamptz;

create index if not exists profiles_iq_score_idx on public.profiles (iq_score desc nulls last);
create index if not exists profiles_battle_rating_idx on public.profiles (battle_rating desc);

-- Rating fields are only ever written by the battle functions below (security
-- definer). A user may still update their own handle / name / IQ via RLS, but
-- never their rating columns: a trigger pins them.
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
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_rating on public.profiles;
create trigger protect_profile_rating
  before update on public.profiles
  for each row execute function public.protect_profile_rating();

-- ---------------------------------------------------------------------------
-- Battles. One row per duel. Both players answer the same seeded item set.
--   open      challenger waiting for anyone (quick match)
--   active    both seats filled, at least one side still playing
--   finished  both results in, rating applied
--   expired   nobody joined / opponent never played
-- ---------------------------------------------------------------------------
create table if not exists public.battles (
  id                 uuid primary key default gen_random_uuid(),
  challenger         uuid not null references auth.users(id) on delete cascade,
  opponent           uuid references auth.users(id) on delete cascade,
  status             text not null default 'open'
                     check (status in ('open','active','finished','expired')),
  mode               text not null default 'quick' check (mode in ('quick','friend')),
  seed               text not null,
  item_ids           text[] not null,
  challenger_score   integer,
  challenger_correct integer,
  challenger_ms      integer,
  challenger_done_at timestamptz,
  opponent_score     integer,
  opponent_correct   integer,
  opponent_ms        integer,
  opponent_done_at   timestamptz,
  winner             uuid,
  challenger_delta   integer,
  opponent_delta     integer,
  created_at         timestamptz not null default now(),
  finished_at        timestamptz,
  check (challenger <> opponent)
);

create index if not exists battles_open_idx on public.battles (created_at desc) where status = 'open';
create index if not exists battles_challenger_idx on public.battles (challenger, created_at desc);
create index if not exists battles_opponent_idx on public.battles (opponent, created_at desc);

alter table public.battles enable row level security;

drop policy if exists "battles visible to parties" on public.battles;
create policy "battles visible to parties"
  on public.battles for select
  to authenticated
  using (auth.uid() = challenger or auth.uid() = opponent or status = 'open');

-- No direct insert/update policies: every write goes through the functions
-- below, which run as the table owner and validate the move.

-- Realtime: players watch their row for the other side finishing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'battles'
  ) then
    alter publication supabase_realtime add table public.battles;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Quick match: join the oldest open battle from someone else, or open one.
create or replace function public.battle_quick_match(p_seed text, p_item_ids text[])
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.battles;
begin
  if me is null then raise exception 'not signed in'; end if;

  -- Reuse a battle I already opened and nobody joined yet.
  select * into row from public.battles
   where challenger = me and status = 'open'
   order by created_at desc limit 1;
  if found then return row; end if;

  -- Join someone else's open battle (newest first so queues clear quickly).
  update public.battles b
     set opponent = me, status = 'active'
   where b.id = (
     select id from public.battles
      where status = 'open' and challenger <> me
        and created_at > now() - interval '15 minutes'
      order by created_at asc
      limit 1
      for update skip locked
   )
  returning * into row;
  if found then return row; end if;

  insert into public.battles (challenger, status, mode, seed, item_ids)
  values (me, 'open', 'quick', p_seed, p_item_ids)
  returning * into row;
  return row;
end;
$$;

-- Challenge a specific user (friend). Starts active right away; each side
-- plays whenever they open it.
create or replace function public.battle_challenge(p_opponent uuid, p_seed text, p_item_ids text[])
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.battles;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_opponent is null or p_opponent = me then raise exception 'pick an opponent'; end if;
  insert into public.battles (challenger, opponent, status, mode, seed, item_ids)
  values (me, p_opponent, 'active', 'friend', p_seed, p_item_ids)
  returning * into row;
  return row;
end;
$$;

-- Leave my own open battle (nobody joined).
create or replace function public.battle_cancel(p_battle uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.battles set status = 'expired'
   where id = p_battle and challenger = auth.uid() and status = 'open';
$$;

-- Submit my result. When both sides are in, settle the duel and move ratings.
create or replace function public.battle_submit(p_battle uuid, p_score integer, p_correct integer, p_ms integer)
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.battles;
  r_c integer; r_o integer;
  e_c numeric; s_c numeric;
  k integer := 32;
  d_c integer; d_o integer;
  w uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into row from public.battles where id = p_battle for update;
  if not found then raise exception 'battle not found'; end if;
  if row.status not in ('active','open') then raise exception 'battle is closed'; end if;
  if me <> row.challenger and me is distinct from row.opponent then raise exception 'not your battle'; end if;

  p_score := greatest(0, least(coalesce(p_score, 0), 2000));
  p_correct := greatest(0, least(coalesce(p_correct, 0), array_length(row.item_ids, 1)));

  if me = row.challenger then
    if row.challenger_done_at is not null then return row; end if;
    update public.battles set challenger_score = p_score, challenger_correct = p_correct,
           challenger_ms = p_ms, challenger_done_at = now()
     where id = p_battle returning * into row;
  else
    if row.opponent_done_at is not null then return row; end if;
    update public.battles set opponent_score = p_score, opponent_correct = p_correct,
           opponent_ms = p_ms, opponent_done_at = now()
     where id = p_battle returning * into row;
  end if;

  -- Settle when both results are in.
  if row.opponent is not null and row.challenger_done_at is not null and row.opponent_done_at is not null then
    select battle_rating into r_c from public.profiles where id = row.challenger;
    select battle_rating into r_o from public.profiles where id = row.opponent;
    r_c := coalesce(r_c, 1000); r_o := coalesce(r_o, 1000);
    e_c := 1.0 / (1.0 + power(10.0, (r_o - r_c) / 400.0));
    if row.challenger_score > row.opponent_score then s_c := 1; w := row.challenger;
    elsif row.challenger_score < row.opponent_score then s_c := 0; w := row.opponent;
    else s_c := 0.5; w := null; end if;
    d_c := round(k * (s_c - e_c));
    d_o := -d_c;

    perform set_config('cogni.allow_rating_write', 'on', true);
    update public.profiles set
      battle_rating = greatest(100, battle_rating + d_c),
      battle_wins   = battle_wins   + case when s_c = 1 then 1 else 0 end,
      battle_losses = battle_losses + case when s_c = 0 then 1 else 0 end,
      battle_draws  = battle_draws  + case when s_c = 0.5 then 1 else 0 end
     where id = row.challenger;
    update public.profiles set
      battle_rating = greatest(100, battle_rating + d_o),
      battle_wins   = battle_wins   + case when s_c = 0 then 1 else 0 end,
      battle_losses = battle_losses + case when s_c = 1 then 1 else 0 end,
      battle_draws  = battle_draws  + case when s_c = 0.5 then 1 else 0 end
     where id = row.opponent;
    perform set_config('cogni.allow_rating_write', 'off', true);

    update public.battles set status = 'finished', winner = w,
           challenger_delta = d_c, opponent_delta = d_o, finished_at = now()
     where id = p_battle returning * into row;
  end if;

  return row;
end;
$$;

grant execute on function public.battle_quick_match(text, text[]) to authenticated;
grant execute on function public.battle_challenge(uuid, text, text[]) to authenticated;
grant execute on function public.battle_cancel(uuid) to authenticated;
grant execute on function public.battle_submit(uuid, integer, integer, integer) to authenticated;

-- Public leaderboards (profiles are already readable by authenticated users;
-- these views just fix the ordering and hide nulls).
create or replace view public.iq_leaderboard as
  select id, handle, display_name, avatar_initial, iq_score, iq_percentile, iq_taken_at, battle_rating
    from public.profiles
   where iq_score is not null
   order by iq_score desc, iq_taken_at asc;

create or replace view public.battle_leaderboard as
  select id, handle, display_name, avatar_initial, iq_score, battle_rating, battle_wins, battle_losses, battle_draws
    from public.profiles
   where battle_wins + battle_losses + battle_draws > 0
   order by battle_rating desc;

grant select on public.iq_leaderboard, public.battle_leaderboard to authenticated;
