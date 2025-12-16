import React from 'react';
import BatchUploader from './BatchUploader';
import { useAuth } from '../../context';
import { usePermissionToast } from '../common/PermissionToast';

const UploadPanel = () => {
  const { activeProject, roleForActiveProject } = useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
  const resolvedRole = roleForActiveProject ? roleForActiveProject() : null;
  const normalizedRole = (resolvedRole || '').toLowerCase();
  const canUpload =
    normalizedRole === 'collaborator' ||
    normalizedRole === 'co-owner' ||
    normalizedRole === 'owner';

  const { Toast, showForbiddenToast } = usePermissionToast();

  if (!activeProjectId) {
    return (
      <div data-testid="upload-panel-empty">
        Select a project to start uploading photos.
        {Toast}
      </div>
    );
  }

  return (
    <div data-testid="upload-panel">
      <h3>Upload Photos</h3>
      {canUpload ? (
        <BatchUploader onForbidden={showForbiddenToast} />
      ) : (
        <div data-testid="upload-disabled">
          Uploads are disabled for your role.
        </div>
      )}
      {Toast}
    </div>
  );
};

export default UploadPanel;

