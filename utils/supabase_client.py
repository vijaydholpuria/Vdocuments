"""
Single shared Supabase client for the whole app.

Credentials are loaded from the environment (.env) — never hardcoded.
Uses the service_role key so the Flask backend (which enforces its own
auth via secure sessions) can read/write freely; the browser never talks
to Supabase directly.
"""
import os
from supabase import create_client, Client

_client: "Client | None" = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in the environment. "
                "Copy .env.example to .env and fill them in."
            )
        _client = create_client(url, key)
    return _client
