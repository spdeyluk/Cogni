# Cogni → Supabase migration — setup checklist

This is **Phase 1**: standing up the Supabase project. It's the part only you can
do (it lives behind your login). Work top to bottom; the last step hands me the
two values I need to wire the app.

---

## 1. Create the project
1. Sign up at **supabase.com** → **New project**.
2. Pick an **org**, a **name** (e.g. `cogni`), a strong **database password**
   (save it), and a **region** close to your users.
3. Wait ~2 min for it to provision.

## 2. Create the database
1. Left sidebar → **SQL Editor** → **New query**.
2. Paste the entire contents of **`supabase/schema.sql`** → **Run**.
3. You should see "Success." This creates every table, all Row Level Security
   policies, the avatars storage bucket, and the auto-profile trigger.

## 3. Configure sign-in providers
Left sidebar → **Authentication** → **Providers**.

- **Email**: enable it. For a smoother launch you can turn **"Confirm email"
  off** for now (turn it on later once you want verified emails).
- **Google**: enable it. Paste your **existing** Google OAuth **Client ID** and
  **Client Secret** (the same ones already in your Railway env — you can reuse
  them). In **"Authorized Client IDs"**, also add that same client ID so native
  sign-in works.
- **Apple**: enable it. In **"Authorized Client IDs"** add your bundle id
  **`com.spidey.cogni`**. (Native Apple uses the identity token from the device,
  so no Apple secret is needed here — just the client id.)

## 4. Allow the app's deep link
**Authentication** → **URL Configuration** → **Redirect URLs** → add:

```
cogni://auth-callback
```

(This lets native Google sign-in return into the app, reusing the `cogni://`
scheme already registered in `Info.plist`.)

## 5. (Optional) Lead sync to Brevo
Only if you still capture leads/waitlist.
1. Install the CLI: `npm i -g supabase`, then `supabase login`.
2. From the repo: `supabase link --project-ref <your-ref>` then
   `supabase functions deploy lead-sync`.
3. **Edge Functions → lead-sync → Secrets**: add `BREVO_API_KEY` and
   (optional) `BREVO_LIST_ID`.
4. **Database → Webhooks → Create**: table `public.leads`, event `INSERT`,
   type "Supabase Edge Function" → `lead-sync`.

## 6. Send me two values → I wire the app
**Project Settings** → **API**:
- **Project URL**  (e.g. `https://abcd1234.supabase.co`)
- **anon / public** API key (a long `eyJ…` string)

Paste both into **`src/app/supabaseConfig.js`** (or send them to me). Both are
safe to commit — the anon key only grants what RLS allows.

⚠️ **Never** share or commit the **`service_role`** key. It bypasses RLS and is
only for Edge Function secrets / the dashboard.

---

## What happens next (Phase 2 — me)
Once the project exists and `supabaseConfig.js` is filled, I will:
1. Route email / Google / Apple / the sign-in wall through Supabase Auth.
2. Move cloud sync from `/api/state` to the `user_state` table.
3. Move the social (handles, friend requests) and feedback flows onto Supabase.
4. Test each flow live (web + native), then retire the corresponding
   `server.js` endpoints.

Your existing accounts on Railway are effectively empty test data, so there's
no data migration — new sign-ups just land in Supabase.
