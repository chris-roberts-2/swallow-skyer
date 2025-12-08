import React, { useCallback } from 'react';
import { useAuth } from '../../context';
import { usePermissionToast } from '../common/PermissionToast';
import fileService from '../../services/fileService';

const apiBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

const buildPhotoUrl = photoId =>
  `${(apiBase || '').replace(/\/$/, '')}/api/v1/photos/${photoId}`;

const PhotoControls = ({ photoId, projectId: projectIdProp, onDeleted = () => {} }) => {
  const { roleForActiveProject, activeProject } = useAuth();
  const role = roleForActiveProject ? roleForActiveProject() : null;
  const normalizedRole = (role || '').toLowerCase();
  const canDownload = Boolean(role);
  const canUpload =
    normalizedRole === 'collaborator' ||
    normalizedRole === 'co-owner' ||
    normalizedRole === 'owner';
  const canDelete = normalizedRole === 'owner' || normalizedRole === 'co-owner';
  const { Toast, showForbiddenToast } = usePermissionToast();
  const projectId = projectIdProp || activeProject;

  const handleDelete = useCallback(async () => {
    if (!photoId || !canDelete) return;
    const accessToken = localStorage.getItem('access_token') || '';
    try {
      const res = await fetch(buildPhotoUrl(photoId), {
        method: 'DELETE',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (res.status === 403) {
        showForbiddenToast();
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to delete photo');
      }
      onDeleted(photoId);
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(err);
      }
      showForbiddenToast();
    }
  }, [photoId, canDelete, onDeleted, showForbiddenToast]);

  const handleDownload = useCallback(async () => {
    if (!photoId || !projectId || !canDownload) return;
    try {
      const { url } = await fileService.getPresignedDownloadURL(
        projectId,
        photoId
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
      showForbiddenToast();
    }
  }, [photoId, projectId, canDownload, showForbiddenToast]);

  return (
    <div data-testid="photo-controls">
      {canDownload && (
        <button type="button" data-testid="download-photo" onClick={handleDownload}>
          Download
        </button>
      )}
      {canUpload ? (
        <button type="button" data-testid="photo-upload-button">
          Upload
        </button>
      ) : (
        <div data-testid="photo-upload-hidden">Uploads hidden for viewers.</div>
      )}
      {canDelete && (
        <button type="button" data-testid="delete-photo" onClick={handleDelete}>
          Delete Photo
        </button>
      )}
      {Toast}
    </div>
  );
};

export default PhotoControls;

