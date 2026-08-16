from flask import Blueprint, request, session
from models.admin import Admin
from controllers.auth_controller import authenticate, change_password
from utils.responses import ok, error
from utils.gate import admin_required, current_admin_id

auth_bp = Blueprint("auth", __name__, url_prefix="/api")


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    admin, err = authenticate(data.get("email", ""), data.get("password", ""))
    if err:
        return error(err, status=401)

    session.clear()  # never carry over a stale visitor unlock/attempt state
    session["admin_id"] = admin.id
    session["admin_email"] = admin.email
    session.permanent = True

    return ok({"admin": admin.to_dict()}, message="Login successful.")


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return ok(message="Logged out.")


@auth_bp.route("/change-password", methods=["PUT"])
@admin_required
def change_password_route():
    admin = Admin.get_by_id(current_admin_id())
    if not admin:
        return error("Admin not found.", status=404)
    data = request.get_json(silent=True) or {}
    success, message = change_password(
        admin, data.get("current_password", ""), data.get("new_password", "")
    )
    if not success:
        return error(message, status=400)
    return ok(message=message)


@auth_bp.route("/me", methods=["GET"])
@admin_required
def me():
    admin = Admin.get_by_id(current_admin_id())
    if not admin:
        return error("Admin not found.", status=404)
    return ok(admin.to_dict())
