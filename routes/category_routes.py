from flask import Blueprint, request
from models.category import Category
from utils.security import sanitize_text
from utils.responses import ok, error
from utils.gate import admin_required

category_bp = Blueprint("categories", __name__, url_prefix="/api")


@category_bp.route("/categories", methods=["GET"])
def list_categories():
    cats = Category.list_all()
    return ok([c.to_dict() for c in cats])


@category_bp.route("/categories", methods=["POST"])
@admin_required
def create_category():
    data = request.get_json(silent=True) or {}
    name = sanitize_text(data.get("name", ""), 120)
    if not name:
        return error("Category name is required.", status=400)
    if Category.get_by_name_ci(name):
        return error("A category with this name already exists.", status=409)
    cat = Category.create(name)
    return ok(cat.to_dict(), message="Category created successfully.", status=201)


@category_bp.route("/categories/<int:cat_id>", methods=["PUT"])
@admin_required
def update_category(cat_id):
    cat = Category.get_by_id(cat_id)
    if not cat:
        return error("Category not found.", status=404)
    data = request.get_json(silent=True) or {}
    name = sanitize_text(data.get("name", ""), 120)
    if not name:
        return error("Category name is required.", status=400)
    existing = Category.get_by_name_ci(name)
    if existing and existing.id != cat.id:
        return error("A category with this name already exists.", status=409)
    updated = Category.update(cat_id, name)
    return ok(updated.to_dict(), message="Category updated successfully.")


@category_bp.route("/categories/<int:cat_id>", methods=["DELETE"])
@admin_required
def delete_category(cat_id):
    cat = Category.get_by_id(cat_id)
    if not cat:
        return error("Category not found.", status=404)
    Category.delete(cat_id)
    return ok(message="Category deleted successfully.")
