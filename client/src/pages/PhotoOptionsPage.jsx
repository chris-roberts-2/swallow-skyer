import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useAuth } from '../context';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getApiCandidates } from '../utils/apiEnv';
import { formatLocalDateTime } from '../utils/dateTime';
import { configureMaplibreWorker } from '../utils/maplibreWorker';

const envApiBases = getApiCandidates();

const formatTimestamp = value => formatLocalDateTime(value);

const resolvePhotoUrl = photo => {
  const r2PublicBase =
    process.env.REACT_APP_R2_PUBLIC_BASE_URL ||
    process.env.REACT_APP_R2_PUBLIC_URL ||
    '';
  const r2Path = (photo.r2_path || photo.r2_key || '').trim();
  const r2Url = (photo.r2_url || '').trim();
  const primaryUrl = (photo.url || r2Url || '').trim();
  const fallbackUrl =
    r2PublicBase && r2Path
      ? `${r2PublicBase.replace(/\/$/, '')}/${r2Path}`
      : '';
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
  configureMaplibreWorker();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTarget = useMemo(
    () => (location.state?.from === 'map' ? '/map' : '/photos'),
    [location.state]
  );
  const { projects } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const mapMarkerRef = useRef(null);

  const fetchPhoto = async () => {
    setError('');
    const accessToken = localStorage.getItem('access_token') || '';
    const candidates = envApiBases;

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
      photo.captured_at ||
      photo.capturedAt ||
      photo.uploaded_at ||
      photo.uploadedAt ||
      photo.created_at ||
      photo.createdAt;
    const projectId = photo.project_id || null;
    const projectName =
      photo.project_name || projects?.find(p => p.id === projectId)?.name || '';
    const uploadedBy = photo?.uploaded_by?.display || '';
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
      try {
        mapInstance.current = new maplibregl.Map({
          container: mapRef.current,
          style:
            'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [lon, lat],
          zoom: 13,
          interactive: false,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error initializing map:', error);
        return;
      }
    } else {
      mapInstance.current.setCenter([lon, lat]);
    }

    if (mapMarkerRef.current) {
      mapMarkerRef.current.remove();
      mapMarkerRef.current = null;
    }

    mapMarkerRef.current = new maplibregl.Marker({ color: '#3f6fa0' })
      .setLngLat([lon, lat])
      .addTo(mapInstance.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayPhoto?.latitude,
    displayPhoto?.longitude,
    displayPhoto?.mapLatitude,
    displayPhoto?.mapLongitude,
  ]);

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
      link.download =
        displayPhoto.file_name || displayPhoto.caption || `photo-${id}`;
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
    const candidates = envApiBases;
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
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="page-header">
          <div className="page-header__left">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(backTarget)}
            >
              ← Back
            </button>
          </div>
          <div className="page-header__center">
            <h2 className="page-header__title">Photo Options</h2>
          </div>
          <div className="page-header__right" />
        </div>
        {error ? (
          <div className="page-error">{error}</div>
        ) : (
          <div className="page-empty">Loading photo...</div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      <div className="page-header">
        <div className="page-header__left">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(backTarget)}
          >
            ← Back
          </button>
        </div>
        <div className="page-header__center">
          <h2 className="page-header__title">Photo Options</h2>
        </div>
        <div className="page-header__right" />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-lg)',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
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
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-xl)',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={e => {
              if (
                displayPhoto.fallbackUrl &&
                e.target.src !== displayPhoto.fallbackUrl
              ) {
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
              gap: 'var(--space-sm)',
              marginTop: 'var(--space-sm)',
              width: '100%',
            }}
          >
            <button
              type="button"
              className="btn-secondary"
              onClick={download}
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading…' : 'Download'}
            </button>
            <button
              type="button"
              className="btn-critical"
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
            gap: 'var(--space-md)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 'var(--space-md)',
              alignItems: 'start',
            }}
          >
            <div
              className="surface-card"
              style={{ padding: 'var(--space-sm) var(--space-md)' }}
            >
              <h6 style={{ margin: '0 0 var(--space-xs)' }}>Information</h6>
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
                <dt
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  Date/Time
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                    textAlign: 'left',
                  }}
                >
                  {displayPhoto.createdAt || 'Unknown'}
                </dd>

                <dt
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  Project
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                    textAlign: 'left',
                  }}
                >
                  {displayPhoto.projectName || 'Unknown'}
                </dd>

                <dt
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  Uploaded By
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                    textAlign: 'left',
                  }}
                >
                  {displayPhoto.uploadedBy || 'Unknown'}
                </dd>

                <dt
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  File Size
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                    textAlign: 'left',
                  }}
                >
                  {displayPhoto.fileSizeLabel || 'Unknown'}
                </dd>
              </dl>
            </div>

            <div
              className="surface-card"
              style={{ padding: 0, overflow: 'hidden' }}
            >
              <div
                style={{
                  padding: 'var(--space-sm) var(--space-md)',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h6 style={{ margin: 0 }}>Location</h6>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    padding: 'var(--space-xs) var(--space-sm)',
                    fontSize: 'var(--font-size-sm)',
                  }}
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
