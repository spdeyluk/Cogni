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
