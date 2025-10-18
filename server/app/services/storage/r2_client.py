"""
Cloudflare R2 storage client for file operations.
"""

import os
import boto3
from typing import BinaryIO, Optional
from botocore.exceptions import ClientError


class R2Client:
    """Client for interacting with Cloudflare R2 storage."""

    def __init__(self):
        """Initialize R2 client with credentials from environment."""
        self.access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET_NAME")
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL")
        self.public_url = os.getenv("R2_PUBLIC_URL")

        self.client = None
        if all([self.access_key, self.secret_key, self.bucket_name, self.endpoint_url]):
            self.client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
            )

    def upload_file(self, file: BinaryIO, key: str) -> bool:
        """
        Upload file to R2 storage.

        Args:
            file (BinaryIO): File object to upload
            key (str): Object key/path in bucket

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.client:
            print("R2 client not initialized - check environment variables")
            return False

        try:
            self.client.upload_fileobj(file, self.bucket_name, key)
            return True
        except ClientError as e:
            print(f"Error uploading file to R2: {e}")
            return False

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
            if self.public_url:
                return f"{self.public_url}/{key}"
            else:
                return f"{self.endpoint_url}/{self.bucket_name}/{key}"
        except Exception as e:
            print(f"Error generating file URL: {e}")
            return None

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
