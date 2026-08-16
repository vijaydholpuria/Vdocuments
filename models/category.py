"""Category queries — the categories table in Supabase."""
from datetime import datetime, timezone
from utils.supabase_client import get_supabase

TABLE = "categories"


class Category:
    def __init__(self, row: dict, file_count: int = 0):
        self.id = row["id"]
        self.name = row["name"]
        self.created_at = row.get("created_at")
        self.file_count = file_count

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "file_count": self.file_count,
            "created_at": self.created_at,
        }

    # --- Queries ---

    @staticmethod
    def _file_counts() -> dict:
        """id -> number of files, computed in one query."""
        res = get_supabase().table("files").select("category_id").execute()
        counts = {}
        for row in res.data or []:
            cid = row.get("category_id")
            if cid is not None:
                counts[cid] = counts.get(cid, 0) + 1
        return counts

    @staticmethod
    def list_all():
        res = get_supabase().table(TABLE).select("*").order("name").execute()
        counts = Category._file_counts()
        return [Category(row, counts.get(row["id"], 0)) for row in (res.data or [])]

    @staticmethod
    def get_by_id(cat_id):
        res = get_supabase().table(TABLE).select("*").eq("id", cat_id).limit(1).execute()
        rows = res.data or []
        if not rows:
            return None
        counts = Category._file_counts()
        return Category(rows[0], counts.get(rows[0]["id"], 0))

    @staticmethod
    def get_by_name_ci(name: str):
        res = get_supabase().table(TABLE).select("*").ilike("name", name).limit(1).execute()
        rows = res.data or []
        return Category(rows[0]) if rows else None

    @staticmethod
    def create(name: str):
        row = {"name": name, "created_at": datetime.now(timezone.utc).isoformat()}
        res = get_supabase().table(TABLE).insert(row).execute()
        return Category(res.data[0])

    @staticmethod
    def update(cat_id, name: str):
        res = get_supabase().table(TABLE).update({"name": name}).eq("id", cat_id).execute()
        return Category(res.data[0]) if res.data else None

    @staticmethod
    def delete(cat_id):
        # Files in this category become uncategorized rather than being deleted.
        get_supabase().table("files").update({"category_id": None}).eq("category_id", cat_id).execute()
        get_supabase().table(TABLE).delete().eq("id", cat_id).execute()

    @staticmethod
    def count():
        res = get_supabase().table(TABLE).select("id", count="exact").execute()
        return res.count or 0
