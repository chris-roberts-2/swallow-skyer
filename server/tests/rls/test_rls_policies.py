import re
from pathlib import Path


def _load_policy_sql():
    path = Path("migrations/202512080100_rls_project_policies.sql")
    return path.read_text()


def test_policy_files_exist():
    sql = _load_policy_sql()
    assert "ENABLE ROW LEVEL SECURITY" in sql
    for table in ["projects", "project_members", "photos", "locations"]:
        assert f"ON public.{table}" in sql


def test_role_hierarchy_present():
    sql = _load_policy_sql()
    for role in ["owner", "co-owner", "collaborator", "viewer"]:
        assert role in sql


def test_photos_insert_requires_collaborator_plus():
    sql = _load_policy_sql()
    # Ensure insert policy mentions collaborator
    assert "photos_insert_collab" in sql
    assert "role IN ('owner','co-owner','collaborator')" in sql


def test_photos_update_requires_owner():
    sql = _load_policy_sql()
    assert "photos_update_owner" in sql
    assert "role IN ('owner','co-owner')" in sql


def test_locations_policy_joins_photos():
    sql = _load_policy_sql()
    assert "FROM public.photos p" in sql
    assert "p.location_id = locations.id" in sql

