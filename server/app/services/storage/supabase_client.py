"""
Supabase client for metadata operations.
"""

import os
import re
import time
import datetime
from copy import deepcopy
from typing import Dict, Any, Optional, List, Tuple, Sequence
from supabase import create_client, Client
from app.services.geocoding.reverse_geocoder import reverse_geocode


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
        self._location_geocode_columns: Optional[bool] = None

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
            raise RuntimeError("Supabase client not initialized - check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

        def _strip_unknown_column(payload: Dict[str, Any], exc: Exception) -> Optional[Dict[str, Any]]:
            """
            Supabase PostgREST error PGRST204 indicates an unknown column in schema cache.
            Example:
              {'message': "Could not find the 'original_filename' column of 'photos' in the schema cache",
               'code': 'PGRST204', ...}
            We parse the column name, drop it, and retry to stay compatible with older schemas.
            """
            text = str(exc)
            if "PGRST204" not in text or "Could not find the" not in text:
                return None
            match = re.search(r"Could not find the '([^']+)' column", text)
            if not match:
                return None
            column = match.group(1)
            if column not in payload:
                return None
            next_payload = dict(payload)
            next_payload.pop(column, None)
            return next_payload

        last_exc: Optional[Exception] = None
        payload = dict(photo_data)
        removed_columns = 0
        for attempt in range(3):
            try:
                response = self.client.table("photos").insert(payload).execute()
                record = response.data[0] if response.data else None
                if record:
                    self.update_thumbnail_column_hint(record)
                return record
            except OSError as e:
                last_exc = e
                # macOS Errno 35: Resource temporarily unavailable (transient)
                if getattr(e, "errno", None) == 35 and attempt < 2:
                    time.sleep(0.25 * (attempt + 1))
                    continue
                raise RuntimeError(f"Error storing photo metadata: {e}") from e
            except Exception as e:
                last_exc = e
                maybe_stripped = _strip_unknown_column(payload, e)
                if maybe_stripped is not None and removed_columns < 5:
                    payload = maybe_stripped
                    removed_columns += 1
                    # retry immediately without consuming more attempts
                    time.sleep(0.05)
                    continue
                raise RuntimeError(f"Error storing photo metadata: {e}") from e

        if last_exc:
            raise RuntimeError(f"Error storing photo metadata: {last_exc}") from last_exc
        raise RuntimeError("Error storing photo metadata: unknown failure")

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

    def get_or_create_location(
        self, latitude: float, longitude: float, elevation: Optional[float] = None
    ) -> Optional[str]:
        """
        Fetch an existing location by lat/lon or create a new one.
        Exact match is sufficient for current use.
        """
        if not self.client:
            print("Supabase client not initialized - check environment variables")
            return None
        try:
            query = (
                self.client.table("locations")
                .select("id")
                .eq("latitude", latitude)
                .eq("longitude", longitude)
                .limit(1)
            )
            existing = query.execute()
            if existing.data:
                return existing.data[0].get("id")
        except Exception as e:
            print(f"Error querying location: {e}")

        try:
            payload = {"latitude": latitude, "longitude": longitude}
            if elevation is not None:
                payload["elevation"] = elevation
            inserted = self.client.table("locations").insert(payload).execute()
            if inserted.data:
                loc_id = inserted.data[0].get("id")
                # Enrich with reverse geocode; failures are non-fatal
                geocode = reverse_geocode(latitude, longitude) or {}
                if geocode:
                    update_fields = self._build_location_geocode_fields(geocode)
                    if update_fields:
                        try:
                            self.client.table("locations").update(update_fields).eq(
                                "id", loc_id
                            ).execute()
                        except Exception as e:
                            print(f"Error updating location geocode: {e}")
                return loc_id
        except Exception as e:
            print(f"Error creating location: {e}")
        return None

    def _build_location_geocode_fields(self, geocode: Dict[str, Any]) -> Dict[str, Any]:
        if self._location_geocode_columns is None:
            self._location_geocode_columns = self._detect_location_geocode_columns()
        if self._location_geocode_columns:
            return {
                "city": geocode.get("city"),
                "state": geocode.get("state"),
                "country": geocode.get("country"),
            }

        # Fallback to JSON column
        return {"geocode_data": geocode}

    def _detect_location_geocode_columns(self) -> bool:
        if not self.client:
            return False
        try:
            self.client.table("locations").select("city,state,country").limit(1).execute()
            return True
        except Exception:
            return False

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
            raise RuntimeError("Supabase client not initialized - check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

        # Retry logic with column dropping on PGRST204
        payload = dict(updates)
        max_retries = 3
        last_exc: Optional[Exception] = None
        for _ in range(max_retries):
            try:
                response = (
                    self.client.table("photos").update(payload).eq("id", photo_id).execute()
                )
                record = response.data[0] if response.data else None
                if record:
                    self.update_thumbnail_column_hint(record)
                else:
                    # Treat empty data as success and synthesize record
                    record = {"id": photo_id, **payload}
                return record
            except Exception as e:
                last_exc = e
                error_str = str(e)
                # Check for unknown column error (PGRST204)
                if "PGRST204" in error_str or "Could not find" in error_str:
                    import re
                    match = re.search(r"'([^']+)' column", error_str)
                    if match:
                        unknown_col = match.group(1)
                        if unknown_col in payload:
                            print(f"Removing unknown column '{unknown_col}' from update payload")
                            del payload[unknown_col]
                            continue  # Retry without this column
                # If not handled, raise after loop
                break

        # If we exhausted retries or hit a non-handled error, fall back but do not fail the upload
        print(f"Non-fatal: update_photo_metadata failed for {photo_id}: {last_exc}")
        return {"id": photo_id, **payload}

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
        bbox: Optional[Tuple[float, float, float, float]] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        country: Optional[str] = None,
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
            "location_id",
            "uploaded_at",
            "captured_at",
            "r2_path",
            "r2_url",
            "exif_data",
        ]
        # Only select columns that exist in provided schema; avoid r2_key/metadata/geo fields.
        if include_thumbnail_columns:
            # Only add if schema supports them
            column_list.extend(["thumbnail_r2_path", "thumbnail_r2_url"])

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

        if bbox:
            lat_min, lat_max, lon_min, lon_max = bbox
            query = (
                query.gte("latitude", lat_min)
                .lte("latitude", lat_max)
                .gte("longitude", lon_min)
                .lte("longitude", lon_max)
            )

        query = query.order("uploaded_at", desc=order_desc).limit(safe_page_size).offset(
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

    def get_location(self, location_id: str) -> Optional[Dict[str, Any]]:
        if not self.client:
            return None
        try:
            response = (
                self.client.table("locations")
                .select("*")
                .eq("id", location_id)
                .maybe_single()
                .execute()
            )
            return response.data if hasattr(response, "data") else None
        except Exception as e:
            print(f"Error getting location: {e}")
            return None

    # ------------------------------------------------------------------
    # Project helpers
    # ------------------------------------------------------------------

    def create_project(
        self,
        name: str,
        owner_id: str,
        description: Optional[str] = None,
        address: Optional[str] = None,
        show_on_projects: Optional[bool] = None,
    ):
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        # Best-effort ensure owner exists to satisfy FK constraints (local/dev)
        try:
            self.ensure_user_exists(owner_id)
        except Exception:
            # Non-fatal: if ensure fails, we still attempt creation and let Supabase error bubble
            pass
        payload = {
            "name": name,
            "owner_id": owner_id,
        }
        if description is not None:
            payload["description"] = description
        if address is not None:
            payload["address"] = address
        if show_on_projects is not None:
            payload["show_on_projects"] = show_on_projects
        response = self.client.table("projects").insert(payload).execute()
        if not response.data:
            raise RuntimeError("Failed to create project")
        project = response.data[0]
        if description is not None:
            project["description"] = description
        if address is not None:
            project["address"] = address
        if show_on_projects is not None:
            project["show_on_projects"] = show_on_projects
        return project

    def ensure_user_exists(self, user_id: str, email: Optional[str] = None):
        """
        Ensure a user row exists to satisfy FK constraints on projects.owner_id.
        Uses a lightweight upsert with a fallback email when not provided.
        """
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        # If a row already exists, no-op
        existing = (
            self.client.table("users").select("id").eq("id", user_id).limit(1).execute()
        )
        if existing.data:
            return existing.data[0]
        fallback_email = email or f"{user_id}@local.invalid"
        payload = {"id": user_id, "email": fallback_email}
        response = self.client.table("users").upsert(payload).execute()
        return response.data[0] if response.data else payload

    def add_project_member(self, project_id: str, user_id: str, role: str):
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        payload = {
            "project_id": project_id,
            "user_id": user_id,
            "role": role,
            "last_accessed_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        response = self.client.table("project_members").upsert(
            payload, on_conflict="project_id,user_id"
        ).execute()
        return response.data[0] if response.data else None

    def list_projects_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        membership_response = (
            self.client.table("project_members")
            .select("project_id, role, last_accessed_at")
            .eq("user_id", user_id)
            .execute()
        )
        membership = membership_response.data or []
        project_ids = [row["project_id"] for row in membership]
        if not project_ids:
            return []
        response = (
            self.client.table("projects")
            .select("*")
            .in_("id", project_ids)
            .eq("show_on_projects", True)
            .execute()
        )
        projects = response.data or []
        role_map = {row["project_id"]: row["role"] for row in membership}
        access_map = {
            row["project_id"]: row.get("last_accessed_at") for row in membership
        }
        for project in projects:
            project["role"] = role_map.get(project["id"])
            project["last_accessed_at"] = access_map.get(project["id"])

        # Sort by last accessed desc, fallback created_at desc
        def sort_key(item):
            return (
                item.get("last_accessed_at") or item.get("updated_at") or item.get("created_at") or ""
            )

        return sorted(projects, key=sort_key, reverse=True)

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
        address: Optional[str] = None,
        show_on_projects: Optional[bool] = None,
    ) -> Optional[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        fields = {}
        if name is not None:
            fields["name"] = name
        if address is not None:
            fields["address"] = address
        if show_on_projects is not None:
            fields["show_on_projects"] = show_on_projects
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

    def touch_project_access(self, project_id: str, user_id: str):
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        now_iso = datetime.datetime.utcnow().isoformat() + "Z"
        # Update only; avoid duplicate key errors. Rows are created when membership is added.
        self.client.table("project_members").update(
            {"last_accessed_at": now_iso}
        ).eq("project_id", project_id).eq("user_id", user_id).execute()

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

    def list_project_members_with_profile(
        self, project_id: str
    ) -> List[Dict[str, Any]]:
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        members_resp = (
            self.client.table("project_members")
            .select("user_id, role")
            .eq("project_id", project_id)
            .execute()
        )
        members = members_resp.data or []
        if not members:
            return []
        user_ids = [m["user_id"] for m in members]
        profiles_resp = (
            self.client.table("users")
            .select("id, email, first_name, last_name, company")
            .in_("id", user_ids)
            .execute()
        )
        profiles = profiles_resp.data or []
        profile_map = {p["id"]: p for p in profiles}
        result = []
        for m in members:
            user_profile = profile_map.get(m["user_id"], {})
            result.append(
                {
                    "user_id": m["user_id"],
                    "role": m.get("role"),
                    "email": user_profile.get("email"),
                    "first_name": user_profile.get("first_name"),
                    "last_name": user_profile.get("last_name"),
                    "company": user_profile.get("company"),
                }
            )
        return result

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
