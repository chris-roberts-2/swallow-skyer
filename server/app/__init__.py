"""
Flask application factory for Swallow Skyer backend.
"""

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'instance', 'database.db')
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        os.environ.get("DATABASE_URL") or f"sqlite:///{db_path}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Initialize extensions with app
    db.init_app(app)
    CORS(app)  # Enable CORS for all routes

    # Import models to ensure they are registered
    from app import models

    # Create database tables
    with app.app_context():
        db.create_all()

    # Register blueprints
    from app.routes import main_bp

    app.register_blueprint(main_bp)

    return app
