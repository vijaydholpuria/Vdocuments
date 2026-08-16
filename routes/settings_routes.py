import os
import uuid
from flask import Blueprint, request, current_app
from werkzeug.utils import secure_filename
from models.settings import Settings
from utils.security import sanitize_text, is_valid_hex_color
from utils.responses import ok, error
from utils.gate import admin_required

settings_bp = Blueprint("settings", __name__, url_prefix="/api")

LOGO_ALLOWED = {"png", "jpg", "jpeg", "svg", "webp", "gif"}


@settings_bp.route("/settings", methods=["GET"])
def get_settings():
    s = Settings.get(
        current_app.config["DEFAULT_WEBSITE_NAME"],
        current_app.config["DEFAULT_THEME"],
        current_app.config["DEFAULT_PRIMARY_COLOR"],
    )
    return ok(s.to_dict())


@settings_bp.route("/settings", methods=["PUT"])
@admin_required
def update_settings():
    s = Settings.get(
        current_app.config["DEFAULT_WEBSITE_NAME"],
        current_app.config["DEFAULT_THEME"],
        current_app.config["DEFAULT_PRIMARY_COLOR"],
    )
    fields = {}

    # The site logo is a small, non-secret static asset — kept on local disk
    # (served from /static) rather than Cloudinary, same as before.
    if request.content_type and "multipart/form-data" in request.content_type:
        website_name = request.form.get("website_name")
        theme = request.form.get("theme")
        primary_color = request.form.get("primary_color")
        logo = request.files.get("logo")

        if logo and logo.filename:
            ext = logo.filename.rsplit(".", 1)[-1].lower() if "." in logo.filename else ""
            if ext not in LOGO_ALLOWED:
                return error("Logo must be an image file (png, jpg, svg, webp, gif).", status=400)
            images_dir = os.path.join(current_app.static_folder, "images")
            os.makedirs(images_dir, exist_ok=True)
            safe_name = f"logo_{uuid.uuid4().hex}.{ext}"
            logo.save(os.path.join(images_dir, secure_filename(safe_name)))
            fields["logo"] = f"images/{safe_name}"
    else:
        data = request.get_json(silent=True) or {}
        website_name = data.get("website_name")
        theme = data.get("theme")
        primary_color = data.get("primary_color")

    if website_name is not None:
        clean = sanitize_text(website_name, 120)
        if clean:
            fields["website_name"] = clean
    if theme is not None and theme in ("light", "dark"):
        fields["theme"] = theme
    if primary_color is not None and is_valid_hex_color(primary_color):
        fields["primary_color"] = primary_color

    Settings.update(s.id, fields)
    updated = Settings.get()
    return ok(updated.to_dict(), message="Settings updated successfully.")
