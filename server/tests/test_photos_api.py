"""
Pytest tests for photos API endpoints.
"""

import pytest
from unittest.mock import Mock, patch
from app import create_app


@pytest.fixture
def app():
    """Create Flask app for testing."""
    app = create_app('testing')
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def mock_supabase_response():
    """Mock Supabase query response."""
    return {
        'data': [
            {
                'id': '550e8400-e29b-41d4-a716-446655440000',
                'user_id': '123e4567-e89b-12d3-a456-426614174000',
                'r2_key': 'photos/2024/test.jpg',
                'url': 'https://example.com/presigned-url',
                'latitude': 37.7749,
                'longitude': -122.4194,
                'taken_at': '2024-01-15T10:30:00Z',
                'created_at': '2024-01-15T10:35:00Z'
            },
            {
                'id': '660e8400-e29b-41d4-a716-446655440001',
                'user_id': '123e4567-e89b-12d3-a456-426614174000',
                'r2_key': 'photos/2024/test2.jpg',
                'url': '',  # Empty URL to test presigned generation
                'latitude': 37.7849,
                'longitude': -122.4294,
                'taken_at': '2024-01-16T10:30:00Z',
                'created_at': '2024-01-16T10:35:00Z'
            }
        ],
        'count': 2
    }


@pytest.fixture
def mock_presigned_url():
    """Mock R2 presigned URL."""
    return 'https://r2.cloudflarestorage.com/presigned-url?expires=600'


