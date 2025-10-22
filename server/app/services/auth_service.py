from app import db
from app.models import User
import hashlib
import secrets


class AuthService:
    def authenticate_user(self, username, password):
        """Authenticate user with username and password"""
        try:
            user = User.query.filter_by(username=username).first()

            if not user:
                return {"success": False, "error": "User not found"}

            if not user.is_active:
                return {"success": False, "error": "Account is disabled"}

            # In a real implementation, you would hash and compare passwords
            # For now, we'll use a simple check
            if self.verify_password(password, user.password_hash):
                token = self.generate_token()
                return {"success": True, "user": user.to_dict(), "token": token}
            else:
                return {"success": False, "error": "Invalid password"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def register_user(self, username, email, password):
        """Register a new user"""
        try:
            # Check if user already exists
            if User.query.filter_by(username=username).first():
                return {"success": False, "error": "Username already exists"}

            if User.query.filter_by(email=email).first():
                return {"success": False, "error": "Email already exists"}

            # Create new user
            user = User(
                username=username,
                email=email,
                password_hash=self.hash_password(password),
            )

            db.session.add(user)
            db.session.commit()

            return {"success": True, "user": user.to_dict()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def hash_password(self, password):
        """Hash password for storage"""
        # In a real implementation, use bcrypt or similar
        return hashlib.sha256(password.encode()).hexdigest()

    def verify_password(self, password, password_hash):
        """Verify password against hash"""
        return self.hash_password(password) == password_hash

    def generate_token(self):
        """Generate authentication token"""
        return secrets.token_urlsafe(32)
