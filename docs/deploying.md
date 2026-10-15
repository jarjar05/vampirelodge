# Putting CareCircle online

CareCircle is two parts, hosted in two places:

- **The app's screens** (React, in the project folder) on **Vercel**.
- **The backend** (FastAPI, in `backend/`) on **Railway**. The backend keeps its data in files (the SQLite database and the
  notes index) and runs the Telegram bot all the time. Vercel can do neither, so it does not host the backend.

Vercel passes every request for `/api/...` on to the backend (see `vercel.json`). To the browser it is all one site,
so sign-in cookies work without any cross-site setup.

## 1. The backend on Railway

1. Sign in at [railway.com](https://railway.com) with GitHub. **New Project → Deploy from GitHub repo**, and pick this
   repository.
2. Open the new service's **Settings**:
   - **Root Directory:** `backend`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
     (one worker only: more would run the Telegram bot twice)
   - **Healthcheck Path:** `/api/health`
   - Railway reads `backend/.python-version` and `backend/requirements.txt` by itself.
3. **Add a volume** to the service (right-click the service, or the command palette: *Volume*), mounted at `/data`.
   This is the disk that keeps the database and notes between deploys.
4. Open **Variables** and add these. Real keys go here, never in git:

   | Variable | Value |
   | --- | --- |
   | `ENVIRONMENT` | `production` |
   | `DATABASE_URL` | `sqlite:////data/app.db` (four slashes: an absolute path on the volume) |
   | `CHROMA_PERSIST_DIR` | `/data/chroma` |
   | `SESSION_COOKIE_SECURE` | `true` |
   | `FRONTEND_ORIGIN` | your Vercel address, e.g. `https://carecircle.vercel.app` (fill in after step 2) |
   | `OPENAI_API_KEY` | your OpenAI key |
   | `LLM_MODEL` | `gpt-6-astra`, or a cheaper model |
   | `AI_MONTHLY_BUDGET_USD` | the most the AI may cost a month, e.g. `10` |
   | `AI_INPUT_PRICE_PER_MILLION` | the model's input price per million tokens, from [OpenAI's pricing page](https://openai.com/api/pricing) |
   | `AI_OUTPUT_PRICE_PER_MILLION` | the model's output price per million tokens |
   | `TELEGRAM_BOT_TOKEN` | the token of the **production** bot (see below) |

5. **Settings → Networking → Generate Domain.** Railway gives an address like
   `carecircle-production.up.railway.app`. Check `https://<that address>/api/health` answers `{"status": ...}`.
6. **Backups:** take a volume backup from the volume's settings now and then, or turn on scheduled backups there.

**Telegram:** a bot token can only be used by one running copy of the app. Make a second bot for the live site with
@BotFather (`/newbot`) and use its token here, so `npm run dev:all` on your computer can keep using the first.

## 2. The screens on Vercel

1. In `vercel.json`, replace `REPLACE-WITH-BACKEND-ADDRESS` with the Railway address from step 1.5 (no `https://`,
   no trailing slash). Commit and push.
2. Sign in at [vercel.com](https://vercel.com) with GitHub. **Add New → Project**, import this repository. Leave the
   root directory as the project root; Vercel reads the build settings from `vercel.json`. Deploy.
3. Copy the Vercel address into `FRONTEND_ORIGIN` on Railway.

## 3. Check it

- Sign up, create the family, add a task, add a busy time under **Calendar → My schedule**.
- Reload the browser on `/tasks`: it should show the Tasks page, not a 404.
- Link Telegram from your profile and check that a message arrives.
- Try it on your phone.

## AI spending

The backend keeps its own monthly limit (`AI_MONTHLY_BUDGET_USD`). Once the month's AI cost reaches it, AI features
pause until the 1st (UTC) and the app uses its plain versions; everything else keeps working. To see the month so
far, run in the Railway service's shell, or locally against a copy of the database:

```
python -m app.ai_usage
```

Locally, `npm run ai:usage` does the same for your own database.

## Updating

Pushing to `main` redeploys both. The database and notes on the volume are kept; new tables and columns are added
when the backend starts.
