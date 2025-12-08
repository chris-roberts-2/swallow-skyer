from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.services.storage.supabase_client import supabase_client

DEFAULT_SUFFIX = " – Default Project"
FALLBACK_PROJECT_NAME = "Unassigned – Legacy Import"


def _fetch_users(client):
    response = client.table("users").select("id", "email").execute()
    return response.data or []


def _fetch_user_photos(client, user_id: str):
    response = (
        client.table("photos")
        .select("id", "user_id")
        .eq("user_id", user_id)
        .execute()
    )
    return response.data or []


def _fetch_all_photos(client):
    response = client.table("photos").select("id", "user_id").execute()
    return response.data or []


def _ensure_project(client, name: str, owner_id: Optional[str]) -> Tuple[str, bool]:
    table = client.table("projects")
    response = table.select("id").eq("name", name).eq("owner_id", owner_id).execute()
    existing = response.data or []
    if existing:
        return existing[0]["id"], False

    payload = {"name": name, "owner_id": owner_id}
    response = (
        client.table("projects").insert(payload).select("id").execute()
    )
    inserted = response.data or []
    project_id = inserted[0]["id"] if inserted else None
    return project_id, True


def _ensure_project_member(client, project_id: str, user_id: str):
    table = client.table("project_members")
    response = (
        table.select("id")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if response.data:
        return False

    client.table("project_members").insert(
        {"project_id": project_id, "user_id": user_id, "role": "owner"}
    ).execute()
    return True


def _update_photos_project(client, project_id: str, user_id: str):
    client.table("photos").update({"project_id": project_id}).eq(
        "user_id", user_id
    ).execute()


def _assign_orphan_photos(client, orphan_ids: List[str], fallback_id: str):
    if not orphan_ids:
        return
    client.table("photos").update({"project_id": fallback_id}).in_(
        "id", orphan_ids
    ).execute()


def run():
    client = supabase_client.client
    if not client:
        raise RuntimeError("Supabase client not configured")

    users = _fetch_users(client)
    user_ids = {user["id"] for user in users if user.get("id")}
    projects_created = 0
    photos_assigned = 0

    for user in users:
        user_id = user.get("id")
        email = user.get("email") or "Unknown"
        if not user_id:
            continue

        project_name = f"{email}{DEFAULT_SUFFIX}"
        project_id, created = _ensure_project(client, project_name, user_id)
        if created:
            projects_created += 1
        _ensure_project_member(client, project_id, user_id)

        user_photos = _fetch_user_photos(client, user_id)
        if user_photos:
            photos_assigned += len(user_photos)
            _update_photos_project(client, project_id, user_id)

    all_photos = _fetch_all_photos(client)
    orphan_photos = [
        photo
        for photo in all_photos
        if not photo.get("user_id") or photo["user_id"] not in user_ids
    ]

    fallback_project_id, fallback_created = _ensure_project(
        client, FALLBACK_PROJECT_NAME, None
    )
    if fallback_created:
        projects_created += 1

    orphan_ids = [photo["id"] for photo in orphan_photos if photo.get("id")]
    if orphan_ids:
        photos_assigned += len(orphan_ids)
        _assign_orphan_photos(client, orphan_ids, fallback_project_id)

    print(f"Projects created: {projects_created}")
    print(f"Photos updated: {photos_assigned}")


if __name__ == "__main__":
    run()

