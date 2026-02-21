import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { useAuth } from '../context';

const ProjectMembersPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    projects,
    activeProject,
    setActiveProject,
    roleForActiveProject,
    user,
  } = useAuth();
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', role: 'Viewer' });
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuContextMember, setMenuContextMember] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [editingMember, setEditingMember] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ role: 'Viewer' });
  const [deletingMember, setDeletingMember] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const project = projects.find(p => p.id === id) || null;
  const activeProjectId = activeProject?.id || activeProject || null;
  const currentProjectId = id || activeProjectId;

  const currentRole = useMemo(
    () => (currentProjectId ? roleForActiveProject(currentProjectId) : null),
    [currentProjectId, roleForActiveProject]
  );
  const canManageMembers = useMemo(() => {
    const normalized = (currentRole || '').toLowerCase();
    return normalized === 'owner' || normalized === 'administrator';
  }, [currentRole]);

  const roleOptions = [
    { label: 'Owner', value: 'Owner' },
    { label: 'Administrator', value: 'Administrator' },
    { label: 'Editor', value: 'Editor' },
    { label: 'Viewer', value: 'Viewer' },
  ];

  useEffect(() => {
    if (currentProjectId && currentProjectId !== activeProjectId) {
      setActiveProject(currentProjectId);
    }
  }, [activeProjectId, currentProjectId, setActiveProject]);

  const fetchMembers = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      setError('');
      const resp = await apiClient.get(
        `/v1/projects/${currentProjectId}/members`
      );
      setMembers(resp?.members || []);
    } catch (err) {
      setError(
        err?.payload?.error || err?.message || 'Unable to load project members'
      );
    }
  }, [currentProjectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    const handler = event => {
      if (!event.target.closest('.member-row-menu')) {
        setMenuOpenId(null);
        setMenuContextMember(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleAddMember = async () => {
    if (!currentProjectId) return;
    const email = (addForm.email || '').trim();
    if (!email) {
      setError('Email is required.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/v1/projects/${currentProjectId}/members/invite`, {
        email,
        role: addForm.role,
      });
      setIsAddOpen(false);
      setAddForm({ email: '', role: 'Viewer' });
      await fetchMembers();
    } catch (err) {
      setError(
        err?.payload?.error ||
          err?.message ||
          'Unable to add member. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditMember = member => {
    if (!member) return;
    setEditingMember(member);
    setEditForm({ role: member.role || 'Viewer' });
    setIsEditOpen(true);
    setMenuOpenId(null);
    setMenuContextMember(null);
  };

  const handleUpdateMember = async () => {
    if (!currentProjectId || !editingMember?.user_id) return;
    setIsSubmitting(true);
    setError('');
    try {
      await apiClient.patch(
        `/v1/projects/${currentProjectId}/members/${editingMember.user_id}`,
        { role: editForm.role }
      );
      setIsEditOpen(false);
      setEditingMember(null);
      await fetchMembers();
    } catch (err) {
      setError(
        err?.payload?.error ||
          err?.message ||
          'Unable to update member. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!currentProjectId || !deletingMember?.user_id) return;
    setIsSubmitting(true);
    setError('');
    try {
      await apiClient.delete(
        `/v1/projects/${currentProjectId}/members/${deletingMember.user_id}`
      );
      setIsDeleteOpen(false);
      setDeletingMember(null);
      await fetchMembers();
    } catch (err) {
      setError(
        err?.payload?.error ||
          err?.message ||
          'Unable to remove member. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 'var(--space-md) var(--space-lg)',
        maxWidth: 1100,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-md)',
        }}
      >
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            ← Back
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--font-size-base)',
              color: 'var(--color-text-primary)',
            }}
          >
            <span>Project:</span>
            <select
              value={currentProjectId || ''}
              onChange={e => {
                const nextId = e.target.value;
                if (nextId) {
                  setActiveProject(nextId);
                  navigate(`/projects/${nextId}/members`);
                }
              }}
              style={{
                minWidth: 200,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '6px 10px',
                background: 'var(--color-surface-primary)',
                fontSize: 'var(--font-size-base)',
              }}
            >
              <option value="">Select a project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          {canManageMembers ? (
            <button
              type="button"
              title="Add Member"
              aria-label="Add Member"
              onClick={() => setIsAddOpen(true)}
              className="btn-primary btn-icon"
            >
              +
            </button>
          ) : null}
        </div>
      </div>

      <h2 style={{ marginTop: 0 }}>Project Members</h2>
      {error ? (
        <div
          style={{
            color: 'var(--color-accent)',
            marginBottom: 'var(--space-md)',
          }}
        >
          {error}
        </div>
      ) : null}
      <div
        className="data-table-container"
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          position: 'relative',
        }}
      >
        <table
          className="data-table"
          style={{ minWidth: 640, tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Role</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const name = [member.first_name, member.last_name]
                .filter(Boolean)
                .join(' ')
                .trim();
              const registrationIncomplete =
                !member.first_name && !member.last_name;
              const RUST = '#9B4A2F';
              const canShowActions =
                canManageMembers &&
                member.user_id !== user?.id &&
                member.user_id !== project?.owner_id;
              return (
                <tr key={member.user_id}>
                  <td style={{ position: 'relative', overflow: 'visible' }}>
                    {registrationIncomplete ? (
                      <span style={{ color: RUST, fontStyle: 'italic' }}>
                        Registration Incomplete
                      </span>
                    ) : (
                      name || ''
                    )}
                  </td>
                  <td>{registrationIncomplete ? '' : member.company || ''}</td>
                  <td
                    style={registrationIncomplete ? { color: RUST } : undefined}
                  >
                    {member.email || ''}
                  </td>
                  <td
                    style={{
                      textTransform: 'capitalize',
                      ...(registrationIncomplete ? { color: RUST } : {}),
                    }}
                  >
                    {member.role || 'Viewer'}
                  </td>
                  <td>
                    {canShowActions ? (
                      <div
                        className="member-row-menu"
                        style={{
                          position: 'relative',
                          display: 'inline-block',
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Member actions"
                          onClick={e => {
                            e.stopPropagation();
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            const menuWidth = 160;
                            const padding = 8;
                            const left = Math.min(
                              rect.left,
                              window.innerWidth - menuWidth - padding
                            );
                            setMenuPosition({
                              top: rect.bottom + 6,
                              left: Math.max(padding, left),
                            });
                            setMenuContextMember(member);
                            setMenuOpenId(prev => {
                              const next =
                                prev === member.user_id ? null : member.user_id;
                              if (!next) {
                                setMenuContextMember(null);
                              }
                              return next;
                            });
                          }}
                          className="btn-secondary btn-icon-sm"
                        >
                          ⋮
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!members.length ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  No members
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {isAddOpen ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isSubmitting) setIsAddOpen(false);
          }}
        >
          <div className="modal-body" onClick={e => e.stopPropagation()}>
            <h3 className="modal-header">Add Member</h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-md)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                  Email
                </span>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e =>
                    setAddForm(prev => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="person@example.com"
                  required
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-base)',
                    boxSizing: 'border-box',
                    width: '100%',
                  }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                  Role
                </span>
                <select
                  value={addForm.role}
                  onChange={e =>
                    setAddForm(prev => ({ ...prev, role: e.target.value }))
                  }
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-base)',
                  }}
                >
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                disabled={isSubmitting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditOpen ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isSubmitting) {
              setIsEditOpen(false);
              setEditingMember(null);
            }
          }}
        >
          <div className="modal-body" onClick={e => e.stopPropagation()}>
            <h3 className="modal-header">Edit Member</h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-md)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                  Email
                </span>
                <input
                  type="email"
                  value={editingMember?.email || ''}
                  disabled
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-base)',
                    background: 'var(--color-background)',
                    color: 'var(--color-text-secondary)',
                    boxSizing: 'border-box',
                    width: '100%',
                  }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                  Role
                </span>
                <select
                  value={editForm.role}
                  onChange={e =>
                    setEditForm(prev => ({ ...prev, role: e.target.value }))
                  }
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-base)',
                  }}
                >
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={isSubmitting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateMember}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteOpen ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isSubmitting) {
              setIsDeleteOpen(false);
              setDeletingMember(null);
            }
          }}
        >
          <div className="modal-body" onClick={e => e.stopPropagation()}>
            <h3 className="modal-header">Remove Member</h3>
            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
              Remove {deletingMember?.email || 'this member'} from the project?
            </p>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isSubmitting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={isSubmitting}
                className="btn-destructive"
              >
                {isSubmitting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {menuOpenId && menuContextMember ? (
        <div
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            background: 'var(--color-surface-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 2000,
            minWidth: 160,
            padding: 'var(--space-xs) 0',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn-menu-item"
            onClick={() => handleEditMember(menuContextMember)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-menu-item btn-menu-item-destructive"
            onClick={() => {
              setDeletingMember(menuContextMember);
              setIsDeleteOpen(true);
              setMenuOpenId(null);
              setMenuContextMember(null);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectMembersPage;
