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
        self.access_key = os.getenv('R2_ACCESS_KEY_ID')
        self.secret_key = os.getenv('R2_SECRET_ACCESS_KEY')
        self.bucket_name = os.getenv('R2_BUCKET_NAME')
        self.endpoint_url = os.getenv('R2_ENDPOINT_URL')
        
        self.client = None
        if all([self.access_key, self.secret_key, self.bucket_name, self.endpoint_url]):
            self.client = boto3.client(
                's3',
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key
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
