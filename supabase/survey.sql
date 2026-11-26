-- survey_responses — one row per browser that answered the pre-test (age, gender,
-- education, email) and post-test (goals, minutes, screen time, games, interests)
-- questions. Added 2026-11-26 so the answers are browsable and exportable in the
-- dashboard instead of living only inside user_state.state ->> 'cogni.profileSurvey.v1'.
--
-- Apply with:  supabase db query --remote -f supabase/survey.sql
-- ---------------------------------------------------------------------------
create table if not exists public.survey_responses (
  client_id        text primary key,                       -- per-browser id (guests included)
  user_id          uuid references auth.users(id) on delete set null,
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
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists survey_responses_user_id_idx on public.survey_responses (user_id);
create index if not exists survey_responses_created_at_idx on public.survey_responses (created_at desc);

alter table public.survey_responses enable row level security;

-- Anyone may write their own row: guests too (the pre-test email is a lead).
-- A signed-in member may only stamp their own user id on it.
drop policy if exists "survey insert own" on public.survey_responses;
create policy "survey insert own"
  on public.survey_responses for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- The second run (post-test) updates the same row. Guest rows are addressable
-- only by their random client id; member rows only by their owner.
drop policy if exists "survey update own" on public.survey_responses;
create policy "survey update own"
  on public.survey_responses for update to anon, authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

-- No select policy on purpose: nothing in the app reads this back. The
-- dashboard (service_role) sees everything.
