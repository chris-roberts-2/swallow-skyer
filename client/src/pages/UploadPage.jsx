import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import BatchUploader from '../components/upload/BatchUploader';
import { useAuth } from '../context';
import { useNavigate } from 'react-router-dom';
import { getApiCandidates } from '../utils/apiEnv';
import { formatLocalDateTime } from '../utils/dateTime';

const envApiBases = getApiCandidates();

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

const formatTimestamp = value => formatLocalDateTime(value);

const PhotosPage = () => {
  const { activeProject, projects, setActiveProject } = useAuth();
  const navigate = useNavigate();
  const activeProjectId = activeProject?.id || activeProject || null;
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [projectToggleWidth, setProjectToggleWidth] = useState(180);
  const projectSelectRef = useRef(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [openMenuId, setOpenMenuId] = useState(null);
  const cardsRef = useRef(null);

  const hasProjects = (projects || []).length > 0;

  useEffect(() => {
    const selectEl = projectSelectRef.current;
    if (!selectEl) return;
    selectEl.style.width = 'auto';
    const scrollWidth = selectEl.scrollWidth;
    const buffer = 18;
    const computed = scrollWidth + buffer;
    const clamped = Math.min(Math.max(computed, 140), window.innerWidth * 0.9);
    setProjectToggleWidth(clamped);
  }, [projects.length, activeProjectId]);

  const fetchPhotos = useCallback(
    async projectIdOverride => {
      const projectId = projectIdOverride ?? activeProjectId;
      if (!projectId) {
        setPhotos([]);
        return;
      }
      setIsLoading(true);
      setError('');
      const accessToken = localStorage.getItem('access_token') || '';
      const candidates = envApiBases;

      for (const base of candidates) {
        try {
          const url = new URL(`${base}/api/v1/photos/`);
          url.searchParams.set('project_id', projectId);
          const res = await fetch(url.toString(), {
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
          const list = Array.isArray(payload.photos) ? payload.photos : [];
          setPhotos(list);
          setIsLoading(false);
          return;
        } catch (e) {
          // eslint-disable-next-line no-continue
          continue;
        }
      }
      setError('Unable to load photos for this project.');
      setIsLoading(false);
    },
    [activeProjectId]
  );

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  useEffect(() => {
    const handleClickOutside = e => {
      if (!openMenuId) return;
      const cardRoot = cardsRef.current;
      if (!cardRoot) return;
      const isMenuClick = e.target.closest?.('.photo-menu');
      const isCardClick = e.target.closest?.('.photo-card');
      if (!isMenuClick && !isCardClick) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside, true);
    return () =>
      document.removeEventListener('click', handleClickOutside, true);
  }, [openMenuId]);

  const toggleSelect = photoId => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const downloadPhotos = async (ids, list) => {
    if (!ids?.length) return;
    const source = list || normalisedPhotos;
    const items = source.filter(p => ids.includes(p.id));
    if (!items.length) return;

    const fetchBlob = async url => {
      const res = await fetch(url, { mode: 'cors' }).catch(() => null);
      if (!res || !res.ok) {
        throw new Error('Download failed');
      }
      return res.blob();
    };

    const downloadFile = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const downloadDirect = (url, filename) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const resolveName = item =>
      item.file_name || item.caption || `photo-${item.id || Date.now()}`;

    const resolveUrl = item =>
      item.primaryUrl || item.url || item.fallbackUrl || item.thumbnailUrl;

    setIsDownloading(true);
    try {
      if (items.length === 1) {
        const item = items[0];
        const url = resolveUrl(item);
        if (!url) throw new Error('No URL to download');
        downloadDirect(url, resolveName(item));
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (const item of items) {
          const url = resolveUrl(item);
          if (!url) continue;
          try {
            // eslint-disable-next-line no-await-in-loop
            const blob = await fetchBlob(url);
            const name = resolveName(item);
            zip.file(name, blob);
          } catch (e) {
            // Skip files that fail due to CORS or network issues.
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadFile(zipBlob, `photos-${Date.now()}.zip`);
      }
    } catch (err) {
      setError(err?.message || 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const deletePhotos = async ids => {
    if (!ids?.length) return;
    const accessToken = localStorage.getItem('access_token') || '';
    const candidates = envApiBases;

    for (const id of ids) {
      for (const base of candidates) {
        try {
          const url = new URL(`${base}/api/v1/photos/${id}`);
          const res = await fetch(url.toString(), {
            method: 'DELETE',
            headers: {
              ...(accessToken
                ? {
                    Authorization: `Bearer ${accessToken}`,
                  }
                : {}),
            },
          });
          if (res.ok) break;
        } catch (e) {
          // try next base
        }
      }
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
    fetchPhotos(activeProjectId);
  };

  const normalisedPhotos = useMemo(() => {
    return (photos || [])
      .map(photo => {
        const { primaryUrl, fallbackUrl, resolvedUrl, resolvedThumb } =
          resolvePhotoUrl(photo);
        if (photo.show_on_photos === false) {
          return null;
        }
        if (!resolvedUrl && !resolvedThumb) {
          return null;
        }
        const isoTimestamp =
          photo.captured_at ||
          photo.capturedAt ||
          photo.created_at ||
          photo.createdAt ||
          null;
        return {
          ...photo,
          url: resolvedUrl || resolvedThumb,
          primaryUrl,
          fallbackUrl,
          thumbnailUrl: resolvedThumb,
          createdAt: formatTimestamp(isoTimestamp),
        };
      })
      .filter(Boolean);
  }, [photos]);

  if (!hasProjects) {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="page-header">
          <h2 className="page-header__title">Photos</h2>
        </div>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Select or create a project to view its photos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div
        className="page-header"
        style={{ justifyContent: 'space-between', position: 'relative' }}
      >
        <select
          className="btn-format-1"
          ref={projectSelectRef}
          value={activeProjectId || projects[0]?.id || ''}
          onChange={e => {
            const nextId = e.target.value;
            setActiveProject(nextId || null);
            setPhotos([]);
            fetchPhotos(nextId);
          }}
          style={{
            paddingRight: 28,
            width: `${projectToggleWidth}px`,
            whiteSpace: 'nowrap',
          }}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-sm)',
          }}
        >
          <h2 style={{ margin: 0, color: 'var(--color-text-primary)' }}>
            Photos
          </h2>
          <span
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {normalisedPhotos.length} items
          </span>
        </div>
        <BatchUploader
          variant="compact"
          onUploaded={() => fetchPhotos(activeProjectId)}
        />
      </div>

      {selectionMode ? (
        <div className="photo-actions-bar">
          <span
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-primary)',
            }}
          >
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const allIds = (normalisedPhotos || [])
                .map(photo => photo?.id)
                .filter(Boolean);
              setSelectedIds(new Set(allIds));
            }}
            disabled={!normalisedPhotos.length}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => downloadPhotos([...selectedIds], normalisedPhotos)}
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading…' : 'Download selected'}
          </button>
          <button
            type="button"
            className="btn-critical"
            onClick={() => deletePhotos([...selectedIds])}
          >
            Delete selected
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
          >
            Done
          </button>
        </div>
      ) : null}

      {error ? <div className="page-error">{error}</div> : null}
      {isLoading ? <div className="page-empty">Loading photos...</div> : null}

      <div className="photo-grid" ref={cardsRef}>
        {normalisedPhotos.map(photo => {
          const missingGps = !(photo?.exif_data && photo.exif_data.gps);
          const isSelected = selectedIds.has(photo.id);
          return (
            <div
              key={photo.id}
              className="photo-grid-card"
              onClick={() => {
                if (!selectionMode) {
                  navigate(`/photos/${photo.id}/options`);
                }
              }}
            >
              {selectionMode ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(photo.id)}
                  style={{
                    position: 'absolute',
                    top: 'var(--space-sm)',
                    left: 'var(--space-sm)',
                    zIndex: 2,
                    width: 18,
                    height: 18,
                    accentColor: 'var(--color-primary)',
                  }}
                />
              ) : null}
              <div
                className="photo-menu"
                style={{
                  position: 'absolute',
                  top: 'var(--space-sm)',
                  right: 'var(--space-sm)',
                  zIndex: 2,
                }}
              >
                <button
                  type="button"
                  aria-label="Photo actions"
                  onClick={e => {
                    e.stopPropagation();
                    setOpenMenuId(prev =>
                      prev === photo.id ? null : photo.id
                    );
                  }}
                  className="btn-secondary btn-icon-sm"
                >
                  ⋮
                </button>
                {openMenuId === photo.id ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 34,
                      right: 0,
                      background: 'var(--color-surface-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-lg)',
                      zIndex: 5,
                      minWidth: 180,
                      padding: 'var(--space-xs) 0',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        downloadPhotos([photo.id], normalisedPhotos);
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        setSelectionMode(true);
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          next.add(photo.id);
                          return next;
                        });
                      }}
                    >
                      More
                    </button>
                    <button
                      type="button"
                      className="btn-menu-item btn-menu-item-destructive"
                      onClick={() => {
                        setOpenMenuId(null);
                        deletePhotos([photo.id]);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  width: '100%',
                  overflow: 'hidden',
                  background: 'var(--color-surface-secondary)',
                  aspectRatio: '4 / 3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={photo.thumbnailUrl || photo.url}
                  alt={photo.caption || photo.file_name || 'Photo'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  onError={e => {
                    if (
                      photo.fallbackUrl &&
                      e.target.src !== photo.fallbackUrl
                    ) {
                      // eslint-disable-next-line no-param-reassign
                      e.target.src = photo.fallbackUrl;
                    } else {
                      // eslint-disable-next-line no-param-reassign
                      e.target.style.display = 'none';
                    }
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 'var(--space-sm)',
                  borderTop: '1px solid var(--color-border)',
                  background: 'var(--color-surface-primary)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {photo.createdAt || 'Date unknown'}
                </div>
                {missingGps ? (
                  <span
                    style={{
                      position: 'absolute',
                      right: 'var(--space-sm)',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-accent)',
                      background: 'var(--color-surface-secondary)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '2px var(--space-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                    }}
                  >
                    No GPS
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhotosPage;
