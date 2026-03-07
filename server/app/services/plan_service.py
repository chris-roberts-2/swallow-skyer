"""
Service layer for project plan operations.
Encapsulates Supabase reads/writes and R2 storage for georeferenced plans.
Schema: public.project_plans uses corner_* and uploaded_by_user_id (no file_size, no min/max).
"""

from typing import Any, Dict, Optional

from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client


def _bounds_to_corners(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
) -> Dict[str, float]:
    """Convert axis-aligned bounds to four corner coordinates for DB schema."""
    return {
        "corner_nw_lat": max_lat,
        "corner_nw_lng": min_lng,
        "corner_ne_lat": max_lat,
        "corner_ne_lng": max_lng,
        "corner_se_lat": min_lat,
        "corner_se_lng": max_lng,
        "corner_sw_lat": min_lat,
        "corner_sw_lng": min_lng,
    }


def create_plan_record(
    project_id: str,
    r2_path: str,
    file_name: str,
    file_type: str,
    user_id: str,
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    image_width: int,
    image_height: int,
    r2_url: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Insert a new plan record into project_plans.
    Caller must ensure project has no existing plan (unique constraint).
    Payload matches schema: no file_size; corners stored as corner_*; user as uploaded_by_user_id.
    """
    corners = _bounds_to_corners(min_lat, min_lng, max_lat, max_lng)
    payload: Dict[str, Any] = {
        "project_id": project_id,
        "r2_path": r2_path,
        "file_name": file_name,
        "file_type": file_type or None,
        "r2_url": r2_url,
        "uploaded_by_user_id": user_id,
        "image_width": image_width,
        "image_height": image_height,
        **corners,
    }
    return supabase_client.store_project_plan(payload)


def get_plan_by_project_id(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch the plan record for a project, or None if none exists.
    """
    return supabase_client.get_project_plan(project_id)


def delete_plan(project_id: str) -> bool:
    """
    Delete the plan record and R2 file for a project.
    Returns True if a plan existed and was deleted.
    """
    plan = get_plan_by_project_id(project_id)
    if not plan:
        return False
    r2_path = plan.get("r2_path")
    if r2_path and r2_client.client:
        r2_client.delete_file(r2_path)
    return supabase_client.delete_project_plan(project_id)


def replace_plan(
    project_id: str,
    r2_path: str,
    file_name: str,
    file_type: str,
    user_id: str,
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    image_width: int,
    image_height: int,
    r2_url: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Replace the existing plan: delete old R2 file, update DB record.
    Returns updated record or None on failure.
    """
    plan = get_plan_by_project_id(project_id)
    if not plan:
        return None
    old_r2_path = plan.get("r2_path")
    if old_r2_path and r2_client.client:
        r2_client.delete_file(old_r2_path)
    corners = _bounds_to_corners(min_lat, min_lng, max_lat, max_lng)
    return supabase_client.update_project_plan(
        project_id=project_id,
        r2_path=r2_path,
        file_name=file_name,
        file_type=file_type or None,
        r2_url=r2_url,
        uploaded_by_user_id=user_id,
        image_width=image_width,
        image_height=image_height,
        **corners,
    )
