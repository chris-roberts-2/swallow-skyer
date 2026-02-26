"""
Project service layer.

Implements a geocode-first, transactional workflow for project creation and
updates. Both forward geocoding (address → coordinates) and reverse geocoding
(coordinates → address) flow through a single shared resolution helper so that
the resulting data structure and persistence logic is always identical regardless
of input type.

Return contract for all public functions:
    Success → (result_dict, None)
    Failure → (None, error_dict)  where error_dict = { error: str, geocode_error?: str }
"""

import logging
from typing import Optional, Tuple, Dict, Any

from app.services.geocoding.nominatim_client import forward_geocode, reverse_geocode
from app.services.storage.supabase_client import supabase_client

logger = logging.getLogger(__name__)

Result = Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]


def _resolve_location(
    address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> Result:
    """
    Resolve a normalized geo result from either an address or coordinates.

    Exactly one source may be active at a time:
    - address provided → forward geocode
    - lat + lng provided → reverse geocode
    - neither provided → (None, None)  meaning no location input

    Returns (geo_result, None) on success or (None, error_dict) on failure.
    geo_result always has the shape { address: str, lat: float, lng: float }.
    """
    if address and address.strip():
        result = forward_geocode(address.strip())
        if "type" in result:
            err: Dict[str, Any] = {
                "error": result["message"],
                "geocode_error": result["type"],
            }
            if "candidates" in result:
                err["candidates"] = result["candidates"]
            return None, err
        return result, None

    if lat is not None and lng is not None:
        result = reverse_geocode(lat, lng)
        if "type" in result:
            return None, {"error": result["message"], "geocode_error": result["type"]}
        return result, None

    return None, None


def _persist_location(project_id: str, geo: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Write the resolved geo result to public.locations as a project marker."""
    return supabase_client.create_project_location(
        project_id=project_id,
        lat=geo["lat"],
        lng=geo["lng"],
    )


def _sync_location(project_id: str, geo: Dict[str, Any]) -> None:
    """Upsert the project marker in public.locations with the resolved geo result."""
    supabase_client.upsert_project_location(
        project_id=project_id,
        lat=geo["lat"],
        lng=geo["lng"],
    )


def create_project_with_location(
    name: str,
    owner_id: str,
    address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> Result:
    """
    Create a project, optionally resolving and persisting a project-marker location.

    Either address or (lat, lng) may be provided — never both (the route layer
    enforces this constraint before calling here).

    Workflow:
    - Resolve geo via address or coordinates first; abort entirely on failure.
    - Write project row with resolved address and address_coord.
    - Write public.locations row (marker='project').
    - If the location write fails → delete the project row (rollback) and return error.
    - If no location input → create project only; no location row is created.
    """
    geo, err = _resolve_location(address=address, lat=lat, lng=lng)
    if err:
        return None, err

    address_coord = {"lat": geo["lat"], "lng": geo["lng"]} if geo else None
    resolved_address = geo["address"] if geo else address

    try:
        project = supabase_client.create_project(
            name=name,
            owner_id=owner_id,
            address=resolved_address,
            address_coord=address_coord,
        )
    except Exception as exc:
        logger.error("Project creation failed: %s", exc)
        return None, {"error": str(exc)}

    if geo:
        try:
            _persist_location(project["id"], geo)
        except Exception as exc:
            logger.error(
                "Location write failed for project %s; rolling back: %s",
                project.get("id"),
                exc,
            )
            _attempt_rollback(project.get("id"))
            return None, {
                "error": "Failed to create project location. No data was saved.",
                "geocode_error": "location_write_failed",
            }

    return project, None


def update_project_with_location(
    project_id: str,
    name: Optional[str] = None,
    address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    show_on_projects: Optional[bool] = None,
) -> Result:
    """
    Update a project, re-resolving and syncing the project-marker location when
    address or coordinates change.

    Either address or (lat, lng) may be provided — never both (the route layer
    enforces this constraint before calling here).

    Workflow:
    - Resolve geo via address or coordinates first; abort entirely on failure.
    - Update project row with resolved address and address_coord.
    - Upsert public.locations row (marker='project') if a location was resolved.
    - If no location input in payload → update only the supplied fields.
    """
    has_coords = lat is not None and lng is not None
    has_address = address is not None and address.strip() != ""

    geo, err = _resolve_location(
        address=address if has_address else None,
        lat=lat if has_coords else None,
        lng=lng if has_coords else None,
    )
    if err:
        return None, err

    address_coord = {"lat": geo["lat"], "lng": geo["lng"]} if geo else None
    resolved_address = geo["address"] if geo else (address if address is not None else None)

    try:
        updated = supabase_client.update_project(
            project_id=project_id,
            name=name,
            address=resolved_address,
            address_coord=address_coord,
            show_on_projects=show_on_projects,
        )
    except Exception as exc:
        logger.error("Project update failed for %s: %s", project_id, exc)
        return None, {"error": str(exc)}

    if not updated:
        return None, None

    if geo:
        try:
            _sync_location(project_id, geo)
        except Exception as exc:
            logger.error(
                "Location upsert failed for project %s: %s", project_id, exc
            )

    return updated, None


def _attempt_rollback(project_id: Optional[str]) -> None:
    """Best-effort deletion of a newly created project row on location write failure."""
    if not project_id:
        return
    try:
        supabase_client.delete_project(project_id)
    except Exception as exc:
        logger.error("Rollback failed for project %s: %s", project_id, exc)
