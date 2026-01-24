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
    border: '1px solid #e0e0e0',
    background: '#f7f9fc',
    fontSize: 20,
    fontWeight: 600,
    lineHeight: '32px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      style={{
        padding: '16px 24px',
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
          gap: 12,
          marginBottom: 12,
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
              fontSize: 14,
              color: '#374151',
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
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '6px 10px',
                background: '#fff',
                fontSize: 14,
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
        <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>
      ) : null}
      <div
        style={{
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
                  padding: '10px 8px',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'left',
                }}
              >
                Name
              </th>
              <th
                style={{
                  padding: '10px 8px',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'left',
                }}
              >
                Company
              </th>
              <th
                style={{
                  padding: '10px 8px',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'left',
                }}
              >
                Email
              </th>
              <th
                style={{
                  padding: '10px 8px',
                  borderBottom: '1px solid #e5e7eb',
                  textAlign: 'left',
                }}
              >
                Role
              </th>
              <th
                style={{
                  padding: '10px 8px',
                  borderBottom: '1px solid #e5e7eb',
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
                  style={{ borderBottom: '1px solid #f1f3f5' }}
                >
                  <td
                    style={{
                      padding: '8px 6px',
                      textAlign: 'left',
                      position: 'relative',
                      overflow: 'visible',
                    }}
                  >
                    {name || ''}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'left' }}>
                    {member.company || ''}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'left' }}>
                    {member.email || ''}
                  </td>
                  <td
                    style={{
                      padding: '8px 6px',
                      textTransform: 'capitalize',
                      textAlign: 'left',
                    }}
                  >
                    {member.role || 'Viewer'}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'left' }}>
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
                            setMenuOpenId(prev =>
                              prev === member.user_id ? null : member.user_id
                            );
                          }}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '50%',
                            width: 28,
                            height: 28,
                            background: '#fff',
                            cursor: 'pointer',
                            lineHeight: '24px',
                          }}
                        >
                          ⋮
                        </button>
                        {menuOpenId === member.user_id ? (
                          <div
                            style={{
                              position: 'absolute',
                              top: 32,
                              right: 0,
                              background: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: 8,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                              zIndex: 70,
                              minWidth: 140,
                              padding: '6px 0',
                            }}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 14,
                              }}
                              onClick={() => handleEditMember(member)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 14,
                                color: '#dc2626',
                              }}
                              onClick={() => {
                                setDeletingMember(member);
                                setIsDeleteOpen(true);
                                setMenuOpenId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
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
                  style={{ padding: '12px 8px', color: '#6b7280' }}
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
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => {
            if (!isSubmitting) setIsAddOpen(false);
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 20,
              width: 'min(420px, 100%)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Add Member</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>Email</span>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e =>
                    setAddForm(prev => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="person@example.com"
                  required
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    fontSize: 14,
                  }}
                />
              </label>
              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>Role</span>
                <select
                  value={addForm.role}
                  onChange={e =>
                    setAddForm(prev => ({ ...prev, role: e.target.value }))
                  }
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    fontSize: 14,
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
                gap: 10,
                marginTop: 16,
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
                  background: '#2563eb',
                  color: '#fff',
                  border: '1px solid #1d4ed8',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontWeight: 700,
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
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
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
              background: '#fff',
              borderRadius: 10,
              padding: 20,
              width: 'min(420px, 100%)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Edit Member</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>Email</span>
                <input
                  type="email"
                  value={editingMember?.email || ''}
                  disabled
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    fontSize: 14,
                    background: '#f3f4f6',
                    color: '#6b7280',
                  }}
                />
              </label>
              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>Role</span>
                <select
                  value={editForm.role}
                  onChange={e =>
                    setEditForm(prev => ({ ...prev, role: e.target.value }))
                  }
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    fontSize: 14,
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
                gap: 10,
                marginTop: 16,
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
                  background: '#2563eb',
                  color: '#fff',
                  border: '1px solid #1d4ed8',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontWeight: 700,
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
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
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
              background: '#fff',
              borderRadius: 10,
              padding: 20,
              width: 'min(420px, 100%)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
              boxSizing: 'border-box',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Remove Member</h3>
            <p style={{ marginTop: 0, color: '#4b5563' }}>
              Remove {deletingMember?.email || 'this member'} from the project?
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 16,
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
                  background: '#dc2626',
                  color: '#fff',
                  border: '1px solid #b91c1c',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isSubmitting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectMembersPage;
