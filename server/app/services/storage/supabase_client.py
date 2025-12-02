"""
Supabase client for metadata operations.
"""

import os
from copy import deepcopy
from typing import Dict, Any, Optional, List, Tuple, Sequence
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
        self._thumbnail_columns_supported: Optional[bool] = None

    def update_thumbnail_column_hint(self, record: Optional[Dict[str, Any]]) -> None:
        """Infer thumbnail column support from a returned record."""
        if not record:
            return
        if "thumbnail_r2_path" in record or "thumbnail_r2_url" in record:
            self._thumbnail_columns_supported = True

    def supports_thumbnail_columns(self) -> bool:
        """Determine whether photos table has thumbnail columns."""
        if self._thumbnail_columns_supported is not None:
            return self._thumbnail_columns_supported
        if not self.client:
            self._thumbnail_columns_supported = False
            return False
        try:
            self.client.table("photos").select("thumbnail_r2_path").limit(1).execute()
            self._thumbnail_columns_supported = True
        except Exception:
            self._thumbnail_columns_supported = False
        return self._thumbnail_columns_supported

    def extract_thumbnail_fields(
        self, record: Dict[str, Any]
    ) -> Tuple[Optional[str], Optional[str]]:
        """Return (thumbnail_path, thumbnail_url) from either dedicated columns or metadata."""
        path = record.get("thumbnail_r2_path")
        url = record.get("thumbnail_r2_url")
        metadata = record.get("metadata")

        if (not path or not url) and isinstance(metadata, dict):
            thumbnails = metadata.get("thumbnails") or {}
            default_thumb = thumbnails.get("default") or {}
            path = path or default_thumb.get("r2_path")
            url = url or default_thumb.get("r2_url")

        return path, url

    def build_thumbnail_updates(
        self,
        thumbnail_path: str,
        thumbnail_url: str,
        record_hint: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Produce update payload for thumbnail fields, falling back to metadata JSON."""
        if record_hint:
            self.update_thumbnail_column_hint(record_hint)

        if self.supports_thumbnail_columns():
            return {
                "thumbnail_r2_path": thumbnail_path,
                "thumbnail_r2_url": thumbnail_url,
            }

        metadata = {}
        if record_hint and isinstance(record_hint.get("metadata"), dict):
            metadata = deepcopy(record_hint["metadata"])

        thumbnails = dict(metadata.get("thumbnails") or {})
        thumbnails["default"] = {
            "r2_path": thumbnail_path,
            "r2_url": thumbnail_url,
        }
        metadata["thumbnails"] = thumbnails
        return {"metadata": metadata}

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
            record = response.data[0] if response.data else None
            if record:
                self.update_thumbnail_column_hint(record)
            return record
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
            record = response.data[0] if response.data else None
            if record:
                self.update_thumbnail_column_hint(record)
            return record
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

    def list_project_ids_for_user(self, user_id: str) -> List[str]:
        """Return a flat list of project ids the user can access."""
        projects = self.list_projects_for_user(user_id)
        return [p.get("id") for p in projects if p.get("id")]

    def fetch_project_photos(
        self,
        project_ids: Sequence[str],
        page: int = 1,
        page_size: int = 50,
        user_id: Optional[str] = None,
        date_range: Optional[Tuple[Optional[str], Optional[str]]] = None,
        order_desc: bool = True,
        include_signed_urls: bool = False,
        signed_url_ttl: int = 600,
    ) -> Dict[str, Any]:
        """
        Fetch paginated photos scoped to one or more project_ids.

        Args:
            project_ids (Sequence[str]): Authorized project ids.
            page (int): 1-indexed page number.
            page_size (int): Page size.
            user_id (Optional[str]): Optional filter for photo owner.
            date_range (Optional[Tuple[str,str]]): Inclusive ISO timestamps (start, end).
            order_desc (bool): If True sort created_at DESC.
            include_signed_urls (bool): Generate signed URLs when r2_url missing.
            signed_url_ttl (int): Expiration for signed URLs.
        """
        if not project_ids:
            return {"data": [], "count": 0}
        if not self.client:
            raise RuntimeError("Supabase client not initialized")

        safe_page = max(1, page or 1)
        safe_page_size = max(1, min(page_size or 50, 200))
        offset = (safe_page - 1) * safe_page_size

        include_thumbnail_columns = self.supports_thumbnail_columns()
        column_list = [
            "id",
            "project_id",
            "user_id",
            "caption",
            "file_name",
            "latitude",
            "longitude",
            "created_at",
            "captured_at",
            "r2_path",
            "r2_key",
            "r2_url",
        ]
        if include_thumbnail_columns:
            column_list.extend(["thumbnail_r2_path", "thumbnail_r2_url"])
        else:
            column_list.append("metadata")

        query = self.client.table("photos").select(",".join(column_list), count="exact")
        query = query.in_("project_id", list(project_ids))

        if user_id:
            query = query.eq("user_id", user_id)

        if date_range:
            start, end = date_range
            if start:
                query = query.gte("created_at", start)
            if end:
                query = query.lte("created_at", end)

        query = query.order("created_at", desc=order_desc).limit(safe_page_size).offset(
            offset
        )

        response = query.execute()
        records = response.data or []

        if include_signed_urls:
            from .r2_client import r2_client

            for record in records:
                path = record.get("r2_path") or record.get("r2_key")
                url_val = (record.get("r2_url") or record.get("url") or "").strip()
                if not url_val and path:
                    resolved = r2_client.resolve_url(
                        path, require_signed=True, expires_in=signed_url_ttl
                    )
                    if resolved:
                        record["r2_url"] = resolved

                thumb_path, thumb_url = self.extract_thumbnail_fields(record)
                if thumb_path and not (thumb_url or "").strip():
                    resolved_thumb = r2_client.resolve_url(
                        thumb_path, require_signed=True, expires_in=signed_url_ttl
                    )
                    if resolved_thumb:
                        if self.supports_thumbnail_columns():
                            record["thumbnail_r2_url"] = resolved_thumb
                        else:
                            metadata = record.get("metadata") or {}
                            thumbnails = metadata.get("thumbnails") or {}
                            default_thumb = thumbnails.get("default") or {}
                            default_thumb["r2_url"] = resolved_thumb
                            thumbnails["default"] = default_thumb
                            metadata["thumbnails"] = thumbnails
                            record["metadata"] = metadata

        return {
            "data": records,
            "count": getattr(response, "count", None) or len(records),
        }

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
