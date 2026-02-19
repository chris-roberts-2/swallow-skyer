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

  const addButtonStyle = {
    borderRadius: '50%',
    width: 36,
    height: 36,
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface-secondary)',
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-semibold)',
    lineHeight: '32px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
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
            className="btn-format-1"
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
              style={addButtonStyle}
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
        style={{
          background: 'var(--color-surface-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-md)',
          overflowX: 'auto',
          overflowY: 'visible',
          position: 'relative',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 640,
            tableLayout: 'fixed',
            overflow: 'visible',
          }}
        >
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th
                style={{
                  padding: 'var(--space-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  textAlign: 'left',
                }}
              >
                Name
              </th>
              <th
                style={{
                  padding: 'var(--space-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  textAlign: 'left',
                }}
              >
                Company
              </th>
              <th
                style={{
                  padding: 'var(--space-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  textAlign: 'left',
                }}
              >
                Email
              </th>
              <th
                style={{
                  padding: 'var(--space-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  textAlign: 'left',
                }}
              >
                Role
              </th>
              <th
                style={{
                  padding: 'var(--space-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  textAlign: 'left',
                }}
              >
                &nbsp;
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const name = [member.first_name, member.last_name]
                .filter(Boolean)
                .join(' ')
                .trim();
              const canShowActions =
                canManageMembers &&
                member.user_id !== user?.id &&
                member.user_id !== project?.owner_id;
              return (
                <tr
                  key={member.user_id}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td
                    style={{
                      padding: 'var(--space-sm)',
                      textAlign: 'left',
                      position: 'relative',
                      overflow: 'visible',
                    }}
                  >
                    {name || ''}
                  </td>
                  <td style={{ padding: 'var(--space-sm)', textAlign: 'left' }}>
                    {member.company || ''}
                  </td>
                  <td style={{ padding: 'var(--space-sm)', textAlign: 'left' }}>
                    {member.email || ''}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-sm)',
                      textTransform: 'capitalize',
                      textAlign: 'left',
                    }}
                  >
                    {member.role || 'Viewer'}
                  </td>
                  <td style={{ padding: 'var(--space-sm)', textAlign: 'left' }}>
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
                          style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: '50%',
                            width: 28,
                            height: 28,
                            background: 'var(--color-surface-primary)',
                            cursor: 'pointer',
                            lineHeight: '24px',
                          }}
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
                  style={{
                    padding: 'var(--space-md) var(--space-sm)',
                    color: 'var(--color-text-secondary)',
                  }}
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(31, 58, 95, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-md)',
          }}
          onClick={() => {
            if (!isSubmitting) setIsAddOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-lg)',
              width: 'min(420px, 100%)',
              boxShadow: 'var(--shadow-xl)',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>
              Add Member
            </h3>
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
                <span
                  style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-base)',
                  }}
                >
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
                <span
                  style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-base)',
                  }}
                >
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-sm)',
                marginTop: 'var(--space-md)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                disabled={isSubmitting}
                className="btn-format-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={isSubmitting}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: '1px solid var(--color-primary-dark)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  fontWeight: 'var(--font-weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {isSubmitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(31, 58, 95, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-md)',
          }}
          onClick={() => {
            if (!isSubmitting) {
              setIsEditOpen(false);
              setEditingMember(null);
            }
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-lg)',
              width: 'min(420px, 100%)',
              boxShadow: 'var(--shadow-xl)',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>
              Edit Member
            </h3>
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
                <span
                  style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-base)',
                  }}
                >
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
                <span
                  style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-base)',
                  }}
                >
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-sm)',
                marginTop: 'var(--space-md)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={isSubmitting}
                className="btn-format-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateMember}
                disabled={isSubmitting}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: '1px solid var(--color-primary-dark)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  fontWeight: 'var(--font-weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(31, 58, 95, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-md)',
          }}
          onClick={() => {
            if (!isSubmitting) {
              setIsDeleteOpen(false);
              setDeletingMember(null);
            }
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-lg)',
              width: 'min(420px, 100%)',
              boxShadow: 'var(--shadow-xl)',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-sm)' }}>
              Remove Member
            </h3>
            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
              Remove {deletingMember?.email || 'this member'} from the project?
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-sm)',
                marginTop: 'var(--space-md)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isSubmitting}
                className="btn-format-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={isSubmitting}
                style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  fontWeight: 'var(--font-weight-bold)',
                  cursor: 'pointer',
                }}
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
            style={{
              width: '100%',
              textAlign: 'left',
              padding: 'var(--space-sm) var(--space-md)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              color: 'var(--color-text-primary)',
            }}
            onClick={() => handleEditMember(menuContextMember)}
          >
            Edit
          </button>
          <button
            type="button"
            style={{
              width: '100%',
              textAlign: 'left',
              padding: 'var(--space-sm) var(--space-md)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              color: 'var(--color-accent)',
            }}
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
