import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import ProjectList from '../components/projects/ProjectList';

const ArchivedProjectsPage = () => {
  const { activeProject, setActiveProject, user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const activeProjectId = activeProject?.id || activeProject || null;

  const fetchArchived = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const resp = await apiClient.get('/v1/projects?archived=true');
      setProjects(resp?.projects || []);
    } catch (err) {
      setError(
        err?.payload?.error ||
          err?.message ||
          'Unable to load archived projects. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  const handleActivate = useCallback(
    project => {
      setActiveProject(project);
      navigate('/map');
    },
    [navigate, setActiveProject]
  );

  const handleMembers = useCallback(
    project => {
      if (project?.id) {
        navigate(`/projects/${project.id}/members`);
      }
    },
    [navigate]
  );

  const handleUnjoin = useCallback(
    async project => {
      if (!project?.id) return;
      setError('');
      try {
        await apiClient.post(`/v1/projects/${project.id}/unjoin`);
        if (activeProjectId === project.id) {
          setActiveProject(null);
        }
        await fetchArchived();
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to unjoin project. Please try again.'
        );
      }
    },
    [activeProjectId, fetchArchived, setActiveProject]
  );

  const handleArchive = useCallback(
    async project => {
      if (!project?.id) return;
      setError('');
      try {
        await apiClient.delete(`/v1/projects/${project.id}`);
        if (activeProjectId === project.id) {
          setActiveProject(null);
        }
        await fetchArchived();
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to archive project. Please try again.'
        );
      }
    },
    [activeProjectId, fetchArchived, setActiveProject]
  );

  const hasProjects = useMemo(() => projects.length > 0, [projects]);

  return (
    <div
      className="projects-page"
      style={{
        width: '100%',
        padding: '12px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 'min(1200px, 100%)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0 }}>Archived Projects</h2>
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="btn-format-1"
          >
            Back to Projects
          </button>
        </div>
        {error ? (
          <div style={{ marginBottom: 12, color: 'red' }}>{error}</div>
        ) : null}
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <ProjectList
            projects={projects}
            activeProjectId={activeProjectId}
            onActivate={handleActivate}
            onEdit={() => {}}
            onMembers={handleMembers}
            onDelete={handleArchive}
            onUnjoin={handleUnjoin}
            currentUserId={user?.id || null}
          />
        )}
        {!hasProjects && !isLoading ? (
          <p style={{ marginTop: 12 }}>No archived projects yet.</p>
        ) : null}
      </div>
    </div>
  );
};

export default ArchivedProjectsPage;
