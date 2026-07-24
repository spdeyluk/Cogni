-- ===========================================================================
-- Cogni · Supabase schema + Row Level Security (RLS)
-- ---------------------------------------------------------------------------
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste ->
-- Run. It is written to be safe to re-run (create ... if not exists, drop
-- policy if exists before create). Tables live in the `public` schema; auth
-- lives in the managed `auth` schema.
--
-- Security model: every table has RLS enabled, so the database itself refuses
-- to return rows a user isn't allowed to see. `auth.uid()` is the id of the
-- signed-in user. The service_role key (used only by Edge Functions / the
-- dashboard, NEVER in the app) bypasses RLS for admin work like lead exports.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- profiles — the public social identity for an account (the @handle).
-- Extends auth.users. Email is intentionally NOT stored here (it lives in
-- auth.users), so this table can be readable by other users for friend lookup
-- without ever leaking an email address.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  handle         text unique check (handle is null or handle ~ '^@[a-z0-9_.]{1,24}$'),
  avatar_initial text,
  avatar_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any signed-in user can look up handles (needed to add a friend)...
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

-- ...but you can only create / change your own row.
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);


-- Auto-create a profiles row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- user_state — the cloud-synced app snapshot (replaces /api/state).
-- One private row per user: the client mirrors its localStorage here.
-- ---------------------------------------------------------------------------
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "user_state select own" on public.user_state;
create policy "user_state select own"
  on public.user_state for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_state insert own" on public.user_state;
create policy "user_state insert own"
  on public.user_state for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_state update own" on public.user_state;
create policy "user_state update own"
  on public.user_state for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- friend_requests — the social graph. Stores user ids (not handles) for
-- integrity; resolve a handle -> id via profiles when sending a request.
-- ---------------------------------------------------------------------------
create table if not exists public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user, to_user)
);

create index if not exists friend_requests_to_idx   on public.friend_requests(to_user);
create index if not exists friend_requests_from_idx on public.friend_requests(from_user);

alter table public.friend_requests enable row level security;

-- You can see a request only if you're one of the two parties.
drop policy if exists "friend_requests visible to parties" on public.friend_requests;
create policy "friend_requests visible to parties"
  on public.friend_requests for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

-- You can only send a request AS yourself, and not to yourself.
drop policy if exists "friend_requests send as self" on public.friend_requests;
create policy "friend_requests send as self"
  on public.friend_requests for insert to authenticated
  with check (auth.uid() = from_user and from_user <> to_user);

-- Only the recipient may respond (accept/decline).
drop policy if exists "friend_requests respond as recipient" on public.friend_requests;
create policy "friend_requests respond as recipient"
  on public.friend_requests for update to authenticated
  using (auth.uid() = to_user) with check (auth.uid() = to_user);


-- ---------------------------------------------------------------------------
-- leads — waitlist / marketing captures (only needed if you still collect
-- them; the IQ funnel was removed). Anyone may INSERT; nobody may read via the
-- API. Exports happen through the dashboard / service_role (which bypass RLS).
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text,
  phone      text,
  score      int,
  source     text default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;

drop policy if exists "leads insert public" on public.leads;
create policy "leads insert public"
  on public.leads for insert to anon, authenticated with check (true);
-- No select/update/delete policy on purpose: no read access except service_role.


-- ---------------------------------------------------------------------------
-- feedback — the in-app feedback prompt. Same shape as leads: write-only for
-- clients, readable only via the dashboard / service_role.
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  message    text not null,
  mode       text,
  answers    jsonb,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "feedback insert public" on public.feedback;
create policy "feedback insert public"
  on public.feedback for insert to anon, authenticated with check (true);


-- ---------------------------------------------------------------------------
-- Storage: avatars bucket. Public read; each user may write only inside their
-- own folder (named by their user id). Replaces inline data-URI avatars.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "avatars write own folder" on storage.objects;
create policy "avatars write own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update own folder" on storage.objects;
create policy "avatars update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
