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

## Tasks, activity, and appointments API

These routes require an authenticated family member and only ever read or change that member's own family.

- `GET /api/families/me/tasks` lists tasks, each with its activity history.
- `POST /api/families/me/tasks` creates a task. Body: `{"title":"Pick up medication","detail":"Oak Pharmacy","location":null,"due_at":"2026-10-12T17:30:00+08:00","category":"Medication","priority":"High","assignee_id":null}`. Only `title` is required. `priority` is `High`, `Normal` (the default), or `Low`, and is chosen by whoever creates the task.
- `POST /api/families/me/tasks/{task_id}/assign` sets or clears the assignee. Body: `{"assignee_id":"<user id>"}` or `{"assignee_id":null}`. The assignee must belong to the family. There is no accept or decline step: an assigned task is simply that person's until it is completed or reassigned.
- `POST /api/families/me/tasks/{task_id}/complete` and `/reopen` can be called by any family member.
- `GET /api/families/me/activity?limit=20` returns the family's most recent task activity, newest first.
- `GET /api/families/me/appointments`, `POST /api/families/me/appointments`, and `DELETE /api/families/me/appointments/{appointment_id}` manage appointments. Create body: `{"title":"GP review","place":"Riverside Family Practice","starts_at":"2026-10-11T10:30:00+08:00","attendee_id":null,"related_task_id":null}`.

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