import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import bcrypt
import jwt

from app import db
from app.models import User


class AuthError(Exception):
    """Domain-specific authentication error."""


class AuthService:
    def __init__(self):
        self.algorithm = os.getenv("AUTH_JWT_ALGORITHM", "HS256")
        self.access_secret = (
            os.getenv("AUTH_ACCESS_SECRET")
            or os.getenv("AUTH_JWT_SECRET")
            or os.getenv("JWT_SECRET")
            or os.getenv("SECRET_KEY")
            or "dev-access-secret"
        )
        self.refresh_secret = (
            os.getenv("AUTH_REFRESH_SECRET")
            or os.getenv("AUTH_REFRESH_JWT_SECRET")
            or self.access_secret
        )
        self.access_ttl = int(os.getenv("AUTH_ACCESS_TTL_SECONDS", "900"))
        self.refresh_ttl = int(os.getenv("AUTH_REFRESH_TTL_SECONDS", "1209600"))

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------
    def signup(self, email: str, password: str, name: Optional[str] = None) -> Dict:
        email_normalized = self._normalize_email(email)
        if not email_normalized or not password:
            raise AuthError("Email and password are required")

        if User.query.filter_by(email=email_normalized).first():
            raise AuthError("Email already exists")

        user = User(
            email=email_normalized,
            name=name or email_normalized.split("@")[0],
            password_hash=self._hash_password(password),
        )
        db.session.add(user)
        db.session.commit()

        tokens = self._issue_tokens(user, rotate_refresh=True)
        return {"user": user.to_dict(), **tokens}

    def login(self, email: str, password: str) -> Dict:
        email_normalized = self._normalize_email(email)
        if not email_normalized or not password:
            raise AuthError("Email and password are required")

        user = User.query.filter_by(email=email_normalized).first()
        if not user or not user.password_hash:
            raise AuthError("Invalid credentials")

        if not self._verify_password(password, user.password_hash):
            raise AuthError("Invalid credentials")

        tokens = self._issue_tokens(user, rotate_refresh=True)
        return {"user": user.to_dict(), **tokens}

    def refresh_tokens(self, refresh_token: str) -> Dict:
        user = self._verify_token(refresh_token, expected_type="refresh")
        tokens = self._issue_tokens(user, rotate_refresh=True)
        return {"user": user.to_dict(), **tokens}

    def verify_access_token(self, token: str) -> User:
        return self._verify_token(token, expected_type="access")

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------
    def _normalize_email(self, email: Optional[str]) -> Optional[str]:
        if not email:
            return None
        return email.strip().lower()

    def _hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
        return hashed.decode("utf-8")

    def _verify_password(self, password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"), password_hash.encode("utf-8")
            )
        except ValueError:
            return False

    def _issue_tokens(self, user: User, rotate_refresh: bool = False) -> Dict[str, str]:
        if rotate_refresh:
            user.token_version = (user.token_version or 0) + 1
            db.session.commit()

        access_token = self._encode_token(
            user,
            token_type="access",
            ttl_seconds=self.access_ttl,
            secret=self.access_secret,
        )
        refresh_token = self._encode_token(
            user,
            token_type="refresh",
            ttl_seconds=self.refresh_ttl,
            secret=self.refresh_secret,
        )
        return {
            "access_token": access_token,
            "access_expires_in": self.access_ttl,
            "refresh_token": refresh_token,
            "refresh_expires_in": self.refresh_ttl,
        }

    def _encode_token(
        self, user: User, *, token_type: str, ttl_seconds: int, secret: str
    ) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user.id,
            "email": user.email,
            "type": token_type,
            "token_version": user.token_version,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        }
        return jwt.encode(payload, secret, algorithm=self.algorithm)

    def _verify_token(self, token: str, *, expected_type: str) -> User:
        if not token:
            raise AuthError("Token is required")

        secret = (
            self.access_secret if expected_type == "access" else self.refresh_secret
        )
        try:
            payload = jwt.decode(token, secret, algorithms=[self.algorithm])
        except jwt.ExpiredSignatureError as exc:
            raise AuthError("Token expired") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthError("Invalid token") from exc

        if payload.get("type") != expected_type:
            raise AuthError("Invalid token type")

        user_id = payload.get("sub")
        user = db.session.get(User, user_id)
        if not user:
            raise AuthError("User not found")

        token_version = payload.get("token_version")
        if token_version != user.token_version:
            raise AuthError("Token has been rotated")

        return user
