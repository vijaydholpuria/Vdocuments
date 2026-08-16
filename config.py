"""
Application configuration.
All environment-driven settings live here so app.py stays clean.

This app now stores metadata in Supabase (PostgreSQL) and files in
Cloudinary — see utils/supabase_client.py and utils/cloudinary.py.
Admin/visitor auth uses secure Flask sessions (signed cookies), not JWT.
"""
import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # --- Core Flask / session security ---
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY") or os.environ.get(
        "SECRET_KEY", "dev-secret-key-change-in-production"
    )

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get(
    "SESSION_COOKIE_SAMESITE",
    "Lax"
)
    # Secure cookies are only sent over HTTPS. Default OFF so local
    # development over plain http://localhost works out of the box; set
    # SESSION_COOKIE_SECURE=true in your production .env once you're
    # actually serving the app over HTTPS.
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"
    SESSION_PERMANENT = True
    # Re-sign the cookie on every request so an active visitor/admin never
    # gets logged out mid-session — only real inactivity expires it.
    SESSION_REFRESH_EACH_REQUEST = True

    # How long a PIN-unlocked file (and the admin/visitor session as a whole)
    # stays valid before it must be re-verified. See FEATURE 10 in the brief.
    FILE_ACCESS_SESSION_TIMEOUT = _int_env("FILE_ACCESS_SESSION_TIMEOUT", 1800)
    PERMANENT_SESSION_LIFETIME = timedelta(seconds=FILE_ACCESS_SESSION_TIMEOUT)

    # --- Supabase ---
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

    # --- Cloudinary ---
    CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
    CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")

    # --- Uploads ---
    MAX_CONTENT_LENGTH = _int_env("MAX_CONTENT_LENGTH", 1024 * 1024 * 1024)  # 1 GB per file

    # Every extension listed in the brief, plus a safe generic fallback set.
    ALLOWED_EXTENSIONS = {
        "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp",
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "txt", "md", "csv", "json", "xml",
        "zip", "rar", "7z", "tar", "gz",
        "apk", "exe", "msi",
        "mp4", "mov", "avi", "mkv", "webm",
        "mp3", "wav", "ogg", "flac",
        "py", "java", "c", "cpp", "h", "js", "html", "css", "sql", "sh",
    }

    # --- Defaults for the Settings row (seeded on first run) ---
    DEFAULT_WEBSITE_NAME = "V Doc"
    DEFAULT_THEME = "light"
    DEFAULT_PRIMARY_COLOR = "#2563EB"

    # --- PIN brute-force protection (per browser session, per file) ---
    PIN_MAX_ATTEMPTS = 5
    PIN_LOCKOUT_SECONDS = 60
