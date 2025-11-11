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
    # Database configuration
    # Always resolve SQLite paths to an absolute path under server/instance/
    instance_dir = os.path.join(BASE_DIR, "instance")
    os.makedirs(instance_dir, exist_ok=True)
    abs_db_path = os.path.join(instance_dir, "database.db")

    env_db_url = os.environ.get("DATABASE_URL", "").strip()
    if env_db_url.startswith("sqlite:///"):
        # Normalize relative SQLite URLs to absolute
        # sqlite:////absolute/path uses 4 slashes; 3 slashes is relative to CWD
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{abs_db_path}"
    elif env_db_url:
        app.config["SQLALCHEMY_DATABASE_URI"] = env_db_url
    else:
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{abs_db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Initialize extensions with app
    db.init_app(app)
    # Support multiple local dev ports by default; override with FRONTEND_ORIGIN env var
    default_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    env_origins = os.environ.get("FRONTEND_ORIGIN")
    if env_origins:
        origin_list = [o.strip() for o in env_origins.split(",") if o.strip()]
    else:
        origin_list = default_origins
    CORS(
        app,
        resources={r"/*": {"origins": origin_list}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )

    # Import models to ensure they are registered
    from app import models

    # Create database tables
    with app.app_context():
        db.create_all()
        # Best-effort migration for older local SQLite files: add missing columns
        try:
            from sqlalchemy import text
            # Inspect existing columns on SQLite
            result = db.session.execute(text("PRAGMA table_info(photos)")).fetchall()
            existing_cols = {row[1] for row in result}  # second field is column name
            alter_statements = []
            # Columns introduced after initial prototypes that some dev DBs may miss
            if "url" not in existing_cols:
                alter_statements.append("ALTER TABLE photos ADD COLUMN url TEXT")
            if "r2_key" not in existing_cols:
                alter_statements.append("ALTER TABLE photos ADD COLUMN r2_key TEXT")
            if "thumbnail_path" not in existing_cols:
                alter_statements.append(
                    "ALTER TABLE photos ADD COLUMN thumbnail_path TEXT"
                )
            if "original_filename" not in existing_cols:
                alter_statements.append(
                    "ALTER TABLE photos ADD COLUMN original_filename TEXT"
                )
            if "altitude" not in existing_cols:
                alter_statements.append(
                    "ALTER TABLE photos ADD COLUMN altitude REAL"
                )
            if "taken_at" not in existing_cols:
                alter_statements.append(
                    "ALTER TABLE photos ADD COLUMN taken_at DATETIME"
                )
            if "updated_at" not in existing_cols:
                alter_statements.append(
                    "ALTER TABLE photos ADD COLUMN updated_at DATETIME"
                )
            for stmt in alter_statements:
                try:
                    db.session.execute(text(stmt))
                except Exception:
                    # Ignore if the migration concurrently ran or SQLite limitation
                    pass
            if alter_statements:
                db.session.commit()
        except Exception:
            # Non-fatal: if inspection fails, we leave DB as-is; uploads may error until DB is reset
            pass

    # Register blueprints
    from app.routes import main_bp
    from app.api_routes.v1.photos import bp as photos_v1_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(photos_v1_bp, url_prefix="/api/v1/photos")

    @app.route("/api/test/connection", methods=["GET"])
    def test_connection():
        return {"status": "success", "message": "Backend connected"}

    return app
