# Putting CareCircle online

Free, and it stays up when your computer is off:

- **Vercel** serves the app's screens and runs the backend as a function (`api/index.py`).
- **Supabase** holds the database (Postgres).
- **Telegram** delivers bot messages to the site (a webhook). The site sets this up by itself when it starts.

Your computer keeps working as before: `npm run dev:all` uses the local SQLite database and your first bot. The
live site has its own database and its own bot, so the two never mix.

## On Vercel, the backend runs in "serverless" mode

A function only runs while it answers a request, so a few things work differently there. The app switches by itself
when it sees it is on Vercel:

| | On your computer | On Vercel |
| --- | --- | --- |
| Database | SQLite file in `backend/data` | Supabase Postgres |
| Searching family notes | by meaning (ChromaDB) | by keywords, in the database |
| Telegram messages | the app fetches them | Telegram delivers them to `/api/telegram/webhook` |
| Overdue reminders | checked every minute | checked every few minutes while anyone has the app open |

## 1. Check the app on your Supabase database (once, while it is empty)

1. In Supabase: **Connect → Transaction pooler**, copy the address (port 6543) and put your database password in it.
2. Add it to `backend/.env` as `SUPABASE_DATABASE_URL=...`.
3. Run `scripts/test-postgres.sh`. It runs every backend test on Supabase. The tests wipe the database, which is
   fine now, before anyone uses it. It takes a few minutes over the internet.
4. Afterwards, remove the line from `backend/.env` again, so the tests can never be pointed at real data by mistake.

## 2. Vercel

1. **Add New → Project**, import the GitHub repository. Leave every build setting as it is: `vercel.json` has them.
2. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase Transaction pooler address (port 6543), with your password in it |
   | `SESSION_COOKIE_SECURE` | `true` |
   | `ENVIRONMENT` | `production` |
   | `OPENAI_API_KEY` | your OpenAI key (leave it out to run with AI features off) |
   | `LLM_MODEL` | the model, e.g. `gpt-6-astra` |
   | `TELEGRAM_BOT_TOKEN` | the token of the bot made for the live site |
   | `TELEGRAM_WEBHOOK_SECRET` | a long random string: run `openssl rand -hex 32` in Terminal and paste the result |

3. **Deploy.** When it is done, open `https://<your-project>.vercel.app/api/health`: it should show `{"status":"ok"}`.
4. Open the site, sign up and create your family. Link Telegram from your profile and send the bot a message.

If the site is reached at an address other than Vercel's production one (a custom domain, say), add
`PUBLIC_URL=https://that.address` so Telegram is pointed at the right place.

## Good to know

- **Supabase pauses a free project after 7 days without use.** Data is kept. Restore it from the Supabase dashboard
  and the site works again.
- **The first visit after a quiet spell is slower** (a few seconds) while the function starts.
- **Updating:** push to `main` and Vercel redeploys. New tables and columns are added to the database when the
  function starts.
