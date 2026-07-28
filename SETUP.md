# heydate — adding real accounts

Right now `index.html` has a shared password (`heydate2026`) hardcoded in the source, and all data lives in one browser's `localStorage`. Anyone who views source sees the password, and clearing browser data wipes everything.

This replaces that with real accounts: email + password sign-up, a profile, and per-user data that follows people across devices.

## Files

| File | What it does |
|---|---|
| `supabase-schema.sql` | Creates the `profiles` and `user_state` tables, row-level security, and a trigger that provisions both on sign-up |
| `heydate-auth.js` | The whole front end of auth: sign-up/sign-in screen, account menu, profile editor, cloud sync |
| `patch_index.py` | Applies 5 small edits to your existing `index.html` so it talks to the above |

## Steps

**1. Create the Supabase project**

Go to [supabase.com](https://supabase.com), create a free project, and wait for it to finish provisioning (~2 min).

**2. Run the schema**

Supabase Studio → **SQL Editor** → **New query** → paste all of `supabase-schema.sql` → **Run**. You should see `Success`. Check **Table Editor** — `profiles` and `user_state` are there.

**3. Grab your keys**

Studio → **Project Settings** → **API**. Copy:

- **Project URL** (`https://xxxx.supabase.co`)
- **anon / public** key

**4. Paste them into `heydate-auth.js`**

Lines 12–13:

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
```

The anon key is *designed* to be public — it's in every Supabase web app's source. What protects your data is the row-level security in step 2, which makes it physically impossible for one user to read another's rows. Never put the **service_role** key in front-end code.

**5. Patch index.html**

Drop `heydate-auth.js` and `patch_index.py` into the repo next to `index.html`, then:

```bash
python3 patch_index.py index.html --dry-run   # preview
python3 patch_index.py index.html             # apply (writes index.html.bak)
```

It prints one line per edit. If any says `FAILED`, it writes nothing and leaves your file alone.

**6. Configure auth in Supabase**

Studio → **Authentication** → **Sign In / Providers** → Email:

- For testing, turn **Confirm email** *off* so sign-up logs you straight in.
- For real users, leave it on — the sign-up screen already tells them to check their inbox.

Then **Authentication** → **URL Configuration** → add your site URL (and `http://localhost:8000` if you test locally) to **Redirect URLs**, or password-reset links won't come back to your app.

**7. Test**

Serve the folder (don't open the file directly — `file://` breaks auth redirects):

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`, create an account, add a person. Then check **Table Editor → user_state** — your person is in the `people` JSON. Sign out, sign back in, and they're still there. Open it in a different browser and sign in — also there.

If you already had people saved in that browser, it offers to import them on first sign-in.

**8. Commit**

```bash
git add index.html heydate-auth.js supabase-schema.sql SETUP.md
git commit -m "Add Supabase accounts: signup, login, profile, per-user storage"
git push
```

Don't commit `index.html.bak`.

## How the data is shaped

`profiles` — one row per account: `full_name`, `phone`, `notify_channel`, `timezone`.

`user_state` — one row per account holding four JSON columns that mirror exactly what used to be in `localStorage`: `people`, `dismissed`, `purchases`, `deals_seen`. Keeping them as JSONB means zero changes to the app's rendering code — the same `people` array the prototype already builds just gets loaded from and saved to Postgres instead.

That's a deliberate tradeoff. It's the fastest path to working accounts, but you can't query it well ("which birthdays are in the next 14 days across all users?" is awkward against JSONB). When you build the actual reminder sender, you'll want to normalise `people` into proper `people` and `important_dates` tables so a scheduled job can index on date. Worth doing then, not now.

## What this does *not* do yet

Accounts are step one. heydate still doesn't send anything — the reminder outbox and deal watch are simulated in the browser. Sending for real needs:

- Normalised `people` / `important_dates` tables (see above)
- A Supabase Edge Function on a cron schedule that finds dates 14 days out
- Twilio for SMS, Resend or SendGrid for email
- Phone verification before you text anyone, so accounts can't be used to spam strangers
- Real price data for deal watch (Keepa or the Amazon Product Advertising API) — the current prices are generated from a hash of the item name

Happy to build any of those next.
