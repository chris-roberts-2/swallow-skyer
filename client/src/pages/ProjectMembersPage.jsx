import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { useAuth } from '../context';

const ProjectMembersPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, activeProject, setActiveProject, roleForActiveProject } =
    useAuth();
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', role: 'collaborator' });

  const project = projects.find(p => p.id === id) || null;
  const activeProjectId = activeProject?.id || activeProject || null;
  const currentProjectId = id || activeProjectId;

  const currentRole = useMemo(
    () => (currentProjectId ? roleForActiveProject(currentProjectId) : null),
    [currentProjectId, roleForActiveProject]
  );
  const canManageMembers = useMemo(() => {
    const normalized = (currentRole || '').toLowerCase();
    return normalized === 'owner' || normalized === 'co-owner';
  }, [currentRole]);

  const roleOptions = [
    { label: 'Administrator', value: 'co-owner' },
    { label: 'Editor', value: 'collaborator' },
    { label: 'Viewer', value: 'viewer' },
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
      const resp = await apiClient.get(`/v1/projects/${currentProjectId}/members`);
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
      setAddForm({ email: '', role: 'collaborator' });
      await fetchMembers();
    } catch (err) {
      setError(
        err?.payload?.error || err?.message || 'Unable to add member. Please try again.'
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
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 640,
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '20%' }} />
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
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const name = [member.first_name, member.last_name]
                .filter(Boolean)
                .join(' ')
                .trim();
              return (
                <tr key={member.user_id} style={{ borderBottom: '1px solid #f1f3f5' }}>
                  <td style={{ padding: '8px 6px', textAlign: 'left' }}>{name || '—'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'left' }}>
                    {member.company || '—'}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'left' }}>
                    {member.email || '—'}
                  </td>
                  <td
                    style={{
                      padding: '8px 6px',
                      textTransform: 'capitalize',
                      textAlign: 'left',
                    }}
                  >
                    {member.role || 'member'}
                  </td>
                </tr>
              );
            })}
            {!members.length ? (
              <tr>
                <td colSpan={4} style={{ padding: '12px 8px', color: '#6b7280' }}>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
    </div>
  );
};

export default ProjectMembersPage;

