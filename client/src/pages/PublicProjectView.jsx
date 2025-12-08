import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import publicService from '../services/publicService';
import MapContainer from '../components/map/MapContainer';

const PublicProjectView = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const [project, setProject] = React.useState(null);
  const [photos, setPhotos] = React.useState([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const isEmbed = searchParams.get('embed') === '1';

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const proj = await publicService.getProject(token);
        const photoResp = await publicService.getPhotos(token);
        if (!mounted) return;
        setProject(proj.project);
        setPhotos(photoResp.photos || []);
      } catch (err) {
        if (!mounted) return;
        if (err?.status === 410) {
          setError('This public link has expired.');
        } else {
          setError('Unable to load public project.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleDownload = async photoId => {
    try {
      const { url } = await publicService.getDownloadURL(token, photoId);
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (err?.status === 410) {
        setError('This public link has expired.');
      } else {
        setError('Download not available.');
      }
    }
  };

  if (loading) {
    return <div>Loading public project…</div>;
  }

  if (error) {
    return <div data-testid="public-error">{error}</div>;
  }

  return (
    <div
      className="map-page"
      style={isEmbed ? { padding: 0, margin: 0 } : undefined}
      data-testid="public-view"
    >
      <h2>{project?.name}</h2>
      {project?.description && <p>{project.description}</p>}
      <MapContainer photos={photos} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        {photos.map(photo => (
          <div
            key={photo.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: 8,
              width: 200,
            }}
          >
            <img
              src={photo.thumbnail_r2_url || photo.r2_url}
              alt={photo.caption || 'Photo'}
              style={{ width: '100%', borderRadius: 4 }}
            />
            <div>{photo.caption}</div>
            <button
              type="button"
              data-testid={`download-photo-${photo.id}`}
              onClick={() => handleDownload(photo.id)}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PublicProjectView;

