"""Admin account queries — the admins table in Supabase."""
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from utils.supabase_client import get_supabase

TABLE = "admins"


class Admin:
    def __init__(self, row: dict):
        self.id = row["id"]
        self.email = row["email"]
        self.password_hash = row["password_hash"]
        self.created_at = row.get("created_at")

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self):
        return {"id": self.id, "email": self.email}

    # --- Queries ---

    @staticmethod
    def get_by_email(email: str):
        res = get_supabase().table(TABLE).select("*").eq("email", email.lower()).limit(1).execute()
        rows = res.data or []
        return Admin(rows[0]) if rows else None

    @staticmethod
    def get_by_id(admin_id):
        res = get_supabase().table(TABLE).select("*").eq("id", admin_id).limit(1).execute()
        rows = res.data or []
        return Admin(rows[0]) if rows else None

    @staticmethod
    def create(email: str, raw_password: str):
        row = {
            "email": email.lower(),
            "password_hash": generate_password_hash(raw_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = get_supabase().table(TABLE).insert(row).execute()
        return Admin(res.data[0])

    @staticmethod
    def set_password(admin_id, raw_password: str):
        get_supabase().table(TABLE).update(
            {"password_hash": generate_password_hash(raw_password)}
        ).eq("id", admin_id).execute()

    @staticmethod
    def count():
        res = get_supabase().table(TABLE).select("id", count="exact").execute()
        return res.count or 0
