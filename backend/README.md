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

The backend includes a local PostgreSQL service whose database files live under `backend/data/postgres/`. Start it from the `backend` directory:

```sh
docker compose up -d db
```

The service is bound to localhost only and uses trust authentication for local development. Do not expose this configuration to a network or use it for production. `.env` sets the database role and connection URL; edit those values together if you change the role.

Initialize the application tables:

```sh
python -m app.init_db
```

The initializer uses SQLAlchemy `create_all` for a lightweight hackathon setup. It creates missing tables; it does not replace schema migrations for production.

ChromaDB uses a separate persistent local store at `backend/data/chroma/` by default. Configure `CHROMA_PERSIST_DIR` in `.env` to change it. PostgreSQL remains the source of truth for users, families, tasks, appointments, and application state; ChromaDB is only for semantic knowledge retrieval. ChromaDB is initialized by FastAPI and must not be accessed by the React app.

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

Settings are loaded from `backend/.env`. `FRONTEND_ORIGIN` configures the allowed browser origin for CORS and defaults to `http://localhost:5173`. `DATABASE_URL` configures the PostgreSQL connection.

The user model stores a UUID, normalized unique email, name, password hash, and creation timestamp. Passwords are hashed with Argon2 and are never stored as plaintext. Authentication uses email and password with an HttpOnly session cookie; session token hashes are stored in PostgreSQL.

## Create the first account

Public self-registration is disabled. After PostgreSQL is running and the tables have been initialized, provision an account interactively from the `backend` directory:

```sh
python -m app.create_user
```

The password is entered with terminal input hidden. Sign in through the React app at `/login`. The API provides `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`. Set `SESSION_COOKIE_SECURE=true` when serving over HTTPS.

## Family API

All family endpoints require the authenticated session cookie. A user can belong to one family at a time. Family access is resolved from the authenticated user; clients do not supply a family ID to select the family.

- `POST /api/families` creates a family and makes the creator its `ADMIN`. Request body: `{"name":"Mum's Care"}`. The response includes its invite code.
- `GET /api/families/me` returns the authenticated user's family.
- `GET /api/families/me/members` returns member IDs, names, emails, roles, and join timestamps; password hashes are never included.
- `POST /api/families/join` joins by invite code. Request body: `{"invite_code":"ABC123"}`. Invalid codes and existing memberships are rejected.
- `POST /api/families/leave` removes the authenticated user's membership. The final admin cannot leave until another admin exists.

## Family knowledge API

These routes require an authenticated family member. The backend obtains the family ID from the session membership and applies it to every ChromaDB operation; clients cannot select another family's records by passing a family ID.

- `POST /api/families/me/knowledge` adds one document. Body: `{"content":"Care notes...","category":"care_note","source":"care-plan.pdf"}`.
- `POST /api/families/me/knowledge/batch` adds 1–100 documents using a `{"documents":[...]}` body.
- `GET /api/families/me/knowledge/search?query=medication&limit=5` searches only the authenticated family's knowledge. An optional `category` query parameter narrows results.
- `DELETE /api/families/me/knowledge/{document_id}` deletes only when that document belongs to the authenticated user's family.

Knowledge metadata includes `family_id`, `category`, `source`, and an ISO-8601 `created_at`. No LLM or AI generation is included.

Do not commit `.env` or put secrets in source code. `.env.example` contains placeholders only.