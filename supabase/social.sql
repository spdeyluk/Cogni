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
-- Cogni lobbies: play with friends through a public or private room.
-- Run in the Supabase SQL editor after battles.sql. Idempotent.
--
-- The host opens a lobby and gets a short code (and a link). The first
-- person to join becomes the opponent: the server creates the battle for
-- both sides with the seed and items the host fixed at creation, so neither
-- client can pick the questions.

create table if not exists public.lobbies (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  host        uuid not null references auth.users(id) on delete cascade,
  guest       uuid references auth.users(id) on delete set null,
  visibility  text not null default 'private' check (visibility in ('public', 'private')),
  status      text not null default 'waiting' check (status in ('waiting', 'started', 'closed')),
  seed        text not null,
  item_ids    text[] not null,
  battle_id   uuid references public.battles(id) on delete set null,
  created_at  timestamptz not null default now(),
  started_at  timestamptz
);

-- Round length chosen by the host (Quick 1v1 is always 120000). The client
-- splits it across the eight tasks by task type.
alter table public.lobbies
  add column if not exists round_ms integer not null default 120000
  check (round_ms between 30000 and 600000);
alter table public.battles
  add column if not exists round_ms integer not null default 120000;

create index if not exists lobbies_public_idx on public.lobbies (created_at desc) where status = 'waiting' and visibility = 'public';
create index if not exists lobbies_host_idx on public.lobbies (host, created_at desc);

alter table public.lobbies enable row level security;

drop policy if exists "lobbies visible to parties and public" on public.lobbies;
create policy "lobbies visible to parties and public"
  on public.lobbies for select
  to authenticated
  using (auth.uid() = host or auth.uid() = guest or (visibility = 'public' and status = 'waiting'));

-- No direct writes: everything goes through the functions below.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lobbies'
  ) then
    alter publication supabase_realtime add table public.lobbies;
  end if;
end $$;

-- Short, readable codes: no 0/O or 1/I.
create or replace function public.lobby_new_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text;
  i integer;
begin
  loop
    out := '';
    for i in 1..6 loop
      out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.lobbies where code = out and status = 'waiting');
  end loop;
  return out;
end;
$$;

-- Open a lobby. Any earlier lobby of mine still waiting is closed first.
drop function if exists public.lobby_create(text, text, text[]);
create or replace function public.lobby_create(p_visibility text, p_seed text, p_item_ids text[], p_round_ms integer default 120000)
returns public.lobbies
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.lobbies;
  vis text := case when p_visibility = 'public' then 'public' else 'private' end;
  len integer := greatest(30000, least(coalesce(p_round_ms, 120000), 600000));
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.lobbies set status = 'closed' where host = me and status = 'waiting';
  insert into public.lobbies (code, host, visibility, seed, item_ids, round_ms)
  values (public.lobby_new_code(), me, vis, p_seed, p_item_ids, len)
  returning * into row;
  return row;
end;
$$;

-- Join by code. Creates the battle and returns it; the host is told through
-- realtime on the lobby row.
create or replace function public.lobby_join(p_code text)
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  l public.lobbies;
  b public.battles;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into l from public.lobbies
   where lobbies.code = code and status = 'waiting'
   for update skip locked;
  if not found then raise exception 'lobby not found'; end if;
  if l.host = me then raise exception 'that is your own lobby'; end if;

  insert into public.battles (challenger, opponent, status, mode, seed, item_ids, round_ms)
  values (l.host, me, 'active', 'friend', l.seed, l.item_ids, l.round_ms)
  returning * into b;

  update public.lobbies
     set guest = me, status = 'started', battle_id = b.id, started_at = now()
   where id = l.id;
  return b;
end;
$$;

