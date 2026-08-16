from flask import Blueprint, request, Response, stream_with_context
import mimetypes
import requests as http_requests
from models.file import File
from controllers.file_controller import (
    save_uploaded_file, update_file, delete_file, change_pin, register_download, UploadError
)
from utils.responses import ok, error, human_readable_size
from utils.security import is_valid_pin
from utils.gate import (
    admin_required, is_file_unlocked, mark_file_unlocked, clear_file_unlock, clear_all_unlocks,
    pin_lockout_remaining, register_failed_pin_attempt, clear_pin_attempts,
)
from utils import cloudinary as cloud
from werkzeug.security import check_password_hash

file_bp = Blueprint("files", __name__, url_prefix="/api")


def _public_dict(f: File):
    d = f.to_dict()
    d["is_unlocked"] = is_file_unlocked(f.id)
    d["filesize_human"] = human_readable_size(f.file_size)
    return d


# ---------------------------------------------------------------------------
# Public: list / detail  (never exposes access_pin_hash or the Cloudinary URL)
# ---------------------------------------------------------------------------

@file_bp.route("/files", methods=["GET"])
def list_files():
    search = request.args.get("search", "").strip()
    category_id = request.args.get("category_id", type=int)
    sort = request.args.get("sort", "latest")
    files = File.list_all(search=search, category_id=category_id, sort=sort)
    return ok([_public_dict(f) for f in files])


@file_bp.route("/files/<int:file_id>", methods=["GET"])
def get_file(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)
    return ok(_public_dict(f))


# ---------------------------------------------------------------------------
# Admin: upload / edit / delete
# ---------------------------------------------------------------------------

@file_bp.route("/files/upload", methods=["POST"])
@admin_required
def upload_file():
    title = request.form.get("title", "")
    description = request.form.get("description", "")
    category_id = request.form.get("category_id", type=int)
    pin = (request.form.get("pin") or "").strip()
    confirm_pin = (request.form.get("confirm_pin") or pin).strip()
    upload = request.files.get("file")

    try:
        new_file = save_uploaded_file(upload, title, description, category_id, pin, confirm_pin)
    except UploadError as e:
        return error(str(e), status=400)

    return ok(_public_dict(new_file), message="File uploaded successfully.", status=201)


@file_bp.route("/files/<int:file_id>", methods=["PUT"])
@admin_required
def edit_file(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)

    if request.content_type and "multipart/form-data" in request.content_type:
        title = request.form.get("title")
        description = request.form.get("description")
        category_id = request.form.get("category_id", type=int) if request.form.get("category_id") else None
        replacement = request.files.get("file")
    else:
        data = request.get_json(silent=True) or {}
        title = data.get("title")
        description = data.get("description")
        category_id = data.get("category_id")
        replacement = None

    try:
        updated = update_file(f, title, description, category_id, replacement_upload=replacement)
    except UploadError as e:
        return error(str(e), status=400)

    return ok(_public_dict(updated), message="File updated successfully.")


@file_bp.route("/files/<int:file_id>", methods=["DELETE"])
@admin_required
def remove_file(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)
    try:
        delete_file(f)
    except UploadError as e:
        return error(str(e), status=502)
    clear_file_unlock(file_id)
    clear_pin_attempts(file_id)
    return ok(message="File deleted successfully.")


@file_bp.route("/files/<int:file_id>/change-pin", methods=["POST"])
@admin_required
def change_pin_route(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)
    data = request.get_json(silent=True) or {}
    new_pin = (data.get("new_pin") or "").strip()
    confirm_pin = (data.get("confirm_pin") or "").strip()
    try:
        change_pin(f, new_pin, confirm_pin)
    except UploadError as e:
        return error(str(e), status=400)
    # The old PIN must stop working immediately for everyone.
    clear_file_unlock(file_id)
    clear_pin_attempts(file_id)
    return ok(message="Access PIN updated successfully.")


