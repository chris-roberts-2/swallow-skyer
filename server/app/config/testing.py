import os
import tempfile

class Config:
    SECRET_KEY = 'test-secret-key'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = tempfile.mkdtemp()
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB max file size
    CORS_ORIGINS = ['http://localhost:3000']
    TESTING = True
