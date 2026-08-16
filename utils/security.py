"""
Small, focused security helpers used across the app:
- input sanitization (defends against stored XSS)
- file extension / size validation for uploads
- PIN validation
"""
import re
import bleach
from flask import current_app


def sanitize_text(value: str, max_len: int = 5000) -> str:
    """Strip any HTML/script content from user-supplied text fields.

    Supabase's client already parameterizes queries (no SQL injection risk);
    this function's job is specifically to prevent stored XSS by stripping
    tags/attributes from anything that gets rendered back into the page
    later (titles, descriptions, category names).
    """
    if value is None:
        return ""
    value = str(value).strip()[:max_len]
    return bleach.clean(value, tags=[], attributes={}, strip=True)


def allowed_file(filename: str) -> bool:
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in current_app.config["ALLOWED_EXTENSIONS"]


def get_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def strong_enough_password(password: str) -> bool:
    return isinstance(password, str) and len(password) >= 6


VALID_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}){1,2}$")


def is_valid_hex_color(value: str) -> bool:
    return bool(value) and bool(VALID_HEX_COLOR.match(value))


PIN_PATTERN = re.compile(r"^\d{6}$")


def is_valid_pin(pin: str) -> bool:
    """Exactly 6 digits, numbers only — no letters, spaces, or symbols."""
    return bool(pin) and bool(PIN_PATTERN.match(pin))
