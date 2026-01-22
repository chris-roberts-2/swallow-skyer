"""
Pytest tests for photos API endpoints.
"""

import pytest
from unittest.mock import Mock, patch
from app import create_app


@pytest.fixture
def app():
    """Create Flask app for testing."""
    app = create_app("testing")
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def mock_supabase_response():
    """Mock Supabase query response."""
    return {
        "data": [
            {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "user_id": "123e4567-e89b-12d3-a456-426614174000",
                "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "r2_path": "projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/550e8400-e29b-41d4-a716-446655440000.jpg",
                "r2_url": "https://example.com/photos/one.jpg",
                "thumbnail_r2_path": "projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/550e8400-e29b-41d4-a716-446655440000_thumb.jpg",
                "thumbnail_r2_url": "https://example.com/photos/one_thumb.jpg",
                "latitude": 37.7749,
                "longitude": -122.4194,
                "taken_at": "2024-01-15T10:30:00Z",
                "created_at": "2024-01-15T10:35:00Z",
            },
            {
                "id": "660e8400-e29b-41d4-a716-446655440001",
                "user_id": "123e4567-e89b-12d3-a456-426614174000",
                "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "r2_path": "projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/660e8400-e29b-41d4-a716-446655440001.jpg",
                "r2_url": "",  # Empty to force signed URL generation
                "thumbnail_r2_path": "projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/660e8400-e29b-41d4-a716-446655440001_thumb.jpg",
                "thumbnail_r2_url": "",  # Empty to force signed URL generation
                "latitude": 37.7849,
                "longitude": -122.4294,
                "taken_at": "2024-01-16T10:30:00Z",
                "created_at": "2024-01-16T10:35:00Z",
            },
        ],
        "count": 2,
    }


@pytest.fixture
def mock_presigned_url():
    """Mock R2 presigned URL."""
    return "https://r2.cloudflarestorage.com/presigned-url?expires=600"


