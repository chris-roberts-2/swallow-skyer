"""
Supabase client for metadata operations.
"""

import os
from typing import Dict, Any, Optional, List, Tuple
from supabase import create_client, Client


class SupabaseClient:
    """Client for interacting with Supabase for metadata operations."""

    def __init__(self):
        """Initialize Supabase client with credentials from environment."""
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv(
            "SUPABASE_SERVICE_KEY"
        )
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

    def get_photos(
        self,
        limit: Optional[int] = 50,
        offset: Optional[int] = 0,
        since: Optional[str] = None,
        bbox: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get photos with filtering and pagination.

        Args:
            limit (Optional[int]): Maximum number of photos to return
            offset (Optional[int]): Number of photos to skip
            since (Optional[str]): ISO timestamp - filter photos taken after this date
            bbox (Optional[str]): Bounding box "lat_min,lng_min,lat_max,lng_max"
            user_id (Optional[str]): Filter by user ID

        Returns:
            Dict[str, Any]: Dict with 'data' (photos list) and 'count' (total)
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return {"data": [], "count": 0}

        try:
            # Start query
            query = self.client.table("photos").select("*", count="exact")

            # Apply user filter
            if user_id:
                query = query.eq("user_id", user_id)

            # Apply timestamp filter (use uploaded_at from current schema)
            if since:
                query = query.gte("uploaded_at", since)

            # Apply bounding box filter
            if bbox:
                coords = bbox.split(",")
                if len(coords) == 4:
                    lat_min, lng_min, lat_max, lng_max = map(float, coords)
                    query = (
                        query.gte("latitude", lat_min)
                        .lte("latitude", lat_max)
                        .gte("longitude", lng_min)
                        .lte("longitude", lng_max)
                    )

            # Apply ordering (newest first) using uploaded_at
            query = query.order("uploaded_at", desc=True)

            # Apply pagination
            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            response = query.execute()

            return {
                "data": response.data if response.data else [],
                "count": response.count if hasattr(response, "count") else 0,
            }
        except Exception as e:
            print(f"Error getting photos: {e}")
            return {"data": [], "count": 0}

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

    # ------------------------------------------------------------------
    # Project helpers
    # ------------------------------------------------------------------

    def create_project(
        self, name: str, owner_id: str, description: Optional[str] = None
    ):
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        payload = {
            "name": name,
            "owner_id": owner_id,
        }
        if description is not None:
            payload["description"] = description
        response = self.client.table("projects").insert(payload).execute()
        if not response.data:
            raise RuntimeError("Failed to create project")
        project = response.data[0]
        if description is not None:
            project["description"] = description
        return project

    def add_project_member(self, project_id: str, user_id: str, role: str):
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        payload = {
            "project_id": project_id,
            "user_id": user_id,
            "role": role,
        }
        response = self.client.table("project_members").insert(payload).execute()
        return response.data[0] if response.data else None

    def list_projects_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        membership_response = (
            self.client.table("project_members")
            .select("project_id, role")
            .eq("user_id", user_id)
            .execute()
        )
        membership = membership_response.data or []
        project_ids = [row["project_id"] for row in membership]
        if not project_ids:
            return []
        response = (
            self.client.table("projects").select("*").in_("id", project_ids).execute()
        )
        projects = response.data or []
        role_map = {row["project_id"]: row["role"] for row in membership}
        for project in projects:
            project["role"] = role_map.get(project["id"])
        return projects

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = (
            self.client.table("projects").select("*").eq("id", project_id).execute()
        )
        return response.data[0] if response.data else None

    def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        fields = {}
        if name is not None:
            fields["name"] = name
        if description is not None:
            fields["description"] = description
        if not fields:
            return self.get_project(project_id)
        response = (
            self.client.table("projects").update(fields).eq("id", project_id).execute()
        )
        return response.data[0] if response.data else None

    def delete_project(self, project_id: str) -> bool:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = self.client.table("projects").delete().eq("id", project_id).execute()
        return bool(response.data)

    def get_project_role(self, project_id: str, user_id: str) -> Optional[str]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = (
            self.client.table("project_members")
            .select("role")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .execute()
        )
        if response.data:
            return response.data[0].get("role")
        return None

    def list_project_members(self, project_id: str) -> List[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = (
            self.client.table("project_members")
            .select("*")
            .eq("project_id", project_id)
            .execute()
        )
        return response.data or []

    def update_project_member_role(
        self, project_id: str, user_id: str, role: str
    ) -> Optional[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = (
            self.client.table("project_members")
            .update({"role": role})
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data[0] if response.data else None

    def remove_project_member(self, project_id: str, user_id: str) -> bool:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = (
            self.client.table("project_members")
            .delete()
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .execute()
        )
        return bool(response.data)

    def count_owners(self, project_id: str) -> int:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        response = (
            self.client.table("project_members")
            .select("id", count="exact")
            .eq("project_id", project_id)
            .in_("role", ["owner", "co-owner"])
            .execute()
        )
        return getattr(response, "count", 0) or 0

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
