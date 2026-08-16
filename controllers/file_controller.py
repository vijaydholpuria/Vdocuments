"""
File upload / edit / delete business logic.

Upload flow (FEATURE 22):
  1. Validate file + title + category + PIN.
  2. Hash the PIN (never stored in plaintext).
  3. Upload the file to Cloudinary (private/authenticated asset).
  4. Save metadata + pin_hash to Supabase.
  5. If the Supabase insert fails after a successful Cloudinary upload,
     the Cloudinary asset is deleted so nothing is orphaned.
"""
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename
from models.file import File
from models.category import Category
from utils.security import allowed_file, sanitize_text, get_extension, is_valid_pin
from utils import cloudinary as cloud


class UploadError(Exception):
    pass


def save_uploaded_file(upload, title, description, category_id, pin, confirm_pin):
    if not upload or upload.filename == "":
        raise UploadError("No file selected.")

    original_name = secure_filename(upload.filename)
    if not original_name:
        raise UploadError("Invalid filename.")

    if not allowed_file(original_name):
        raise UploadError("This file type is not allowed.")

    clean_title = sanitize_text(title, 255)
    if not clean_title:
        raise UploadError("Title is required.")

    if not is_valid_pin(pin):
        raise UploadError("PIN must be exactly 6 digits (numbers only).")
    if pin != confirm_pin:
        raise UploadError("PIN and confirmation PIN do not match.")

    cat = Category.get_by_id(category_id) if category_id else None
    ext = get_extension(original_name)

    try:
        cloud_result = cloud.upload_file(upload, ext)
    except Exception as e:
        raise UploadError(f"Upload to storage failed: {e}")

    try:
        new_file = File.create({
            "title": clean_title,
            "description": sanitize_text(description, 5000),
            "category_id": cat.id if cat else None,
            "original_filename": original_name,
            "cloudinary_url": cloud_result.get("secure_url"),
            "cloudinary_public_id": cloud_result.get("public_id"),
            "resource_type": cloud_result.get("resource_type"),
            "file_format": cloud_result.get("format") or ext,
            "file_size": cloud_result.get("bytes") or 0,
            "access_pin_hash": generate_password_hash(pin),
        })
    except Exception as e:
        # Don't leave an orphaned Cloudinary asset if the DB insert failed.
        try:
            cloud.delete_file(cloud_result.get("public_id"), cloud_result.get("resource_type"))
        except Exception:
            pass
        raise UploadError(f"Saving file metadata failed: {e}")

    return new_file


def update_file(file_obj: File, title, description, category_id, replacement_upload=None):
    fields = {}
    if title is not None:
        clean = sanitize_text(title, 255)
        if clean:
            fields["title"] = clean
    if description is not None:
        fields["description"] = sanitize_text(description, 5000)
    if category_id is not None:
        cat = Category.get_by_id(category_id) if category_id else None
        fields["category_id"] = cat.id if cat else None

    old_public_id, old_resource_type = file_obj.cloudinary_public_id, file_obj.resource_type

    if replacement_upload and replacement_upload.filename:
        original_name = secure_filename(replacement_upload.filename)
        if not original_name or not allowed_file(original_name):
            raise UploadError("This file type is not allowed.")
        ext = get_extension(original_name)
        try:
            cloud_result = cloud.upload_file(replacement_upload, ext)
        except Exception as e:
            raise UploadError(f"Upload to storage failed: {e}")

        fields.update({
            "original_filename": original_name,
            "cloudinary_url": cloud_result.get("secure_url"),
            "cloudinary_public_id": cloud_result.get("public_id"),
            "resource_type": cloud_result.get("resource_type"),
            "file_format": cloud_result.get("format") or ext,
            "file_size": cloud_result.get("bytes") or 0,
        })

    updated = File.update(file_obj.id, fields)

    if replacement_upload and replacement_upload.filename and old_public_id:
        try:
            cloud.delete_file(old_public_id, old_resource_type)
        except Exception:
            pass  # metadata is already updated; surface nothing fatal to the admin

    return updated


def change_pin(file_obj: File, new_pin: str, confirm_pin: str):
    if not is_valid_pin(new_pin):
        raise UploadError("PIN must be exactly 6 digits (numbers only).")
    if new_pin != confirm_pin:
        raise UploadError("PIN and confirmation PIN do not match.")
    File.update(file_obj.id, {"access_pin_hash": generate_password_hash(new_pin)})


def delete_file(file_obj: File):
    if file_obj.cloudinary_public_id:
        try:
            cloud.delete_file(file_obj.cloudinary_public_id, file_obj.resource_type)
        except Exception as e:
            raise UploadError(f"Could not delete the file from storage — nothing was removed. ({e})")
    File.delete(file_obj.id)


def register_download(file_obj: File):
    File.increment_downloads(file_obj.id, file_obj.downloads)
