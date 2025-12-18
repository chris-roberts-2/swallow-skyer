import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { useAuth } from '../context';

const ProjectMembersPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects } = useAuth();
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const project = projects.find(p => p.id === id);

  useEffect(() => {
    const run = async () => {
      try {
        setError('');
        const resp = await apiClient.get(`/v1/projects/${id}/members`);
        setMembers(resp?.members || []);
      } catch (err) {
        setError(
          err?.payload?.error || err?.message || 'Unable to load project members'
        );
      }
    };
    run();
  }, [id]);

  return (
    <div style={{ padding: '16px 24px', maxWidth: 960, margin: '0 auto' }}>
      <button type="button" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2 style={{ marginTop: 0 }}>
        Project Members{project ? ` · ${project.name}` : ''}
      </h2>
      {error ? (
        <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>
      ) : null}
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 480,
          }}
        >
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>
                Name
              </th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>
                Company
              </th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>
                Email
              </th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>
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
                  <td style={{ padding: '8px 6px' }}>{name || '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{member.company || '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{member.email || '—'}</td>
                  <td style={{ padding: '8px 6px', textTransform: 'capitalize' }}>
                    {member.role || 'member'}
                  </td>
                </tr>
              );
            })}
            {!members.length ? (
              <tr>
                <td colSpan={4} style={{ padding: '12px 6px', color: '#6b7280' }}>
                  No members
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectMembersPage;

