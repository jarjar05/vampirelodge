# Family Care Coordinator Backend

Minimal FastAPI backend foundation for the Family Care Coordinator frontend.

## Requirements

- Python 3.10 or newer
- pip

## Setup

From the `backend` directory, create and activate a virtual environment:

```sh
python3 -m venv .venv
source .venv/bin/activate
```

On Windows PowerShell, activate it with:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies and create your local environment file:

```sh
pip install -r requirements.txt
cp .env.example .env
```

By default the backend stores its data in a SQLite file at `backend/data/app.db`, so no database server or Docker is needed. Initialize the application tables:

```sh
python -m app.init_db
```

The initializer uses SQLAlchemy `create_all` for a lightweight hackathon setup. It creates missing tables and adds new nullable or defaulted columns to existing ones, so re-run it after pulling model changes. It does not rename, retype, or drop columns, and it does not replace schema migrations for production.

### Optional: PostgreSQL

To run against PostgreSQL instead, start the bundled service from the `backend` directory and point `DATABASE_URL` in `.env` at it (the commented line in `.env.example` shows the format):

```sh
docker compose up -d db
python -m app.init_db
```

Its database files live under `backend/data/postgres/`. The service is bound to localhost only and uses trust authentication for local development. Do not expose this configuration to a network or use it for production. `.env` sets the database role and connection URL; edit those values together if you change the role. SQLite and PostgreSQL hold separate data; switching does not copy anything across.

ChromaDB uses a separate persistent local store at `backend/data/chroma/` by default. Configure `CHROMA_PERSIST_DIR` in `.env` to change it. The SQL database remains the source of truth for users, families, tasks, appointments, and application state; ChromaDB is only for semantic knowledge retrieval. ChromaDB is initialized by FastAPI and must not be accessed by the React app.

Start the development server from the `backend` directory:

```sh
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive API documentation is at `http://127.0.0.1:8000/docs`.

## Health check

```sh
curl http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Configuration

Settings are loaded from `backend/.env`. `FRONTEND_ORIGIN` configures the allowed browser origin for CORS and defaults to `http://localhost:5173`. `DATABASE_URL` configures the database connection; a relative SQLite path is resolved from the `backend` directory.

The user model stores a UUID, normalized unique email, name, password hash, and creation timestamp. Passwords are hashed with Argon2 and are never stored as plaintext. Authentication uses email and password with an HttpOnly session cookie; session token hashes are stored in the database.

## Accounts

New users create an account from the **Create an account** link on the React app's `/login` page. Sign-up needs a name, an email, and a password of at least 12 characters, with an optional phone number, and signs the new user in straight away. A new account belongs to no family until it creates one or joins one with an invite code.

Users sign in with either their email or their phone number, chosen on the login page. Phone numbers are stored in international format (`+6591234567`); spaces, dashes, dots, and brackets are ignored, but the country code is required. Each email and each phone number can belong to only one account.

You can also provision an account from the terminal, from the `backend` directory:

```sh
python -m app.create_user
```

The password is entered with terminal input hidden.

- `POST /api/auth/register` creates an account. Body: `{"name":"Sarah Rivera","email":"sarah@example.com","phone":"+65 9123 4567","password":"..."}`; `phone` is optional. A taken email or phone returns `409`.
- `POST /api/auth/login` takes `{"email":"...","password":"..."}` or `{"phone":"...","password":"..."}`, never both.
- `GET /api/auth/me` returns the signed-in user; `POST /api/auth/logout` signs out.
- `PATCH /api/auth/me` updates `name` and `avatar_url`. The picture is a JPEG, PNG, or WebP data URL of at most 300,000 characters (the app resizes it to 256×256 first), or `null` to remove it.
- `PATCH /api/auth/me/sign-in-details` changes `email` and/or `phone` (`null` removes the phone). Body must include `current_password`; a wrong one returns `403`.
- `POST /api/auth/change-password` takes `{"current_password":"...","new_password":"..."}` and signs the account out of every other session.

