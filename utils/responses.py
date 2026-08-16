"""Consistent JSON response helpers for the API."""
from flask import jsonify


def ok(data=None, message="Success", status=200):
    payload = {"success": True, "message": message}
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def error(message="Something went wrong", status=400, errors=None):
    payload = {"success": False, "message": message}
    if errors is not None:
        payload["errors"] = errors
    return jsonify(payload), status


def human_readable_size(num_bytes: int) -> str:
    if not num_bytes:
        return "0 B"
    size = float(num_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024.0:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"
