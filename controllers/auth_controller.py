"""Admin authentication logic — used by routes/auth_routes.py."""
from models.admin import Admin
from utils.security import sanitize_text, strong_enough_password


def authenticate(email: str, password: str):
    """Return (admin, None) on success, or (None, error_message) on failure.
    Never reveals whether the email or the password was the wrong part."""
    email = sanitize_text(email, max_len=255).lower()
    if not email or not password:
        return None, "Email and password are required."

    admin = Admin.get_by_email(email)
    if not admin or not admin.check_password(password):
        return None, "Invalid email or password."

    return admin, None


def change_password(admin: Admin, current_password: str, new_password: str):
    if not admin.check_password(current_password):
        return False, "Current password is incorrect."
    if not strong_enough_password(new_password):
        return False, "New password must be at least 6 characters."
    Admin.set_password(admin.id, new_password)
    return True, "Password updated successfully."
