"""
Session-based access control:

1. admin_required — guards every admin-only route using the secure Flask
   session (set at /api/login), replacing the old JWT-based guard.

2. Per-file PIN unlock state — once a visitor enters the correct PIN for a
   file, that file's id is stored in the server-side session
   (session["unlocked_files"]), so pressing Back / re-opening the same file
   never asks for the PIN again during the same valid session. Nothing about
   the PIN itself (plain or hashed) is ever stored client-side.

3. Simple per-session brute-force protection for PIN attempts.

The whole session (and therefore every unlock) expires automatically after
Config.FILE_ACCESS_SESSION_TIMEOUT seconds of inactivity (see config.py /
SESSION_REFRESH_EACH_REQUEST), matching FEATURE 10 in the brief.
"""
import time
from functools import wraps
from flask import session, current_app
from utils.responses import error


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin_id"):
            return error("Authentication required.", status=401)
        return fn(*args, **kwargs)
    return wrapper


def current_admin_id():
    return session.get("admin_id")


# ---------------------------------------------------------------------------
# Per-file unlock state
# ---------------------------------------------------------------------------

def is_file_unlocked(file_id) -> bool:
    if session.get("admin_id"):
        return True  # the admin can always view/download without a PIN
    unlocked = session.get("unlocked_files") or {}
    return str(file_id) in unlocked


def mark_file_unlocked(file_id) -> None:
    unlocked = dict(session.get("unlocked_files") or {})
    unlocked[str(file_id)] = int(time.time())
    session["unlocked_files"] = unlocked
    session.permanent = True
    session.modified = True


def clear_file_unlock(file_id) -> None:
    """Called when a file is deleted, its PIN is changed by the admin, or
    the visitor explicitly re-locks it (closing the preview / leaving the site)."""
    unlocked = dict(session.get("unlocked_files") or {})
    if str(file_id) in unlocked:
        del unlocked[str(file_id)]
        session["unlocked_files"] = unlocked
        session.modified = True


def clear_all_unlocks() -> None:
    """Re-locks every file for the current session — used when the visitor
    leaves the site/page entirely (see /api/files/lock-all)."""
    session["unlocked_files"] = {}
    session.modified = True


# ---------------------------------------------------------------------------
# PIN brute-force protection (per browser session, per file)
# ---------------------------------------------------------------------------

def pin_lockout_remaining(file_id) -> int:
    """Seconds left before this session may try this file's PIN again (0 = not locked)."""
    attempts = session.get("pin_attempts") or {}
    entry = attempts.get(str(file_id))
    if not entry:
        return 0
    remaining = entry.get("locked_until", 0) - time.time()
    return max(0, int(remaining))


def register_failed_pin_attempt(file_id) -> None:
    attempts = dict(session.get("pin_attempts") or {})
    entry = dict(attempts.get(str(file_id)) or {"count": 0, "locked_until": 0})
    entry["count"] = entry.get("count", 0) + 1
    if entry["count"] >= current_app.config["PIN_MAX_ATTEMPTS"]:
        entry["locked_until"] = time.time() + current_app.config["PIN_LOCKOUT_SECONDS"]
        entry["count"] = 0
    attempts[str(file_id)] = entry
    session["pin_attempts"] = attempts
    session.modified = True


def clear_pin_attempts(file_id) -> None:
    attempts = dict(session.get("pin_attempts") or {})
    if str(file_id) in attempts:
        del attempts[str(file_id)]
        session["pin_attempts"] = attempts
        session.modified = True