"""
Cloudinary storage helpers.

Files are uploaded with type="authenticated" so they are NOT reachable via
a plain public URL — Cloudinary will refuse an unsigned request for them.
A working URL can only be produced by generate_signed_url()/generate_signed_download_url()
below, and those are only ever called by the backend AFTER a file has been
unlocked (PIN verified) for the current session. This satisfies the brief's
"do not expose public Cloudinary URLs for protected files" requirement.

Credentials are loaded from the environment — never hardcoded, never sent
to the browser.
"""
import os
import cloudinary
import cloudinary.uploader
import cloudinary.utils

_configured = False

IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"}
VIDEO_EXT = {"mp4", "mov", "avi", "mkv", "webm"}
AUDIO_EXT = {"mp3", "wav", "ogg", "flac"}  # Cloudinary files these under resource_type "video"


def _configure():
    global _configured
    if _configured:
        return
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")
    if not (cloud_name and api_key and api_secret):
        raise RuntimeError(
            "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set "
            "in the environment. Copy .env.example to .env and fill them in."
        )
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )
    _configured = True


def resource_type_and_folder(ext: str):
    """Map a file extension to a Cloudinary resource_type + storage folder."""
    ext = (ext or "").lower()
    if ext in IMAGE_EXT:
        return "image", "vdoc/images"
    if ext in VIDEO_EXT or ext in AUDIO_EXT:
        return "video", "vdoc/videos"
    if ext in {"zip", "rar", "7z", "tar", "gz", "apk", "exe", "msi"}:
        return "raw", "vdoc/files"
    return "raw", "vdoc/documents"


def upload_file(file_storage, ext: str) -> dict:
    """Upload a Werkzeug FileStorage to Cloudinary as a private/authenticated asset.

    Returns the raw Cloudinary response dict (secure_url, public_id, bytes,
    format, resource_type, ...).
    """
    _configure()
    resource_type, folder = resource_type_and_folder(ext)
    result = cloudinary.uploader.upload(
        file_storage,
        resource_type=resource_type,
        type="authenticated",
        folder=folder,
        use_filename=False,
        unique_filename=True,
        overwrite=False,
    )
    return result


def delete_file(public_id: str, resource_type: str) -> dict:
    """Delete an asset from Cloudinary. Raises on failure (caller must handle)."""
    _configure()
    result = cloudinary.uploader.destroy(
        public_id, resource_type=resource_type, type="authenticated", invalidate=True
    )
    return result


def generate_signed_url(public_id: str, resource_type: str, file_format: str = None) -> str:
    """A signed URL for SERVER-SIDE use only — Flask fetches this itself and
    streams the bytes back to the browser (see routes/file_routes.py). The
    actual Cloudinary URL is never sent to the browser.

    Uses Cloudinary's standard request-signing (sign_url=True) rather than
    the separate "token-based authentication" add-on, since that add-on
    requires a dedicated auth-token key configured in the Cloudinary
    account's security settings that most accounts don't have set up.

    IMPORTANT: for resource_type="raw" (pdf/docx/zip/etc.), Cloudinary
    bakes the extension into public_id itself — passing `format` as well
    would append the extension a second time (e.g. "....pdf.pdf") and the
    resulting URL would 401/404. So format is only passed for image/video.
    """
    _configure()
    fmt = file_format if resource_type in ("image", "video") else None
    url, _options = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type=resource_type,
        type="authenticated",
        sign_url=True,
        secure=True,
        format=fmt or None,
    )
    return url