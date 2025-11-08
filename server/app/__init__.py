"""
Flask application factory for Swallow Skyer backend.
"""

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from server/.env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Ensure .env values override any inherited shell vars during dev
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

# Initialize extensions
db = SQLAlchemy()


def create_app(config_name=None):
    """
    Application factory pattern.

    Args:
        config_name (str): Configuration name ('development', 'production', 'testing')

    Returns:
        Flask: Configured Flask application instance
    """
    app = Flask(__name__)

    # Configuration
    app.config["SECRET_KEY"] = (
        os.environ.get("SECRET_KEY") or "dev-secret-key-change-in-production"
    )
    # Use absolute path for SQLite database
    db_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "instance", "database.db"
    )
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        os.environ.get("DATABASE_URL") or f"sqlite:///{db_path}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Initialize extensions with app
    db.init_app(app)
    # Support multiple local dev ports by default; override with FRONTEND_ORIGIN env var
    frontend_origin = os.environ.get(
        "FRONTEND_ORIGIN", "http://localhost:3000,http://localhost:3001"
    )
    # Allow comma-separated origins (e.g., http://localhost:3000,http://localhost:3001)
    origin_list = [o.strip() for o in frontend_origin.split(",") if o.strip()]
    CORS(app, resources={r"/*": {"origins": origin_list}})

    # Import models to ensure they are registered
    from app import models

    # Create database tables
    with app.app_context():
        db.create_all()

    # Register blueprints
    from app.routes import main_bp
    from app.api_routes.v1.photos import bp as photos_v1_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(photos_v1_bp, url_prefix="/api/v1/photos")

    @app.route("/api/test/connection", methods=["GET"])
    def test_connection():
        return {"status": "success", "message": "Backend connected"}

    return app
