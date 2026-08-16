"""File queries — the files table in Supabase.

`access_pin_hash` is the ONLY thing that must never leave this layer:
to_dict() (the safe/public representation) always omits it. Routes that
need to check it (verify-pin, change-pin) read it via get_by_id() and use
it in memory only.
"""
from datetime import datetime, timezone
from utils.supabase_client import get_supabase

TABLE = "files"

SAFE_COLUMNS = (
    "id, title, description, category_id, original_filename, "
    "resource_type, file_format, file_size, downloads, created_at"
)


class File:
    def __init__(self, row: dict, category_name: str = "Uncategorized"):
        self.id = row["id"]
        self.title = row["title"]
        self.description = row.get("description") or ""
        self.category_id = row.get("category_id")
        self.original_filename = row["original_filename"]
        self.cloudinary_url = row.get("cloudinary_url")
        self.cloudinary_public_id = row.get("cloudinary_public_id")
        self.resource_type = row.get("resource_type")
        self.file_format = row.get("file_format") or ""
        self.file_size = row.get("file_size") or 0
        self.downloads = row.get("downloads") or 0
        self.access_pin_hash = row.get("access_pin_hash")
        self.created_at = row.get("created_at")
        self.category_name = category_name

    def to_dict(self):
        """Public-safe representation — NEVER includes access_pin_hash,
        cloudinary_url, or cloudinary_public_id. is_protected/is_unlocked
        are added by the route layer, which knows the current session."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category_name,
            "category_id": self.category_id,
            "filename": self.original_filename,
            "file_ext": self.file_format,
            "filesize": self.file_size,
            "downloads": self.downloads,
            "upload_date": self.created_at,
            "is_protected": True,  # every uploaded file requires its PIN
        }

    # --- Queries ---

    @staticmethod
    def _category_names() -> dict:
        res = get_supabase().table("categories").select("id, name").execute()
        return {row["id"]: row["name"] for row in (res.data or [])}

    @staticmethod
    def list_all(search: str = "", category_id=None, sort: str = "latest"):
        query = get_supabase().table(TABLE).select("*")
        if search:
            like = f"%{search}%"
            query = query.or_(
                f"title.ilike.{like},description.ilike.{like},original_filename.ilike.{like}"
            )
        if category_id:
            query = query.eq("category_id", category_id)

        if sort == "oldest":
            query = query.order("created_at", desc=False)
        elif sort == "downloads":
            query = query.order("downloads", desc=True)
        elif sort == "az":
            query = query.order("title", desc=False)
        else:
            query = query.order("created_at", desc=True)

        res = query.execute()
        cat_names = File._category_names()
        return [
            File(row, cat_names.get(row.get("category_id"), "Uncategorized"))
            for row in (res.data or [])
        ]

    @staticmethod
    def get_by_id(file_id):
        res = get_supabase().table(TABLE).select("*").eq("id", file_id).limit(1).execute()
        rows = res.data or []
        if not rows:
            return None
        cat_names = File._category_names()
        return File(rows[0], cat_names.get(rows[0].get("category_id"), "Uncategorized"))

    @staticmethod
    def create(data: dict):
        data = dict(data)
        data.setdefault("downloads", 0)
        data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        res = get_supabase().table(TABLE).insert(data).execute()
        return File(res.data[0])

    @staticmethod
    def update(file_id, fields: dict):
        if not fields:
            return File.get_by_id(file_id)
        res = get_supabase().table(TABLE).update(fields).eq("id", file_id).execute()
        return File(res.data[0]) if res.data else None

    @staticmethod
    def delete(file_id):
        get_supabase().table(TABLE).delete().eq("id", file_id).execute()

    @staticmethod
    def increment_downloads(file_id, current_value: int):
        get_supabase().table(TABLE).update({"downloads": current_value + 1}).eq("id", file_id).execute()

    @staticmethod
    def count():
        res = get_supabase().table(TABLE).select("id", count="exact").execute()
        return res.count or 0

    @staticmethod
    def sum_downloads():
        res = get_supabase().table(TABLE).select("downloads").execute()
        return sum((row.get("downloads") or 0) for row in (res.data or []))

    @staticmethod
    def sum_file_size():
        res = get_supabase().table(TABLE).select("file_size").execute()
        return sum((row.get("file_size") or 0) for row in (res.data or []))

    @staticmethod
    def count_created_today():
        today = datetime.now(timezone.utc).date().isoformat()
        res = get_supabase().table(TABLE).select("id").gte("created_at", today).execute()
        return len(res.data or [])

    @staticmethod
    def recent(limit: int = 8):
        res = get_supabase().table(TABLE).select("*").order("created_at", desc=True).limit(limit).execute()
        cat_names = File._category_names()
        return [
            File(row, cat_names.get(row.get("category_id"), "Uncategorized"))
            for row in (res.data or [])
        ]
