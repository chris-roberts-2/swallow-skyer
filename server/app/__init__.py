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
            # Non-fatal: if inspection fails, we leave DB as-is; uploads may error until DB is reset
            pass

    # Register blueprints
    from app.routes import main_bp
    from app.routes.projects import projects_bp
    from app.routes.project_members import project_members_bp
    from app.api_routes.auth import bp as auth_bp
    from app.api_routes.v1.photos import bp as photos_v1_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(project_members_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(photos_v1_bp, url_prefix="/api/v1/photos")

    @app.route("/api/test/connection", methods=["GET"])
    def test_connection():
        return {"status": "success", "message": "Backend connected"}

    return app
