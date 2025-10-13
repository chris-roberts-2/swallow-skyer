"""
Supabase client for metadata operations.
"""

import os
from typing import Dict, Any, Optional, List
from supabase import create_client, Client


class SupabaseClient:
    """Client for interacting with Supabase for metadata operations."""

    def __init__(self):
        """Initialize Supabase client with credentials from environment."""
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_SERVICE_KEY")
        self.client: Optional[Client] = None

        if self.url and self.key:
            self.client = create_client(self.url, self.key)

    def store_photo_metadata(
        self, photo_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Store photo metadata in Supabase.

        Args:
            photo_data (Dict[str, Any]): Photo metadata to store

        Returns:
            Optional[Dict[str, Any]]: Stored metadata or None if error
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return None

        try:
            response = self.client.table("photos").insert(photo_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error storing photo metadata: {e}")
            return None

    def get_photo_metadata(self, photo_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve photo metadata from Supabase.

        Args:
            photo_id (str): Photo ID to retrieve

        Returns:
            Optional[Dict[str, Any]]: Photo metadata or None if error
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return None

        try:
            response = (
                self.client.table("photos").select("*").eq("id", photo_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error retrieving photo metadata: {e}")
            return None

    def update_photo_metadata(
        self, photo_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update photo metadata in Supabase.

        Args:
            photo_id (str): Photo ID to update
            updates (Dict[str, Any]): Fields to update

        Returns:
            Optional[Dict[str, Any]]: Updated metadata or None if error
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return None

        try:
            response = (
                self.client.table("photos").update(updates).eq("id", photo_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error updating photo metadata: {e}")
            return None

    def delete_photo_metadata(self, photo_id: str) -> bool:
        """
        Delete photo metadata from Supabase.

        Args:
            photo_id (str): Photo ID to delete

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return False

        try:
            self.client.table("photos").delete().eq("id", photo_id).execute()
            return True
        except Exception as e:
            print(f"Error deleting photo metadata: {e}")
            return False

    def get_photos_by_location(
        self, latitude: float, longitude: float, radius: float = 0.01
    ) -> List[Dict[str, Any]]:
        """
        Get photos within a radius of a location.

        Args:
            latitude (float): Center latitude
            longitude (float): Center longitude
            radius (float): Search radius in degrees

        Returns:
            List[Dict[str, Any]]: List of photos within radius
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return []

        try:
            response = (
                self.client.table("photos")
                .select("*")
                .gte("latitude", latitude - radius)
                .lte("latitude", latitude + radius)
                .gte("longitude", longitude - radius)
                .lte("longitude", longitude + radius)
                .execute()
            )
            return response.data if response.data else []
        except Exception as e:
            print(f"Error getting photos by location: {e}")
            return []

    def store_user_metadata(
        self, user_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Store user metadata in Supabase.

        Args:
            user_data (Dict[str, Any]): User data to store

        Returns:
            Optional[Dict[str, Any]]: Stored user data or None if error
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return None

        try:
            response = self.client.table("users").insert(user_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error storing user metadata: {e}")
            return None

    def get_user_metadata(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve user metadata from Supabase.

        Args:
            user_id (str): User ID to retrieve

        Returns:
            Optional[Dict[str, Any]]: User metadata or None if error
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return None

        try:
            response = (
                self.client.table("users").select("*").eq("id", user_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error retrieving user metadata: {e}")
            return None


# Global instance
supabase_client = SupabaseClient()