Sign-up is open to anyone who can reach the API. Emails and phone numbers are not verified (no confirmation email or SMS), and there is no rate limiting or forgotten-password flow; add these before exposing this beyond local use. Set `SESSION_COOKIE_SECURE=true` when serving over HTTPS.

## Family API

All family endpoints require the authenticated session cookie. A user can belong to one family at a time. Family access is resolved from the authenticated user; clients do not supply a family ID to select the family.

- `POST /api/families` creates a family and makes the creator its `ADMIN`. Request body: `{"name":"Mum's Care"}`. The response includes its invite code.
- `GET /api/families/me` returns the authenticated user's family and their role in it (`my_role`). `invite_code` is included for admins and `null` for other members.
- `PATCH /api/families/me` renames the family. Admins only. Request body: `{"name":"Rivera Family"}`.
- `GET /api/families/me/members` returns member IDs, names, emails, roles, relationship labels, availability, and join timestamps; password hashes are never included.
- `PATCH /api/families/me/members/{user_id}` updates `relationship_label`, `availability` (`Available`, `With family`, `Away today`, `On duty`), and `availability_note`. Members can edit themselves; admins can edit anyone.
- `DELETE /api/families/me/members/{user_id}` removes another member. Admins only. Their tasks return to the unassigned queue.
- `POST /api/families/join` joins by invite code. Request body: `{"invite_code":"ABC123"}`. Invalid codes and existing memberships are rejected.
- `POST /api/families/leave` removes the authenticated user's membership. The final admin cannot leave until another admin exists.

`DELETE /api/families/me` with `{"confirm_name":"<the family's name>"}` deletes the family. Admin only. It removes the family's tasks, task history, appointments, knowledge notes and their search chunks, bot drafts and memberships, then the family itself. Members keep their accounts and can create or join another family; sample members made by the demo seeder are deleted with it. It cannot be undone.

## Tasks, activity, and appointments API

These routes require an authenticated family member and only ever read or change that member's own family.

- `GET /api/families/me/tasks` lists tasks, each with its activity history.
- `POST /api/families/me/tasks` creates a task. Body: `{"title":"Pick up medication","detail":"Oak Pharmacy","location":null,"due_at":"2026-10-12T17:30:00+08:00","category":"Medication","priority":"High","assignee_id":null}`. Only `title` is required. `priority` is `High`, `Normal` (the default), or `Low`, and is chosen by whoever creates the task.
- `PATCH /api/families/me/tasks/{task_id}` changes a task's `title`, `detail`, `location`, `due_at` or `priority`. Only the fields sent are changed; `null` clears `location` or `due_at` (a repeating task must keep its due date). Each change is recorded in the task's history, and moving the due date allows a new overdue reminder. Moving a repeating task's date carries on to the occurrences that follow.
- `POST /api/families/me/tasks/{task_id}/assign` sets or clears the assignee. Body: `{"assignee_id":"<user id>"}` or `{"assignee_id":null}`. The assignee must belong to the family. There is no accept or decline step: an assigned task is simply that person's until it is completed or reassigned.
- `POST /api/families/me/tasks/{task_id}/complete` and `/reopen` can be called by any family member.
- `GET /api/families/me/activity?limit=20` returns the family's most recent task activity, newest first.
- `GET /api/families/me/appointments`, `POST /api/families/me/appointments`, and `DELETE /api/families/me/appointments/{appointment_id}` manage appointments. Create body: `{"title":"GP review","place":"Riverside Family Practice","starts_at":"2026-10-11T10:30:00+08:00","attendee_id":null,"related_task_id":null}`.

A task can repeat: send `"recurrence"` as `daily`, `weekly`, `biweekly` or `monthly` when creating it (a due time is required). A series always has one occurrence waiting. The next one is created when the latest is completed, or when its due time passes and someone next loads the task list; a long gap produces one new occurrence, not one per missed period. `POST /api/families/me/tasks/{task_id}/stop-repeating` ends the series and keeps the occurrences that exist.

