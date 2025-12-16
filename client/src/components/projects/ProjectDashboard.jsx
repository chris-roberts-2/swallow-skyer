import React, { useCallback } from 'react';
import { useAuth } from '../../context';
import { usePermissionToast } from '../common/PermissionToast';

const apiBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

const buildProjectUrl = projectId =>
  `${(apiBase || '').replace(/\/$/, '')}/api/v1/projects/${projectId}`;

const ProjectDashboard = ({ onProjectUpdated = () => {} }) => {
  const { activeProject, roleForActiveProject } = useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
  const role = roleForActiveProject ? roleForActiveProject() : null;
  const normalizedRole = (role || '').toLowerCase();
  const canManage = normalizedRole === 'owner' || normalizedRole === 'co-owner';

  const { Toast, showForbiddenToast } = usePermissionToast();

  const handleDelete = useCallback(async () => {
    if (!activeProjectId) return;
    const accessToken = localStorage.getItem('access_token') || '';
    try {
      const res = await fetch(buildProjectUrl(activeProjectId), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (res.status === 403) {
        showForbiddenToast();
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to delete project');
      }
      onProjectUpdated();
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(err);
      }
      showForbiddenToast();
    }
  }, [activeProjectId, onProjectUpdated, showForbiddenToast]);

  if (!activeProjectId) {
    return (
      <div data-testid="project-dashboard-empty">
        No active project selected.
        {Toast}
      </div>
    );
  }

  return (
    <div data-testid="project-dashboard">
      <h3>Project Controls</h3>
      <p data-testid="project-role">Role: {normalizedRole || 'unknown'}</p>
      {canManage && (
        <button
          type="button"
          data-testid="edit-project"
          onClick={onProjectUpdated}
        >
          Edit Project
        </button>
      )}
      {canManage && (
        <button
          type="button"
          data-testid="delete-project"
          onClick={handleDelete}
        >
          Delete Project
        </button>
      )}
      {!canManage && (
        <div data-testid="project-readonly">
          Project editing is limited to owners and co-owners.
        </div>
      )}
      {Toast}
    </div>
  );
};

export default ProjectDashboard;