# ---------------------------------------------------------------------------
# Public: PIN verification + protected view/download
# ---------------------------------------------------------------------------

@file_bp.route("/files/<int:file_id>/verify-pin", methods=["POST"])
def verify_pin(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)

    remaining = pin_lockout_remaining(file_id)
    if remaining > 0:
        return error(f"Too many incorrect attempts. Try again in {remaining}s.", status=429)

    data = request.get_json(silent=True) or {}
    pin = (data.get("pin") or "").strip()

    if not is_valid_pin(pin) or not check_password_hash(f.access_pin_hash, pin):
        register_failed_pin_attempt(file_id)
        return error("Incorrect PIN. Please try again.", status=401)

    clear_pin_attempts(file_id)
    mark_file_unlocked(file_id)
    return ok({"unlocked": True}, message="Access granted.")


@file_bp.route("/files/<int:file_id>/view", methods=["GET"])
def view_file(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)
    if not is_file_unlocked(file_id):
        return error("This file requires a 6-digit PIN to access its contents.", status=403)
    return _proxy_asset(f, disposition="inline")


@file_bp.route("/files/<int:file_id>/download", methods=["GET"])
def download_file(file_id):
    f = File.get_by_id(file_id)
    if not f:
        return error("File not found.", status=404)
    if not is_file_unlocked(file_id):
        return error("This file requires a 6-digit PIN to access its contents.", status=403)

    resp = _proxy_asset(f, disposition="attachment")
    if isinstance(resp, Response) and resp.status_code < 400:
        register_download(f)
    return resp


@file_bp.route("/files/<int:file_id>/lock", methods=["POST"])
def lock_file(file_id):
    """Re-locks a single file — called by the frontend when the visitor
    closes the preview or finishes a download, so the file requires its
    PIN again the next time (rather than staying unlocked all session)."""
    clear_file_unlock(file_id)
    clear_pin_attempts(file_id)
    return ok(message="File locked.")


@file_bp.route("/files/lock-all", methods=["POST"])
def lock_all_files():
    """Re-locks every file the visitor had unlocked — called via
    navigator.sendBeacon when they leave the page/site entirely (tab
    close, navigation away), so nothing stays unlocked after they exit."""
    clear_all_unlocks()
    return ok(message="All files locked.")


def _proxy_asset(f: File, disposition: str):
    """Fetches the file from Cloudinary server-side and streams it straight
    to the browser. The signed Cloudinary URL is generated and used only
    here on the backend — it is never sent to the browser, so there's
    nothing for a visitor to copy, share, or replay outside the app."""
    try:
        signed_url = cloud.generate_signed_url(f.cloudinary_public_id, f.resource_type, f.file_format)
    except Exception as e:
        return error(f"Could not prepare this file: {e}", status=502)

    try:
        upstream = http_requests.get(signed_url, stream=True, timeout=30)
        upstream.raise_for_status()
    except Exception as e:
        return error(f"Could not retrieve this file from storage: {e}", status=502)

    # Cloudinary often serves raw/document assets with a generic
    # "application/octet-stream" Content-Type, which makes browsers force
    # a download even when we ask for inline display. Since we already
    # know the real file extension, trust our own guess first and only
    # fall back to whatever Cloudinary sent if we can't determine one.
    guessed_type, _ = mimetypes.guess_type(f.original_filename)
    upstream_type = upstream.headers.get("Content-Type")
    content_type = guessed_type or upstream_type or "application/octet-stream"
    safe_name = (f.original_filename or "file").replace('"', "")

    resp = Response(stream_with_context(upstream.iter_content(chunk_size=65536)), content_type=content_type)
    resp.headers["Content-Disposition"] = f'{disposition}; filename="{safe_name}"'
    if upstream.headers.get("Content-Length"):
        resp.headers["Content-Length"] = upstream.headers["Content-Length"]
    resp.headers["Cache-Control"] = "private, no-store"
    return resp