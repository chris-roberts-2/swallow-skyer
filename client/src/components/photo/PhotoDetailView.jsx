import React, { useCallback } from 'react';
import { useAuth } from '../../context';
import fileService from '../../services/fileService';
import { usePermissionToast } from '../common/PermissionToast';

const PhotoDetailView = ({ photo }) => {
  const { activeProject, roleForActiveProject } = useAuth();
  const role =
    (roleForActiveProject && roleForActiveProject(photo?.project_id)) || null;
  const canDownload = Boolean(role);
  const { Toast, showForbiddenToast } = usePermissionToast();

  const handleDownload = useCallback(async () => {
    if (!photo?.id) return;
    const projectId = photo?.project_id || activeProject;
    if (!projectId) return;
    try {
      const { url } = await fileService.getPresignedDownloadURL(
        projectId,
        photo.id
      );
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (err?.status === 403) {
        showForbiddenToast(
          err?.payload?.message || 'You do not have permission for this action.'
        );
        return;
      }
      if (process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    }
  }, [activeProject, photo, showForbiddenToast]);

  return (
    <div data-testid="photo-detail-view">
      {photo && (
        <>
          <h4>{photo.caption || 'Photo Details'}</h4>
          <p>{photo.file_name || photo.url}</p>
        </>
      )}
      {canDownload && (
        <button
          type="button"
          data-testid="download-photo"
          onClick={handleDownload}
        >
          Download
        </button>
      )}
      {Toast}
    </div>
  );
};

export default PhotoDetailView;

