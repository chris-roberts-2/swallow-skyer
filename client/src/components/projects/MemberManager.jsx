import React, { useCallback } from 'react';
import { useAuth } from '../../context';
import { usePermissionToast } from '../common/PermissionToast';
import { getApiOrigin } from '../../utils/apiEnv';

const apiBase = getApiOrigin();

const buildMembersUrl = projectId =>
  `${(apiBase || '').replace(/\/$/, '')}/api/v1/projects/${projectId}/members`;

const MemberManager = () => {
  const { activeProject, roleForActiveProject } = useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
  const role = roleForActiveProject ? roleForActiveProject() : null;
  const normalizedRole = (role || '').toLowerCase();
  const canManage = normalizedRole === 'owner' || normalizedRole === 'co-owner';
  const { Toast, showForbiddenToast } = usePermissionToast();

  const handleAddMember = useCallback(async () => {
    if (!activeProjectId) return;
    const accessToken = localStorage.getItem('access_token') || '';
    try {
      const res = await fetch(buildMembersUrl(activeProjectId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ user_id: 'placeholder', role: 'viewer' }),
      });
      if (res.status === 403) {
        showForbiddenToast();
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to add member');
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(err);
      }
      showForbiddenToast();
    }
  }, [activeProjectId, showForbiddenToast]);

  if (!activeProjectId) {
    return (
      <div data-testid="member-manager-empty">
        No active project selected.
        {Toast}
      </div>
    );
  }

  if (!canManage) {
    return (
      <div data-testid="member-manager-readonly">
        Member management is restricted to owners and co-owners.
        {Toast}
      </div>
    );
  }

  return (
    <div data-testid="member-manager">
      <h4>Project Members</h4>
      <button type="button" data-testid="add-member" onClick={handleAddMember}>
        Add Member
      </button>
      {Toast}
    </div>
  );
};

export default MemberManager;
