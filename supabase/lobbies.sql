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
create or replace function public.lobby_create(p_visibility text, p_seed text, p_item_ids text[])
returns public.lobbies
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.lobbies;
  vis text := case when p_visibility = 'public' then 'public' else 'private' end;
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.lobbies set status = 'closed' where host = me and status = 'waiting';
  insert into public.lobbies (code, host, visibility, seed, item_ids)
  values (public.lobby_new_code(), me, vis, p_seed, p_item_ids)
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

  insert into public.battles (challenger, opponent, status, mode, seed, item_ids)
  values (l.host, me, 'active', 'friend', l.seed, l.item_ids)
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

grant execute on function public.lobby_create(text, text, text[]) to authenticated;
grant execute on function public.lobby_join(text) to authenticated;
grant execute on function public.lobby_close(uuid) to authenticated;

-- Public rooms anyone can join, with the host's name and rating.
create or replace view public.open_lobbies as
  select l.id, l.code, l.host, l.created_at,
         p.display_name, p.handle, p.battle_rating, p.iq_score
    from public.lobbies l
    join public.profiles p on p.id = l.host
   where l.visibility = 'public' and l.status = 'waiting'
     and l.created_at > now() - interval '30 minutes'
   order by l.created_at desc;

grant select on public.open_lobbies to authenticated;
