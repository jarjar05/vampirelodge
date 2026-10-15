#!/bin/sh
# Runs the backend tests against the Postgres database in SUPABASE_DATABASE_URL (from backend/.env), to check the
# app works on Postgres before it goes live. Every test wipes the database, so only use this while it is still empty.
# The address is read from backend/.env and passed straight to the tests; it is never printed.
cd "$(dirname "$0")/../backend" || exit 1
TEST_DATABASE_URL="$(.venv/bin/python -c 'from dotenv import dotenv_values; print(dotenv_values(".env").get("SUPABASE_DATABASE_URL") or "")')"
if [ -z "$TEST_DATABASE_URL" ]; then
  echo "Add SUPABASE_DATABASE_URL to backend/.env first." >&2
  exit 1
fi
TEST_DATABASE_URL="$TEST_DATABASE_URL" exec .venv/bin/python -m pytest -q -p no:cacheprovider "$@"
