"""
V Doc — Document Management & File Sharing
Flask application entry point.

Metadata lives in Supabase (PostgreSQL); files live in Cloudinary.
Run the schema in supabase_schema.sql (and optionally supabase_seed.sql)
against your Supabase project first, then create an admin with:
    python scripts/create_admin.py
 
Run with:  python app.py
"""
import os
from dotenv import load_dotenv
load_dotenv()  # populate os.environ from .env before Config reads it

from flask import Flask, jsonify
from flask_cors import CORS

from config import Config

from routes.auth_routes import auth_bp
from routes.file_routes import file_bp
from routes.category_routes import category_bp
from routes.dashboard_routes import dashboard_bp
from routes.settings_routes import settings_bp


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(Config)

    # --- Extensions ---
    frontend_url = os.environ.get(
        "FRONTEND_URL",
        "http://localhost:5500"
    )

    CORS(
        app,
        origins=[
            frontend_url,
            "http://localhost:5500",
            "http://127.0.0.1:5500",
        ],
        supports_credentials=True
    )

    # --- Blueprints (all under /api, see each routes/*.py file) ---
    app.register_blueprint(auth_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(category_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(settings_bp)

    # --- Page routes (serve the vanilla JS frontend) ---
    @app.route("/")
    def index_page():
        return _render("index.html")

    @app.route("/login")
    def login_page():
        return _render("login.html")

    @app.route("/admin")
    def admin_page():
        return _render("admin.html")

    def _render(name):
        from flask import render_template
        return render_template(name)


    # --- Global error handlers ---
    @app.errorhandler(404)
    def not_found(e):
        return jsonify(success=False, message="Not found."), 404

    @app.errorhandler(413)
    def too_large(e):
        return jsonify(success=False, message="File is too large."), 413

    @app.errorhandler(500)
    def server_error(e):
        return jsonify(success=False, message="Internal server error."), 500

    return app


app = create_app()

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=5000, debug=debug)