class TestPhotosAPI:
    """Test cases for photos API."""

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_default_params(self, mock_r2, mock_supabase, client, mock_supabase_response):
        """Test GET /api/v1/photos with default parameters."""
        # Setup mocks
        mock_supabase.get_photos.return_value = mock_supabase_response
        mock_r2.generate_presigned_url.return_value = 'https://presigned.url'

        # Make request
        response = client.get('/api/v1/photos/')

        # Assertions
        assert response.status_code == 200
        data = response.get_json()
        
        assert 'photos' in data
        assert 'pagination' in data
        assert len(data['photos']) == 2
        assert data['pagination']['limit'] == 50
        assert data['pagination']['offset'] == 0
        assert data['pagination']['total'] == 2

        # Verify Supabase was called with defaults
        mock_supabase.get_photos.assert_called_once_with(
            limit=50,
            offset=0,
            since=None,
            bbox=None,
            user_id=None
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_with_pagination(self, mock_r2, mock_supabase, client, mock_supabase_response):
        """Test GET /api/v1/photos with pagination parameters."""
        mock_supabase.get_photos.return_value = mock_supabase_response

        response = client.get('/api/v1/photos/?limit=10&offset=20')

        assert response.status_code == 200
        data = response.get_json()
        
        assert data['pagination']['limit'] == 10
        assert data['pagination']['offset'] == 20

        mock_supabase.get_photos.assert_called_once_with(
            limit=10,
            offset=20,
            since=None,
            bbox=None,
            user_id=None
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_with_bbox_filter(self, mock_r2, mock_supabase, client, mock_supabase_response):
        """Test GET /api/v1/photos with bounding box filter."""
        mock_supabase.get_photos.return_value = mock_supabase_response

        bbox = '37.7,122.4,37.8,122.5'
        response = client.get(f'/api/v1/photos/?bbox={bbox}')

        assert response.status_code == 200
        mock_supabase.get_photos.assert_called_once_with(
            limit=50,
            offset=0,
            since=None,
            bbox=bbox,
            user_id=None
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_with_since_filter(self, mock_r2, mock_supabase, client, mock_supabase_response):
        """Test GET /api/v1/photos with since timestamp filter."""
        mock_supabase.get_photos.return_value = mock_supabase_response

        since = '2024-01-01T00:00:00Z'
        response = client.get(f'/api/v1/photos/?since={since}')

        assert response.status_code == 200
        mock_supabase.get_photos.assert_called_once_with(
            limit=50,
            offset=0,
            since=since,
            bbox=None,
            user_id=None
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_with_user_filter(self, mock_r2, mock_supabase, client, mock_supabase_response):
        """Test GET /api/v1/photos with user_id filter."""
        mock_supabase.get_photos.return_value = mock_supabase_response

        user_id = '123e4567-e89b-12d3-a456-426614174000'
        response = client.get(f'/api/v1/photos/?user_id={user_id}')

        assert response.status_code == 200
        mock_supabase.get_photos.assert_called_once_with(
            limit=50,
            offset=0,
            since=None,
            bbox=None,
            user_id=user_id
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_enforces_max_limit(self, mock_r2, mock_supabase, client, mock_supabase_response):
        """Test that limit is capped at 200."""
        mock_supabase.get_photos.return_value = mock_supabase_response

        response = client.get('/api/v1/photos/?limit=500')

        assert response.status_code == 200
        data = response.get_json()
        assert data['pagination']['limit'] == 200

        mock_supabase.get_photos.assert_called_once_with(
            limit=200,
            offset=0,
            since=None,
            bbox=None,
            user_id=None
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_generates_presigned_url_when_empty(
        self, mock_r2, mock_supabase, client, mock_supabase_response, mock_presigned_url
    ):
        """Test that presigned URLs are generated when url field is empty."""
        mock_supabase.get_photos.return_value = mock_supabase_response
        mock_r2.generate_presigned_url.return_value = mock_presigned_url

        response = client.get('/api/v1/photos/')

        assert response.status_code == 200
        data = response.get_json()
        
        # First photo has URL, should not generate presigned
        assert data['photos'][0]['url'] == 'https://example.com/presigned-url'
        
        # Second photo has empty URL, should have presigned generated
        assert data['photos'][1]['url'] == mock_presigned_url
        
        # Verify presigned URL was generated for second photo only
        mock_r2.generate_presigned_url.assert_called_once_with(
            'photos/2024/test2.jpg',
            expires_in=600
        )

    @patch('app.api_routes.v1.photos.supabase_client')
    def test_get_photos_handles_errors(self, mock_supabase, client):
        """Test error handling when Supabase fails."""
        mock_supabase.get_photos.side_effect = Exception('Database connection failed')

        response = client.get('/api/v1/photos/')

        assert response.status_code == 500
        data = response.get_json()
        assert 'error' in data

    @patch('app.api_routes.v1.photos.supabase_client')
    @patch('app.api_routes.v1.photos.r2_client')
    def test_get_photos_empty_result(self, mock_r2, mock_supabase, client):
        """Test GET /api/v1/photos with no results."""
        mock_supabase.get_photos.return_value = {'data': [], 'count': 0}

        response = client.get('/api/v1/photos/')

        assert response.status_code == 200
        data = response.get_json()
        assert data['photos'] == []
        assert data['pagination']['total'] == 0


class TestSupabaseClientGetPhotos:
    """Test cases for SupabaseClient.get_photos method."""

    @patch('app.services.storage.supabase_client.create_client')
    def test_get_photos_filters_correctly(self, mock_create_client):
        """Test that filters are applied correctly to Supabase query."""
        from app.services.storage.supabase_client import SupabaseClient
        
        # Setup mock
        mock_client = Mock()
        mock_table = Mock()
        mock_query = Mock()
        
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.gte.return_value = mock_query
        mock_query.lte.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.execute.return_value = Mock(data=[], count=0)
        
        # Create client with mocked supabase
        client = SupabaseClient()
        client.client = mock_client
        
        # Test with bbox
        client.get_photos(bbox='37.7,-122.5,37.8,-122.4')
        
        # Verify bbox filters were applied
        assert mock_query.gte.called
        assert mock_query.lte.called


class TestR2ClientPresignedURL:
    """Test cases for R2Client presigned URL generation."""

    @patch('app.services.storage.r2_client.boto3')
    def test_generate_presigned_url(self, mock_boto3):
        """Test presigned URL generation."""
        from app.services.storage.r2_client import R2Client
        
        mock_client = Mock()
        mock_client.generate_presigned_url.return_value = 'https://presigned.url'
        
        r2 = R2Client()
        r2.client = mock_client
        r2.bucket_name = 'test-bucket'
        
        url = r2.generate_presigned_url('test-key', expires_in=300)
        
        assert url == 'https://presigned.url'
        mock_client.generate_presigned_url.assert_called_once_with(
            'get_object',
            Params={'Bucket': 'test-bucket', 'Key': 'test-key'},
            ExpiresIn=300
        )