class TestPhotosAPI:
    """Test cases for photos API."""

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="owner")
    @patch("app.api_routes.v1.photos.supabase_client")
    @patch("app.api_routes.v1.photos.r2_client")
    def test_get_photos_default_params(
        self,
        mock_r2,
        mock_supabase,
        _mock_role,
        client,
        mock_supabase_response,
        auth_headers,
    ):
        """GET /api/v1/photos uses default pagination and membership scope."""
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.return_value = mock_supabase_response
        mock_supabase.get_project.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "Demo"}
        mock_supabase.get_user_metadata.return_value = {}
        mock_supabase.get_location.return_value = {}
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (
                record.get("thumbnail_r2_path"),
                record.get("thumbnail_r2_url"),
            )
        )
        mock_r2.resolve_url.return_value = "https://signed.example/path"

        response = client.get(
            "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["page_size"] == 50
        assert data["photos"][0]["thumbnail_url"] == "https://example.com/photos/one_thumb.jpg"
        mock_supabase.fetch_project_photos.assert_called_once_with(
            project_ids=["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
            page=1,
            page_size=50,
            user_id=None,
            date_range=None,
            bbox=None,
            city=None,
            state=None,
            country=None,
            include_signed_urls=True,
        )

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="viewer")
    @patch("app.api_routes.v1.photos.supabase_client")
    @patch("app.api_routes.v1.photos.r2_client")
    def test_get_photos_with_pagination(
        self,
        mock_r2,
        mock_supabase,
        _mock_role,
        client,
        mock_supabase_response,
        auth_headers,
    ):
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.return_value = mock_supabase_response
        mock_supabase.get_project.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "Demo"}
        mock_supabase.get_user_metadata.return_value = {}
        mock_supabase.get_location.return_value = {}
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (
                record.get("thumbnail_r2_path"),
                record.get("thumbnail_r2_url"),
            )
        )
        mock_r2.resolve_url.return_value = "https://signed.example/path"

        response = client.get(
            "/api/v1/photos/?page=3&page_size=25&project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            headers=auth_headers,
        )

        assert response.status_code == 200
        mock_supabase.fetch_project_photos.assert_called_once_with(
            project_ids=["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
            page=3,
            page_size=25,
            user_id=None,
            date_range=None,
            bbox=None,
            city=None,
            state=None,
            country=None,
            include_signed_urls=True,
        )

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="owner")
    @patch("app.api_routes.v1.photos.supabase_client")
    @patch("app.api_routes.v1.photos.r2_client")
    def test_get_photos_with_filters(
        self,
        mock_r2,
        mock_supabase,
        _mock_role,
        client,
        mock_supabase_response,
        auth_headers,
    ):
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.return_value = mock_supabase_response
        mock_supabase.get_project.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "Demo"}
        mock_supabase.get_user_metadata.return_value = {}
        mock_supabase.get_location.return_value = {}
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (
                record.get("thumbnail_r2_path"),
                record.get("thumbnail_r2_url"),
            )
        )
        mock_r2.resolve_url.return_value = "https://signed.example/path"

        response = client.get(
            "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&user_id=abc&date_range=2024-01-01,2024-02-01",
            headers=auth_headers,
        )

        assert response.status_code == 200
        mock_supabase.fetch_project_photos.assert_called_once_with(
            project_ids=["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
            page=1,
            page_size=50,
            user_id="abc",
            date_range=("2024-01-01", "2024-02-01"),
            bbox=None,
            city=None,
            state=None,
            country=None,
            include_signed_urls=True,
        )

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="owner")
    @patch("app.api_routes.v1.photos.supabase_client")
    @patch("app.api_routes.v1.photos.r2_client")
    def test_get_photos_enforces_page_size_cap(
        self,
        mock_r2,
        mock_supabase,
        _mock_role,
        client,
        mock_supabase_response,
        auth_headers,
    ):
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.return_value = mock_supabase_response
        mock_supabase.get_project.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "Demo"}
        mock_supabase.get_user_metadata.return_value = {}
        mock_supabase.get_location.return_value = {}
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (
                record.get("thumbnail_r2_path"),
                record.get("thumbnail_r2_url"),
            )
        )
        mock_r2.resolve_url.return_value = "https://signed.example/path"

        response = client.get(
            "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&page_size=500",
            headers=auth_headers,
        )
        data = response.get_json()
        assert data["pagination"]["page_size"] == 200
        mock_supabase.fetch_project_photos.assert_called_once_with(
            project_ids=["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
            page=1,
            page_size=200,
            user_id=None,
            date_range=None,
            bbox=None,
            city=None,
            state=None,
            country=None,
            include_signed_urls=True,
        )

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="owner")
    @patch("app.api_routes.v1.photos.supabase_client")
    @patch("app.api_routes.v1.photos.r2_client")
    def test_get_photos_generates_presigned_url_when_empty(
        self,
        mock_r2,
        mock_supabase,
        _mock_role,
        client,
        mock_supabase_response,
        auth_headers,
    ):
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.return_value = mock_supabase_response
        mock_supabase.get_project.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "Demo"}
        mock_supabase.get_user_metadata.return_value = {}
        mock_supabase.get_location.return_value = {}
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (
                record.get("thumbnail_r2_path"),
                record.get("thumbnail_r2_url"),
            )
        )
        mock_r2.resolve_url.side_effect = [
            "https://signed.example/full",
            "https://signed.example/thumb",
        ]

        response = client.get(
            "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["photos"][1]["url"] == "https://signed.example/full"
        assert data["photos"][1]["thumbnail_url"] == "https://signed.example/thumb"
        assert mock_r2.resolve_url.call_count == 2

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="owner")
    @patch("app.api_routes.v1.photos.supabase_client")
    def test_get_photos_handles_errors(
        self, mock_supabase, _mock_role, client, auth_headers
    ):
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.side_effect = Exception("boom")
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (record.get("thumbnail_r2_path"), record.get("thumbnail_r2_url"))
        )

        response = client.get(
            "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "error" in response.get_json()

    @patch("app.services.auth.permissions.supabase_client.get_project_role", return_value="owner")
    @patch("app.api_routes.v1.photos.supabase_client")
    @patch("app.api_routes.v1.photos.r2_client")
    def test_get_photos_empty_result(
        self, mock_r2, mock_supabase, _mock_role, client, auth_headers
    ):
        mock_supabase.client = True
        mock_supabase.fetch_project_photos.return_value = {"data": [], "count": 0}
        mock_supabase.extract_thumbnail_fields.side_effect = (
            lambda record: (record.get("thumbnail_r2_path"), record.get("thumbnail_r2_url"))
        )

        response = client.get(
            "/api/v1/photos/?project_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["photos"] == []
        assert data["pagination"]["total"] == 0


class TestSupabaseClientGetPhotos:
    """Test cases for SupabaseClient.fetch_project_photos method."""

    @patch("app.services.storage.supabase_client.create_client")
    def test_fetch_project_photos_filters_correctly(self, mock_create_client):
        """Verify project, pagination, and filter clauses are applied."""
        from app.services.storage.supabase_client import SupabaseClient

        mock_client = Mock()
        mock_table = Mock()
        mock_query = Mock()

        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.gte.return_value = mock_query
        mock_query.lte.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.execute.return_value = Mock(data=[], count=0)

        client = SupabaseClient()
        client.client = mock_client
        client._thumbnail_columns_supported = True
        client._show_on_photos_supported = False

        client.fetch_project_photos(
            project_ids=["proj-1"],
            page=2,
            page_size=25,
            user_id="user-99",
            date_range=("2024-01-01", "2024-01-31"),
            include_signed_urls=False,
        )

        mock_query.in_.assert_called_once()
        mock_query.eq.assert_called_with("user_id", "user-99")
        mock_query.gte.assert_any_call("created_at", "2024-01-01")
        mock_query.lte.assert_any_call("created_at", "2024-01-31")
        mock_query.order.assert_called_once_with("uploaded_at", desc=True)
        mock_query.limit.assert_called_once_with(25)
        mock_query.offset.assert_called_once_with(25)


class TestR2ClientPresignedURL:
    """Test cases for R2Client presigned URL generation."""

    @patch("app.services.storage.r2_client.boto3")
    def test_generate_presigned_url(self, mock_boto3):
        """Test presigned URL generation."""
        from app.services.storage.r2_client import R2Client

        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = "https://presigned.url"

        r2 = R2Client()
        r2.client = mock_client
        r2.bucket_name = "test-bucket"

        url = r2.generate_presigned_url("test-key", expires_in=300)

        assert url == "https://presigned.url"
        mock_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "test-bucket", "Key": "test-key"},
            ExpiresIn=300,
        )
