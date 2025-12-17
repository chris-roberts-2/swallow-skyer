"""
Cloudflare R2 storage client for file operations.
"""

import os
import io
import boto3
from typing import BinaryIO, Optional
from botocore.exceptions import ClientError


class R2Client:
    """Client for interacting with Cloudflare R2 storage."""

    def __init__(self):
        """Initialize R2 client with credentials from environment."""
        self.access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET") or os.getenv("R2_BUCKET_NAME")
        # Prefer explicit endpoint overrides before deriving from account ID
        self.account_id = os.getenv("R2_ACCOUNT_ID")
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL")
        if not self.endpoint_url and self.account_id:
            self.endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"
        raw_public_url = os.getenv("R2_PUBLIC_BASE_URL") or os.getenv("R2_PUBLIC_URL")
        self.public_url = raw_public_url.rstrip("/") if raw_public_url else None

        self.client = None
        if all([self.access_key, self.secret_key, self.bucket_name, self.endpoint_url]):
            self.client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                region_name="auto",
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
            )

    def _public_base_with_bucket(self) -> Optional[str]:
        """
        Return a public base URL that includes the bucket path when required.

        Cloudflare's public endpoints (pub-*.r2.dev or *.r2.cloudflarestorage.com)
        expect the bucket name as a path segment. If the configured public base
        points at those domains and the bucket segment is missing, append it so
        generated URLs resolve correctly.
        """
        if not self.public_url:
            return None

        base = self.public_url.rstrip("/")
        if not self.bucket_name:
            return base

        normalized = base.lower()
        bucket_segment = f"/{self.bucket_name.lower()}"
        if (
            ("r2.dev" in normalized or "r2.cloudflarestorage.com" in normalized)
            and bucket_segment not in normalized
        ):
            return f"{base}/{self.bucket_name}"
        return base

    def upload_file(
        self, file: BinaryIO, key: str, content_type: Optional[str] = None
    ) -> bool:
        """
        Upload file to R2 storage using the provided fully-qualified object key.

        Args:
            file (BinaryIO): File object to upload
            key (str): Object key/path in bucket
            content_type (Optional[str]): MIME type for the object

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return False

        try:
            extra_args = {"ContentType": content_type} if content_type else None
            upload_kwargs = {"ExtraArgs": extra_args} if extra_args else {}
            self.client.upload_fileobj(file, self.bucket_name, key, **upload_kwargs)
            return True
        except ClientError as e:
            print(f"Error uploading file to R2: {e}")
            return False

    def upload_bytes(
        self, data: bytes, key: str, content_type: Optional[str] = None
    ) -> bool:
        """
        Convenience helper to upload raw bytes without requiring callers to manage streams.
        """
        buffer = io.BytesIO(data)
        buffer.seek(0)
        return self.upload_file(buffer, key, content_type)

    def get_file_url(self, key: str) -> Optional[str]:
        """
        Get public URL for file in R2 storage.

        Args:
            key (str): Object key/path in bucket

        Returns:
            Optional[str]: Public URL or None if error
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return None

        try:
            public_base = self._public_base_with_bucket()
            if public_base:
                return f"{public_base}/{key}"
            return f"{self.endpoint_url}/{self.bucket_name}/{key}"
        except Exception as e:
            print(f"Error generating file URL: {e}")
            return None

    def resolve_url(
        self, key: str, require_signed: bool = False, expires_in: int = 600
    ) -> Optional[str]:
        """
        Resolve a usable URL for the given key, optionally forcing a signed URL.

        Args:
            key (str): Object key/path.
            require_signed (bool): Force presigned URLs even if public base exists.
            expires_in (int): Lifespan for signed URLs.
        """
        if not key:
            return None

        if not self.client:
            print("R2 client not initialized - check environment variables")
            return None

        if require_signed:
            return self.generate_presigned_url(key, expires_in=expires_in)

        # Prefer configured public base, fall back to signed URLs.
        url = self.get_file_url(key)
        if url:
            return url
        return self.generate_presigned_url(key, expires_in=expires_in)

    def upload_project_photo(
        self,
        project_id: str,
        photo_id: str,
        file_bytes: bytes,
        ext: str,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload a project-scoped photo and return the object key if successful.
        """
        cleaned_ext = ext.lstrip(".")
        key = f"projects/{project_id}/photos/{photo_id}.{cleaned_ext}"
        ok = self.upload_bytes(file_bytes, key, content_type=content_type)
        return key if ok else None

    def generate_presigned_url(self, key: str, expires_in: int = 600) -> Optional[str]:
        """
        Generate presigned URL for private R2 object.

        Args:
            key (str): Object key/path in bucket
            expires_in (int): URL expiration time in seconds (default 600 = 10 minutes)

        Returns:
            Optional[str]: Presigned URL or None if error
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return None

        try:
            url = self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            print(f"Error generating presigned URL: {e}")
            return None

    def get_public_url(self, key: str) -> Optional[str]:
        """
        Get public URL for R2 object (alias for get_file_url for clarity).

        Args:
            key (str): Object key/path in bucket

        Returns:
            Optional[str]: Public URL or None if error
        """
        return self.get_file_url(key)

    def delete_file(self, key: str) -> bool:
        """
        Delete file from R2 storage.

        Args:
            key (str): Object key/path in bucket

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return False

        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            print(f"Error deleting file from R2: {e}")
            return False

    def file_exists(self, key: str) -> bool:
        """
        Check if file exists in R2 storage.

        Args:
            key (str): Object key/path in bucket

        Returns:
            bool: True if file exists, False otherwise
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return False

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError:
            return False

    def get_file_size(self, key: str) -> Optional[int]:
        """
        Get file size from R2 storage.

        Args:
            key (str): Object key/path in bucket

        Returns:
            Optional[int]: File size in bytes or None if error
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return None

        try:
            response = self.client.head_object(Bucket=self.bucket_name, Key=key)
            return response.get("ContentLength")
        except ClientError as e:
            print(f"Error getting file size: {e}")
            return None


# Global instance
r2_client = R2Client()
