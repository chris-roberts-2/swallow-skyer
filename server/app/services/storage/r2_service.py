"""
Cloudflare R2 storage service for file uploads.
"""

from typing import BinaryIO, Optional
import os
import boto3
from botocore.exceptions import ClientError


class R2StorageService:
    """Service for interacting with Cloudflare R2 for file storage."""

    def __init__(self):
        self.access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET") or os.getenv("R2_BUCKET_NAME")
        self.account_id = os.getenv("R2_ACCOUNT_ID")
        raw_public_url = os.getenv("R2_PUBLIC_BASE_URL") or os.getenv("R2_PUBLIC_URL")
        self.public_url = raw_public_url.rstrip("/") if raw_public_url else None
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL")
        if not self.endpoint_url and self.account_id:
            self.endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"

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
        Return the public base URL for constructing file URLs.

        Cloudflare's Public Development URLs (pub-*.r2.dev) have the bucket
        pre-bound and don't need the bucket name in the path. Only custom
        domains or certain S3-compatible endpoints might require the bucket
        as a path segment.
        """
        if not self.public_url:
            return None

        base = self.public_url.rstrip("/")
        
        # Public Development URLs (pub-*.r2.dev) have bucket pre-bound
        # Do NOT add bucket name to these URLs
        normalized = base.lower()
        if "pub-" in normalized and ".r2.dev" in normalized:
            return base
        
        # For custom domains or other configurations, check if bucket already included
        if not self.bucket_name:
            return base
            
        bucket_segment = f"/{self.bucket_name.lower()}"
        if bucket_segment not in normalized:
            # Only add bucket for non-pub-.r2.dev URLs that don't already have it
            return f"{base}/{self.bucket_name}"
        
        return base

    def upload_file(self, file: BinaryIO, key: str) -> bool:
        """Upload file to R2 storage."""
        try:
            self.client.upload_fileobj(file, self.bucket_name, key)
            return True
        except ClientError as e:
            print(f"Error uploading file: {e}")
            return False

    def get_file_url(self, key: str) -> Optional[str]:
        """Get public URL for file in R2 storage."""
        try:
            public_base = self._public_base_with_bucket()
            if public_base:
                return f"{public_base}/{key}"
            return f"{self.endpoint_url}/{self.bucket_name}/{key}"
        except Exception as e:
            print(f"Error generating file URL: {e}")
            return None

    def delete_file(self, key: str) -> bool:
        """Delete file from R2 storage."""
        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            print(f"Error deleting file: {e}")
            return False

    def file_exists(self, key: str) -> bool:
        """Check if file exists in R2 storage."""
        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError:
            return False
