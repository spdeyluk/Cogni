-- Reset one account. Run in the Supabase SQL editor. Pick ONE of the two
-- blocks below and set the email first.
--
-- Option A: wipe the account's data but keep the login. Rating, IQ, duels,
-- lobbies, friends, referrals and the synced app snapshot go; the row in
-- auth.users and any Stripe entitlement stay.
--
-- Option B: delete the account entirely. The next Google sign-in creates a
-- brand-new account (useful for testing the sign-up and referral flow).

-- ---------------------------------------------------------------------------
-- Option A: data only
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = 'lvkas345@gmail.com';
  if uid is null then raise exception 'no user with that email'; end if;

  delete from public.battles where challenger = uid or opponent = uid;
  delete from public.lobbies where host = uid or guest = uid;
  delete from public.friend_requests where from_user = uid or to_user = uid;
  delete from public.user_state where user_id = uid;

  perform set_config('cogni.allow_rating_write', 'on', true);
  update public.profiles
     set iq_score = null, iq_percentile = null, iq_taken_at = null,
         battle_rating = 1000, battle_wins = 0, battle_losses = 0, battle_draws = 0,
         referrals = 0, referred_by = null
   where id = uid;
  perform set_config('cogni.allow_rating_write', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- Option B: delete the account (uncomment to use)
-- ---------------------------------------------------------------------------
-- delete from auth.users where email = 'lvkas345@gmail.com';
