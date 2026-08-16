"""
Data-access layer.

There is no ORM here — Supabase (PostgreSQL) is queried directly through
the supabase-py client (see utils/supabase_client.py). Each model in this
package is a thin, focused wrapper around one table's queries so the rest
of the app (controllers/routes) never has to know Supabase's query syntax.
"""
