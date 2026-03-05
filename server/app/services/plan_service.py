"""
Service layer for project plan operations.
Encapsulates Supabase reads/writes and R2 storage for georeferenced plans.
"""

from typing import Any, Dict, Optional

from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client


def create_plan_record(
    project_id: str,
    r2_path: str,
    file_name: str,
    file_type: str,
    file_size: int,
    user_id: str,
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    image_width: Optional[int] = None,
    image_height: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Insert a new plan record into project_plans.
    Caller must ensure project has no existing plan (unique constraint).
    image_width/image_height are the raster pixel dimensions from the stored PNG.
    """
    payload = {
        "project_id": project_id,
        "r2_path": r2_path,
        "file_name": file_name,
        "file_type": file_type,
        "file_size": file_size,
        "user_id": user_id,
        "min_lat": min_lat,
        "min_lng": min_lng,
        "max_lat": max_lat,
        "max_lng": max_lng,
    }
    if image_width is not None:
        payload["image_width"] = image_width
    if image_height is not None:
        payload["image_height"] = image_height
    if width is not None:
        payload["width"] = width
    if height is not None:
        payload["height"] = height
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
    file_size: int,
    user_id: str,
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    image_width: Optional[int] = None,
    image_height: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
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
    return supabase_client.update_project_plan(
        project_id=project_id,
        r2_path=r2_path,
        file_name=file_name,
        file_type=file_type,
        file_size=file_size,
        user_id=user_id,
        min_lat=min_lat,
        min_lng=min_lng,
        max_lat=max_lat,
        max_lng=max_lng,
        image_width=image_width,
        image_height=image_height,
        width=width,
        height=height,
    )
