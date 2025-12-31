import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useAuth } from '../context';
import 'maplibre-gl/dist/maplibre-gl.css';

const envApiBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

const formatTimestamp = value => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return '';
  }
};

const resolvePhotoUrl = photo => {
  const r2PublicBase =
    process.env.REACT_APP_R2_PUBLIC_BASE_URL ||
    process.env.REACT_APP_R2_PUBLIC_URL ||
    '';
  const r2Path = (photo.r2_path || photo.r2_key || '').trim();
  const r2Url = (photo.r2_url || '').trim();
  const primaryUrl = (photo.url || r2Url || '').trim();
  const fallbackUrl =
    r2PublicBase && r2Path ? `${r2PublicBase.replace(/\/$/, '')}/${r2Path}` : '';
  const resolvedUrl = primaryUrl || fallbackUrl;

  const thumbPath = (photo.thumbnail_r2_path || '').trim();
  const thumbUrl = (photo.thumbnail_r2_url || photo.thumbnail_url || '').trim();
  const resolvedThumb =
    thumbUrl ||
    (thumbPath && r2PublicBase
      ? `${r2PublicBase.replace(/\/$/, '')}/${thumbPath}`
      : '');

  return { primaryUrl, fallbackUrl, resolvedUrl, resolvedThumb };
};

const PhotoOptionsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  const projectId = activeProject?.id || activeProject || null;

  const fetchPhoto = async () => {
    setError('');
    const accessToken = localStorage.getItem('access_token') || '';
    const candidates = Array.from(
      new Set([envApiBase, 'http://127.0.0.1:5001', 'http://localhost:5001'])
    ).filter(Boolean);

    for (const base of candidates) {
      try {
        const res = await fetch(`${base}/api/v1/photos/${id}`, {
          headers: {
            ...(accessToken
              ? {
                  Authorization: `Bearer ${accessToken}`,
                }
              : {}),
          },
        });
        const payload = await res.json();
        if (!res.ok) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const p = payload.photo || payload.data || payload;
        if (p) {
          setPhoto(p);
          return;
        }
      } catch (e) {
        // try next
      }
    }
    setError('Unable to load photo.');
  };

  useEffect(() => {
    if (id) fetchPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, projectId]);

  const displayPhoto = useMemo(() => {
    if (!photo) return null;
    const { primaryUrl, fallbackUrl, resolvedUrl } = resolvePhotoUrl(photo);
    const isoTimestamp =
      photo.captured_at || photo.capturedAt || photo.created_at || photo.createdAt;
    return {
      ...photo,
      primaryUrl,
      fallbackUrl,
      url: resolvedUrl || fallbackUrl,
      createdAt: formatTimestamp(isoTimestamp),
    };
  }, [photo]);

  useEffect(() => {
    if (!displayPhoto) return;
    if (!mapRef.current) return;
    const lat = Number(displayPhoto.latitude ?? displayPhoto.mapLatitude);
    const lon = Number(displayPhoto.longitude ?? displayPhoto.mapLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (!mapInstance.current) {
      mapInstance.current = new maplibregl.Map({
        container: mapRef.current,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [lon, lat],
        zoom: 13,
        interactive: false,
      });
    } else {
      mapInstance.current.setCenter([lon, lat]);
      mapInstance.current.setZoom(13);
    }

    new maplibregl.Marker({ color: '#1e88e5' }).setLngLat([lon, lat]).addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [displayPhoto]);

  const download = async () => {
    if (!displayPhoto?.url) return;
    setIsDownloading(true);
    try {
      const link = document.createElement('a');
      link.href = displayPhoto.url;
      link.download = displayPhoto.file_name || displayPhoto.caption || `photo-${id}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloading(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setIsDeleting(true);
    const accessToken = localStorage.getItem('access_token') || '';
    const candidates = Array.from(
      new Set([envApiBase, 'http://127.0.0.1:5001', 'http://localhost:5001'])
    ).filter(Boolean);
    for (const base of candidates) {
      try {
        const res = await fetch(`${base}/api/v1/photos/${id}`, {
          method: 'DELETE',
          headers: {
            ...(accessToken
              ? {
                  Authorization: `Bearer ${accessToken}`,
                }
              : {}),
          },
        });
        if (res.ok) {
          navigate('/photos');
          return;
        }
      } catch (e) {
        // try next
      }
    }
    setIsDeleting(false);
  };

  if (!displayPhoto) {
    return (
      <div style={{ padding: 24 }}>
        <button
          type="button"
          className="btn-format-1"
          onClick={() => navigate('/photos')}
          style={{ marginBottom: 12 }}
        >
          Back
        </button>
        {error ? <div style={{ color: '#dc2626' }}>{error}</div> : <div>Loading photo...</div>}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '16px 24px',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <button
        type="button"
        className="btn-format-1"
        onClick={() => navigate('/photos')}
        style={{ marginBottom: 12 }}
      >
        Back
      </button>

      <div
        style={{
          display: 'flex',
          gap: 18,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <img
          src={displayPhoto.url}
          alt={displayPhoto.caption || displayPhoto.file_name || 'Photo'}
          style={{
            width: 'min(520px, 90vw)',
            borderRadius: 12,
            boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
            objectFit: 'cover',
          }}
          onError={e => {
            if (displayPhoto.fallbackUrl && e.target.src !== displayPhoto.fallbackUrl) {
              // eslint-disable-next-line no-param-reassign
              e.target.src = displayPhoto.fallbackUrl;
            } else {
              // eslint-disable-next-line no-param-reassign
              e.target.style.display = 'none';
            }
          }}
        />

        <div
          style={{
            flex: '1',
            minWidth: 260,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Photo Options</h2>
            <div style={{ color: '#6b7280', fontSize: 13 }}>
              {displayPhoto.createdAt || 'Date unknown'}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 12,
              alignItems: 'start',
            }}
          >
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '10px 12px',
                background: '#fff',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 600 }}>Metadata</div>
              <div style={{ fontSize: 13, color: '#374151' }}>
                Date/Time: {displayPhoto.createdAt || 'Unknown'}
              </div>
              {displayPhoto.latitude && displayPhoto.longitude ? (
                <div style={{ fontSize: 13, color: '#374151' }}>
                  Location: {displayPhoto.latitude}, {displayPhoto.longitude}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Location: Not available</div>
              )}
            </div>

            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Location</span>
                <button
                  type="button"
                  className="btn-format-1"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => navigate('/map')}
                >
                  Open Map
                </button>
              </div>
              <div
                ref={mapRef}
                style={{
                  height: 180,
                  width: '100%',
                  cursor: 'pointer',
                }}
                onClick={() => navigate('/map')}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="btn-format-1"
              onClick={download}
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading…' : 'Download'}
            </button>
            <button
              type="button"
              className="btn-format-1"
              style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
              onClick={remove}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoOptionsPage;

