-- survey_responses — every finished question run, appended as a row: the
-- pre-test run (age, gender, education, email) and the post-test run (goals,
-- minutes, screen time, games, interests). Added 2026-11-26 so the answers are
-- browsable and exportable in the dashboard instead of living only inside
-- user_state.state ->> 'cogni.profileSurvey.v1'.
--
-- Append-only on purpose: with no SELECT policy, an UPSERT (insert … on conflict
-- do update) is rejected by row-level security, and a SELECT policy wide enough
-- to allow it would let the anon key read guests' emails. So the client only
-- ever INSERTs; the local record carries every answer so far, which makes the
-- latest row per client_id the complete picture. survey_latest is that view.
--
-- Apply with:  supabase db query --remote -f supabase/survey.sql --yes
-- ---------------------------------------------------------------------------
drop view if exists public.survey_latest;
drop table if exists public.survey_responses;

create table public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null,                           -- per-browser id (guests included)
  user_id          uuid references auth.users(id) on delete set null,
  run              text not null default 'profile',         -- 'profile' (pre-test) | 'plan' (post-test)
  email            text,
  age              text,
  gender           text,
  education        text,
  goals            text[],
  minutes          int,
  screen_time      text,
  games            text[],
  ranks            jsonb,
  interests        text[],
  skipped          text[],
  profile_done_at  timestamptz,
  plan_done_at     timestamptz,
  source           text not null default 'web',             -- 'web' | 'tester'
  created_at       timestamptz not null default now()
);

create index survey_responses_client_idx on public.survey_responses (client_id, created_at desc);
create index survey_responses_user_idx on public.survey_responses (user_id);
create index survey_responses_created_idx on public.survey_responses (created_at desc);

alter table public.survey_responses enable row level security;

-- Anyone may append a row about themselves: guests too (the pre-test email is a
-- lead). A signed-in member may only stamp their own user id on it.
create policy "survey insert own"
  on public.survey_responses for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
-- No select / update / delete policies on purpose: nothing in the app reads
-- this back. The dashboard (service_role) sees everything.

-- One row per person: the newest row for each browser id.
create view public.survey_latest with (security_invoker = true) as
  select distinct on (client_id) *
  from public.survey_responses
  order by client_id, created_at desc;
revoke all on public.survey_latest from anon, authenticated;
