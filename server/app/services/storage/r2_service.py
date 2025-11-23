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
            if self.public_url:
                return f"{self.public_url.rstrip('/')}/{key}"
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
