import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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

const formatFileSize = value => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const PhotoOptionsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTarget = useMemo(
    () => (location.state?.from === 'map' ? '/map' : '/photos'),
    [location.state]
  );
  const { activeProject, projects } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const mapMarkerRef = useRef(null);

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
  }, [id]);

  const displayPhoto = useMemo(() => {
    if (!photo) return null;
    const { primaryUrl, fallbackUrl, resolvedUrl } = resolvePhotoUrl(photo);
    const isoTimestamp =
      photo.uploaded_at ||
      photo.uploadedAt ||
      photo.created_at ||
      photo.createdAt ||
      photo.captured_at ||
      photo.capturedAt;
    const projectId = photo.project_id || null;
    const projectName =
      photo.project_name ||
      projects?.find(p => p.id === projectId)?.name ||
      '';
    const uploadedBy =
      photo?.uploaded_by?.display ||
      '';
    return {
      ...photo,
      primaryUrl,
      fallbackUrl,
      url: resolvedUrl || fallbackUrl,
      createdAt: formatTimestamp(isoTimestamp),
      projectName,
      uploadedBy,
      fileSizeLabel: formatFileSize(photo.file_size),
    };
  }, [photo, projects]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!displayPhoto) return;

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
    }

    if (mapMarkerRef.current) {
      mapMarkerRef.current.remove();
      mapMarkerRef.current = null;
    }

    mapMarkerRef.current = new maplibregl.Marker({ color: '#1e88e5' })
      .setLngLat([lon, lat])
      .addTo(mapInstance.current);
  }, [displayPhoto?.latitude, displayPhoto?.longitude, displayPhoto?.mapLatitude, displayPhoto?.mapLongitude]);

  useEffect(() => {
    return () => {
      if (mapMarkerRef.current) {
        mapMarkerRef.current.remove();
        mapMarkerRef.current = null;
      }
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

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
      <div
        style={{
          padding: 24,
          boxSizing: 'border-box',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <button
          type="button"
          className="btn-format-1"
          onClick={() => navigate(backTarget)}
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
        width: '100%',
        padding: '12px 24px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          alignItems: 'center',
          width: '100%',
          columnGap: 12,
        }}
      >
        <button
          type="button"
          className="btn-format-1"
          onClick={() => navigate(backTarget)}
        >
          Back
        </button>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              width: 'min(1200px, 100%)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <h2 style={{ margin: 0, padding: 0 }}>Photo Options</h2>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-start',
            maxWidth: 'min(520px, 90vw)',
            width: '100%',
          }}
        >
          <img
            src={displayPhoto.url}
            alt={displayPhoto.caption || displayPhoto.file_name || 'Photo'}
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: 12,
              boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
              objectFit: 'cover',
              display: 'block',
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
              display: 'flex',
              gap: 8,
              marginTop: 10,
              width: '100%',
            }}
          >
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

        <div
          style={{
            flex: '1 1 320px',
            minWidth: 300,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
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
              <div style={{ fontWeight: 600 }}>Information</div>
              <dl
                style={{
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr',
                  columnGap: 10,
                  rowGap: 8,
                  alignItems: 'start',
                  paddingTop: 6,
                }}
              >
                <dt style={{ margin: 0, fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                  Date/Time
                </dt>
                <dd style={{ margin: 0, fontSize: 13, color: '#374151', textAlign: 'left' }}>
                  {displayPhoto.createdAt || 'Unknown'}
                </dd>

                <dt style={{ margin: 0, fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                  Project
                </dt>
                <dd style={{ margin: 0, fontSize: 13, color: '#374151', textAlign: 'left' }}>
                  {displayPhoto.projectName || 'Unknown'}
                </dd>

                <dt style={{ margin: 0, fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                  Uploaded By
                </dt>
                <dd style={{ margin: 0, fontSize: 13, color: '#374151', textAlign: 'left' }}>
                  {displayPhoto.uploadedBy || 'Unknown'}
                </dd>

                <dt style={{ margin: 0, fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                  File Size
                </dt>
                <dd style={{ margin: 0, fontSize: 13, color: '#374151', textAlign: 'left' }}>
                  {displayPhoto.fileSizeLabel || 'Unknown'}
                </dd>
              </dl>
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

        </div>
      </div>
    </div>
  );
};

export default PhotoOptionsPage;