Task statuses are `Open` and `Completed`. "Unassigned", "overdue", and "at risk" are derived by the frontend from the assignee, due time, and status.

## Family knowledge API

These routes require an authenticated family member. The backend obtains the family ID from the session membership and applies it to every query; clients cannot select another family's records by passing a family ID.

Each document is stored whole in the SQL database, which is the source of truth, and split into overlapping chunks of at most 900 characters that are indexed in ChromaDB for search. Chunking matters because the default embedding model reads only about 256 tokens: without it, only the start of a long document would be searchable.

- `GET /api/families/me/knowledge` lists the family's documents, newest first, with their full content.
- `POST /api/families/me/knowledge` adds one document. Body: `{"title":"Medication list","category":"medication","content":"Care notes..."}`. `title` defaults to `source`, and `source` (where the text came from) defaults to "Added in the app".
- `POST /api/families/me/knowledge/batch` adds 1–100 documents using a `{"documents":[...]}` body.
- `GET /api/families/me/knowledge/search?query=medication&limit=5` returns the best-matching excerpts from the authenticated family's documents, each with its `document_id` and `title`. An optional `category` query parameter narrows results.
- `DELETE /api/families/me/knowledge/{document_id}` deletes the document and all of its chunks, only when it belongs to the authenticated user's family.

## AI features

AI features call an OpenAI model from the backend only. Put the key in `backend/.env`:

```sh
OPENAI_API_KEY=your-key-here
LLM_MODEL=gpt-6-astra
```

Restart the server after changing `.env`. `LLM_MODEL` is optional and defaults to `gpt-6-astra`; set it to a lower-cost model if you prefer. It must be a model that supports structured outputs. Without a key the AI endpoints return `503` and the app falls back to its rule-based behaviour; no request is sent.

- `POST /api/families/me/tasks/{task_id}/suggestion` asks the model who should take a task and returns `{"member_id":"...","reason":"...","note_titles":["..."]}`. It only suggests; nothing is assigned. The prompt contains the task, every family member's role, availability, and open tasks, and up to four knowledge excerpts retrieved for the task. The answer is constrained to the ids of that family's members.

- `POST /api/families/me/day-plan` with `{"timezone":"Asia/Singapore","refresh":false}` summarises the signed-in person's open tasks and suggests an order, returning `{"summary":"...","steps":[{"task_id":"...","note":"..."}],"generated_at":"..."}`. The last plan is kept in memory and reused until that person's tasks, appointments or calendar busy times change, a new day starts, or `refresh` is true. With no open tasks it returns an empty plan without calling the model.

- `POST /api/families/me/tasks/from-document` reads a letter or email and drafts tasks from it. Send either a file as `{"filename":"letter.pdf","content_type":"application/pdf","data_base64":"..."}` or pasted text as `{"text":"..."}`, optionally with `timezone`. It returns `{"summary":"...","tasks":[{"title":"...","detail":"...","location":"...","due_date":"2026-11-14","due_time":"09:00:00","priority":"Normal"}]}`, at most five drafts. Nothing is created or stored: the app puts a draft into the new-task form, and the task exists only once the person submits it. Supported files, up to 5 MB: PDF with a text layer, JPEG/PNG/WebP/GIF pictures (read by the model), `.docx`, `.eml`, and plain text. The app converts photos to JPEG on a white background first, because the model cannot read dark text on a transparent picture.

Both endpoints accept the browser's time zone (`?timezone=` on the suggestion) so times in the prompt read as the person sees them.

All model calls go through `app/services/llm.py`, so changing provider means changing that one file. Text written by users (tasks, member details, knowledge) is passed to the model as data, and a model answer can never do more than name family members or that person's tasks and give short reasons. Each model call is one billed API request.

## Calendar link