-- Close my own waiting lobby.
create or replace function public.lobby_close(p_lobby uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lobbies set status = 'closed'
   where id = p_lobby and host = auth.uid() and status = 'waiting';
$$;

grant execute on function public.lobby_create(text, text, text[], integer) to authenticated;
grant execute on function public.lobby_join(text) to authenticated;
grant execute on function public.lobby_close(uuid) to authenticated;

-- Public rooms anyone can join, with the host's name and rating.
create or replace view public.open_lobbies as
  select l.id, l.code, l.host, l.created_at,
         p.display_name, p.handle, p.battle_rating, p.iq_score, l.round_ms
    from public.lobbies l
    join public.profiles p on p.id = l.host
   where l.visibility = 'public' and l.status = 'waiting'
     and l.created_at > now() - interval '30 minutes'
   order by l.created_at desc;

grant select on public.open_lobbies to authenticated;
-- Cogni bot opponents for Quick 1v1. Run after battles.sql. Idempotent.
--
-- When nobody is searching, the player is matched with a bot that plays the
-- same seeded set. The bot's answers are derived from the seed on the server
-- (sha256), so the client cannot invent a weak opponent. Bot duels are rated
-- against the bot's fixed rating; only the player's profile moves.

alter table public.battles
  add column if not exists bot_name   text,
  add column if not exists bot_rating integer;

alter table public.battles drop constraint if exists battles_mode_check;
alter table public.battles add constraint battles_mode_check check (mode in ('quick', 'friend', 'bot'));

-- Deterministic bot result for a seed. Mirrors src/app/battle.js botPlan():
-- per item i, digest = sha256(seed || ':' || i); the bot answers correctly
-- when byte 0 < 153 (about 60%), and its speed bonus is 10 + (byte 1 mod 36).
create or replace function public.battle_bot_score(p_seed text, p_items integer)
returns table (score integer, correct integer)
language plpgsql
immutable
as $$
declare
  i integer;
  dgst bytea;
  s integer := 0;
  c integer := 0;
begin
  for i in 0..(greatest(p_items, 0) - 1) loop
    dgst := sha256(convert_to(p_seed || ':' || i, 'UTF8'));
    if get_byte(dgst, 0) < 153 then
      s := s + 100 + 10 + (get_byte(dgst, 1) % 36);
      c := c + 1;
    end if;
  end loop;
  score := s; correct := c;
  return next;
end;
$$;

-- Start a bot duel. Any open quick seat of mine is dropped first.
create or replace function public.battle_bot_match(p_seed text, p_item_ids text[])
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.battles;
  names text[] := array['nora_k','Dmitri','elias.b','Yuki','Mateo','Ingrid','Kwame','sofia.r','Arjun','Lena','tomasz','Priya','Jonas','maya_v','Rafael','Aoife','Hugo','Zara','niklas','Chloe'];
  h integer := abs(('x' || substr(md5(p_seed), 1, 8))::bit(32)::int);
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.battles set status = 'expired' where challenger = me and status = 'open';
  insert into public.battles (challenger, opponent, status, mode, seed, item_ids, bot_name, bot_rating)
  values (me, null, 'active', 'bot', p_seed, p_item_ids,
          names[1 + (h % array_length(names, 1))],
          900 + ((h / 64) % 251))
  returning * into row;
  return row;
end;
$$;

grant execute on function public.battle_bot_match(text, text[]) to authenticated;

-- Quick match: only live seats count (opened in the last 20 seconds). The
-- client plays a bot when nobody shows up, so stale seats never pair.
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

  update public.battles set status = 'expired' where challenger = me and status = 'open';

  update public.battles b
     set opponent = me, status = 'active'
   where b.id = (
     select id from public.battles
      where status = 'open' and challenger <> me
        and created_at > now() - interval '20 seconds'
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

-- Submit: unchanged for human duels; a bot duel settles immediately against
-- the server-derived bot score and the bot's rating.
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
  bot record;
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

  -- Bot duel: the bot's side is derived, then the player is rated against it.
  if row.mode = 'bot' then
    select * into bot from public.battle_bot_score(row.seed, array_length(row.item_ids, 1));
    update public.battles set opponent_score = bot.score, opponent_correct = bot.correct,
           opponent_ms = null, opponent_done_at = now()
     where id = p_battle returning * into row;
    select battle_rating into r_c from public.profiles where id = row.challenger;
    r_c := coalesce(r_c, 1000); r_o := coalesce(row.bot_rating, 1000);
    e_c := 1.0 / (1.0 + power(10.0, (r_o - r_c) / 400.0));
    if row.challenger_score > row.opponent_score then s_c := 1; w := row.challenger;
    elsif row.challenger_score < row.opponent_score then s_c := 0; w := null;
    else s_c := 0.5; w := null; end if;
    d_c := round(k * (s_c - e_c));
    perform set_config('cogni.allow_rating_write', 'on', true);
    update public.profiles set
      battle_rating = greatest(100, battle_rating + d_c),
      battle_wins   = battle_wins   + case when s_c = 1 then 1 else 0 end,
      battle_losses = battle_losses + case when s_c = 0 then 1 else 0 end,
      battle_draws  = battle_draws  + case when s_c = 0.5 then 1 else 0 end
     where id = row.challenger;
    perform set_config('cogni.allow_rating_write', 'off', true);
    update public.battles set status = 'finished', winner = w,
           challenger_delta = d_c, opponent_delta = -d_c, finished_at = now()
     where id = p_battle returning * into row;
    return row;
  end if;

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
