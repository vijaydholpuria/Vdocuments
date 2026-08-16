from datetime import datetime, timezone
from flask import Blueprint
from models.file import File
from models.category import Category
from utils.responses import ok, human_readable_size
from utils.gate import admin_required

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api")


@dashboard_bp.route("/dashboard", methods=["GET"])
@admin_required
def dashboard_stats():
    total_files = File.count()
    total_downloads = File.sum_downloads()
    total_categories = Category.count()
    todays_uploads = File.count_created_today()
    storage_used = File.sum_file_size()

    recent = File.recent(limit=8)
    recent_list = []
    for f in recent:
        d = f.to_dict()
        d["filesize_human"] = human_readable_size(f.file_size)
        recent_list.append(d)

    return ok({
        "total_files": total_files,
        "total_downloads": total_downloads,
        "todays_uploads": todays_uploads,
        "total_categories": total_categories,
        "protected_files": total_files,  # every file requires its PIN
        "storage_used": storage_used,
        "storage_used_human": human_readable_size(storage_used),
        "recent_uploads": recent_list,
    })