A person can link their own calendar by pasting its sharing link (the `.ics` or `webcal://` link that Apple, Google and Outlook calendars can publish). It is free and read-only: the app never writes to the calendar.

- `GET /api/calendar` returns `{"connected":true,"synced_at":"...","event_count":3,"error":null}`. The link itself is never returned.
- `PUT /api/calendar` with `{"url":"webcal://..."}` checks that the link can be read, then saves it. `POST /api/calendar/sync` reads it again now. `DELETE /api/calendar` unlinks it.

Only busy times are used: event titles, places and notes are never stored or sent to the model. Events marked free or cancelled are skipped. Feeds are downloaded at most every 15 minutes per person and held in memory. The day plan is given the person's busy times and appointments for the next 30 days; an assignment suggestion is given each member's app appointments and, for linked members, busy times on the day the task is due.

`GET /api/families/me/tasks/{task_id}/availability?timezone=...` returns `{"busy_member_ids":[...]}`: members with an app appointment or a calendar event within an hour of the task's due time. It makes no model call, and the app uses it to keep busy people out of the default suggestion.

The link is stored in the `users` table as plain text, because it has to be read back to download the feed. Only `https` links to public addresses are downloaded; links to this machine or a private network are refused.

Do not commit `.env` or put secrets in source code. `.env.example` contains placeholders only.

## Telegram bot

Optional. With `TELEGRAM_BOT_TOKEN` set in `backend/.env`, the API process also runs a Telegram bot. Without it, nothing Telegram-related starts and the rest of the app is unaffected.

Setup:

1. In Telegram, open a chat with `@BotFather`, send `/newbot`, and follow the prompts. It gives you a token.
2. Put the token in `backend/.env` as `TELEGRAM_BOT_TOKEN=...` and restart the server. The log shows `Telegram bot started`.
3. Each person links their own account in the app: Profile settings, Telegram, Link Telegram, then Start in the bot chat.

The bot uses long polling, so it needs no public web address and works on a laptop. Run only one copy of the server with the token: two would compete for the same messages.

What it does:

- **Overdue reminders.** Once a minute it looks for open tasks whose due time has passed in the last 24 hours and whose assignee has linked Telegram, and sends each one once, with a Done button that marks the task complete. Reassigning or reopening a task allows a new reminder. People who have not linked Telegram get nothing.
- **Tasks from messages.** A message sent or forwarded to the bot in a private chat is read by the model and offered back as up to three task drafts, each with Add task and Ignore buttons. Nothing is created until Add is pressed. After adding, the bot suggests an assignee using the same logic as the app and offers to assign.
- **Groups.** The bot acts only on a message that mentions it by name, or on the message being replied to when the reply mentions it. Every other group message is ignored without being read. Leave the bot's privacy mode on (BotFather's default) so Telegram does not even deliver the rest.

- **When the model is unavailable.** If OpenAI cannot be reached, or no key is set, the bot asks for the details itself, one question at a time: name, date, time, place. Common answers are buttons; typed dates such as `14 Nov`, `14/11`, `Friday` or `tomorrow` and times such as `5:30pm` or `17:30` are understood without any AI. `/new` starts the same questions on purpose, and `/cancel` stops them. In a group, answers must be sent as replies to the bot. The assignee suggestion then comes from a plain rule: free at that time, marked available, fewest open tasks.

Only people who linked their account can use the bot, and a draft can be confirmed only by the person who asked for it. Text only for now: pictures and files are not read.

- `GET /api/telegram` returns `{"configured":true,"linked":false,"telegram_username":null}`.
- `POST /api/telegram/link` with `{"timezone":"Asia/Singapore"}` returns a one-time `https://t.me/<bot>?start=<code>` address, valid for 15 minutes. `DELETE /api/telegram` unlinks.

All Telegram calls go through `app/services/telegram_api.py`; the bot's behaviour is in `app/services/telegram_bot.py`, and the loop that runs it in `app/services/telegram_runner.py`.
