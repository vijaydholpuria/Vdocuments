"""Site settings — single-row `settings` table in Supabase."""
from utils.supabase_client import get_supabase

TABLE = "settings"


class Settings:
    def __init__(self, row: dict):
        self.id = row["id"]
        self.website_name = row.get("website_name") or "V Doc"
        self.logo = row.get("logo") or ""
        self.theme = row.get("theme") or "light"
        self.primary_color = row.get("primary_color") or "#2563EB"

    def to_dict(self):
        return {
            "website_name": self.website_name,
            "logo": self.logo,
            "theme": self.theme,
            "primary_color": self.primary_color,
        }

    @staticmethod
    def get(default_name="V Doc", default_theme="light", default_color="#2563EB"):
        res = get_supabase().table(TABLE).select("*").limit(1).execute()
        rows = res.data or []
        if rows:
            return Settings(rows[0])
        row = {
            "website_name": default_name,
            "logo": "",
            "theme": default_theme,
            "primary_color": default_color,
        }
        res = get_supabase().table(TABLE).insert(row).execute()
        return Settings(res.data[0])

    @staticmethod
    def update(settings_id, fields: dict):
        if not fields:
            return
        get_supabase().table(TABLE).update(fields).eq("id", settings_id).execute()
