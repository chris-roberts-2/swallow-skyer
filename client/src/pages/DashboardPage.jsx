import React, { useEffect, useState } from 'react';
import { useAuth } from '../context';
import apiClient from '../services/api';

const ROLE_LABELS = {
  owner: 'Owner',
  administrator: 'Administrator',
  editor: 'Editor',
  viewer: 'Viewer',
};

const StatCard = ({ label, value }) => (
  <div className="surface-card" style={{ textAlign: 'center' }}>
    <div
      style={{
        fontSize: 'var(--font-size-3xl)',
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-primary)',
        lineHeight: 1,
        marginBottom: 'var(--space-xs)',
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--letter-spacing-wide)',
      }}
    >
      {label}
    </div>
  </div>
);

const parseCoord = raw => {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
};

const DashboardPage = () => {
  const { activeProject, projects, roleForActiveProject } = useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
  const projectData =
    (projects || []).find(p => p.id === activeProjectId) || null;
  const role = roleForActiveProject ? roleForActiveProject() : null;
  const normalizedRole = (role || '').toLowerCase();

  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    setSummary(null);
    apiClient
      .get(`/v1/projects/${activeProjectId}/summary`)
      .then(data => {
        if (!cancelled) setSummary(data);
      })
      .catch(err => {
        if (!cancelled)
          setError(err?.message || 'Unable to load project data.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  if (!activeProjectId) {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="page-header">
          <div className="page-header__center">
            <h2 className="page-header__title">Dashboard</h2>
          </div>
        </div>
        <p className="page-empty">Select a project to view its dashboard.</p>
      </div>
    );
  }

  const project = summary?.project || projectData || {};
  const photoCount = summary != null ? summary.photo_count : '—';
  const locationCount = summary != null ? summary.location_count : '—';
  const members = summary?.members || [];
  const addressCoord = parseCoord(project.address_coord);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">{project.name || 'Dashboard'}</h2>
          {normalizedRole && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--letter-spacing-wide)',
                background: 'var(--color-surface-secondary)',
                borderRadius: 'var(--radius-pill)',
                padding: '2px var(--space-sm)',
              }}
            >
              {ROLE_LABELS[normalizedRole] || role}
            </span>
          )}
        </div>
        <div className="page-header__right" />
      </div>

      {error && <div className="page-error">{error}</div>}

      {isLoading ? (
        <div className="page-empty">Loading...</div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'var(--space-md)',
            }}
          >
            <StatCard label="Photos" value={photoCount} />
            <StatCard label="Locations" value={locationCount} />
            <StatCard label="Members" value={members.length || '—'} />
          </div>

          {project.address && (
            <div className="surface-card">
              <h3
                style={{
                  margin: '0 0 var(--space-md) 0',
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                Location
              </h3>
              <p
                style={{
                  margin: '0 0 var(--space-xs) 0',
                  color: 'var(--color-text-primary)',
                }}
              >
                {project.address}
              </p>
              {addressCoord?.lat != null && addressCoord?.lng != null && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {Number(addressCoord.lat).toFixed(6)},{' '}
                  {Number(addressCoord.lng).toFixed(6)}
                </p>
              )}
            </div>
          )}

          <div className="surface-card surface-card--flush">
            <div
              style={{
                padding: 'var(--space-lg) var(--space-lg) var(--space-md)',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                Team
              </h3>
            </div>
            {members.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-md) var(--space-lg)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                No members found.
              </div>
            ) : (
              <table
                className="data-table"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'right' }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => {
                    const displayName =
                      [m.first_name, m.last_name].filter(Boolean).join(' ') ||
                      m.email ||
                      m.user_id;
                    return (
                      <tr key={m.user_id}>
                        <td>{displayName}</td>
                        <td style={{ color: 'var(--color-text-secondary)' }}>
                          {m.email || '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{m.role || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
