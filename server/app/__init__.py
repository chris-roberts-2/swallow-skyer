"""
Flask application factory for Swallow Skyer backend.
"""

import os
from urllib.parse import urlparse
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from app.env_loader import load_app_environment

# Load environment variables early (module import time) so config is available
# regardless of how the server is started (flask run, python app.py, etc).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_app_environment()

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

    app_env = (os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "development").strip().lower()
    is_production = app_env == "production"

    # Configuration
    secret_key = (os.environ.get("SECRET_KEY") or "").strip()
    if is_production and not secret_key:
        raise RuntimeError("SECRET_KEY is required in production")
    app.config["SECRET_KEY"] = secret_key or "dev-secret-key-change-in-production"

    # Database configuration
    # - Prefer DATABASE_URL when set (Postgres/Supabase in production)
    # - Default to a local SQLite file for local development
    env_db_url = os.environ.get("DATABASE_URL", "").strip()
    if env_db_url.startswith("postgres://"):
        # Normalize deprecated scheme so SQLAlchemy can parse it.
        env_db_url = env_db_url.replace("postgres://", "postgresql://", 1)

    def sqlite_fallback_url() -> str:
        instance_dir = os.path.join(BASE_DIR, "instance")
        os.makedirs(instance_dir, exist_ok=True)
        db_path = os.path.join(instance_dir, "database.db")
        # When db_path is absolute, sqlite URL needs 4 slashes.
        return f"sqlite:///{db_path}"

    def normalize_sqlite_url(sqlite_url: str) -> str:
        """
        Normalize sqlite URLs so they are absolute and the directory exists.

        SQLAlchemy's sqlite relative paths depend on CWD (easy to break when running
        from repo root vs server/). We anchor relative sqlite paths under server/.
        """
        prefix = "sqlite:///"
        if not sqlite_url.startswith(prefix):
            return sqlite_url

        path_part = sqlite_url[len(prefix) :]  # may be absolute (starts with /) or relative
        if not path_part:
            return sqlite_fallback_url()

        if path_part.startswith("/"):
            db_path = path_part
        else:
            db_path = os.path.join(BASE_DIR, path_part)

        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        return f"{prefix}{db_path}"

    if is_production:
        if not env_db_url:
            raise RuntimeError("DATABASE_URL is required in production (Postgres)")
        if env_db_url.startswith("sqlite"):
            raise RuntimeError("SQLite DATABASE_URL is not allowed in production")
    else:
        if not env_db_url:
            env_db_url = sqlite_fallback_url()
        elif env_db_url.startswith("sqlite:///"):
            env_db_url = normalize_sqlite_url(env_db_url)

    app.config["SQLALCHEMY_DATABASE_URI"] = env_db_url
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
        raw = [o.strip() for o in env_origins.split(",") if o.strip()]
        # Ensure we store origins (scheme://host[:port]) rather than full URLs with paths.
        origin_list = []
        for item in raw:
            try:
                parsed = urlparse(item)
                if parsed.scheme and parsed.netloc:
                    origin_list.append(f"{parsed.scheme}://{parsed.netloc}")
                else:
                    origin_list.append(item)
            except Exception:
                origin_list.append(item)
    else:
        origin_list = default_origins
    CORS(
        app,
        resources={r"/*": {"origins": origin_list}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # Import models to ensure they are registered
    from app import models

    # Create database tables (only for the operational DB used by the API server).
    # We intentionally do NOT auto-migrate/alter tables in production.
    with app.app_context():
        db.create_all()
        if not is_production and env_db_url.startswith("sqlite"):
            # Best-effort migration for older local SQLite files: add missing columns
            try:
                from sqlalchemy import text

                def ensure_columns(table_name: str, column_statements: dict[str, str]):
                    result = db.session.execute(
                        text(f"PRAGMA table_info({table_name})")
                    ).fetchall()
                    existing_cols = {row[1] for row in result}
                    statements = [
                        ddl
                        for column, ddl in column_statements.items()
                        if column not in existing_cols
                    ]
                    for stmt in statements:
                        try:
                            db.session.execute(text(stmt))
                        except Exception:
                            pass
                    if statements:
                        db.session.commit()

                ensure_columns(
                    "photos",
                    {
                        "url": "ALTER TABLE photos ADD COLUMN url TEXT",
                        "r2_key": "ALTER TABLE photos ADD COLUMN r2_key TEXT",
                        "thumbnail_path": "ALTER TABLE photos ADD COLUMN thumbnail_path TEXT",
                        "original_filename": "ALTER TABLE photos ADD COLUMN original_filename TEXT",
                        "altitude": "ALTER TABLE photos ADD COLUMN altitude REAL",
                        "taken_at": "ALTER TABLE photos ADD COLUMN taken_at DATETIME",
                        "updated_at": "ALTER TABLE photos ADD COLUMN updated_at DATETIME",
                    },
                )

                ensure_columns(
                    "users",
                    {
                        "password_hash": "ALTER TABLE users ADD COLUMN password_hash TEXT",
                        "token_version": "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0",
                    },
                )
            except Exception:
                # Non-fatal in local dev.
                pass

    # Register blueprints
    from app.routes import main_bp
    from app.routes.projects import projects_bp
    from app.routes.project_members import project_members_bp
    from app.api_routes.auth import bp as auth_bp
    from app.api_routes.v1.photos import bp as photos_v1_bp
    from app.api_routes.files import bp as files_bp
    from app.api_routes.public_links import bp as public_links_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(project_members_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(photos_v1_bp, url_prefix="/api/v1/photos")
    app.register_blueprint(files_bp)
    app.register_blueprint(public_links_bp)

    @app.route("/api/test/connection", methods=["GET"])
    def test_connection():
        return {
            "status": "success",
            "message": "Backend connected",
            "platform": "v1",
            "exif_mode": "canonical_gps_only",
            "db": app.config["SQLALCHEMY_DATABASE_URI"],
        }

    return app
