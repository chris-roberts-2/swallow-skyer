import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import ProjectList from '../components/projects/ProjectList';

const ArchivedProjectsPage = () => {
  const { activeProject, setActiveProject, user, refreshProjects } = useAuth();
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

  const handleUnarchive = useCallback(
    async project => {
      if (!project?.id) return;
      setError('');
      try {
        await apiClient.patch(`/v1/projects/${project.id}`, {
          show_on_projects: true,
        });
        if (activeProjectId === project.id) {
          setActiveProject(null);
        }
        await fetchArchived();
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to unarchive project. Please try again.'
        );
      }
    },
    [activeProjectId, fetchArchived, refreshProjects, setActiveProject]
  );

  const hasProjects = useMemo(() => projects.length > 0, [projects]);

  return (
    <div className="projects-page page-container">
      <div className="page-content">
        <div className="page-header">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="btn-secondary"
          >
            ← Back
          </button>
          <h2 className="page-header__title">Archived Projects</h2>
        </div>
        {error ? <div className="page-error">{error}</div> : null}
        {isLoading ? (
          <div className="page-empty">Loading...</div>
        ) : (
          <ProjectList
            projects={projects}
            activeProjectId={activeProjectId}
            onActivate={handleActivate}
            onEdit={() => {}}
            onMembers={handleMembers}
            onDelete={() => {}}
            onUnjoin={handleUnjoin}
            onUnarchive={handleUnarchive}
            currentUserId={user?.id || null}
            isArchivedView
          />
        )}
        {!hasProjects && !isLoading ? (
          <p className="page-empty">No archived projects yet.</p>
        ) : null}
      </div>
    </div>
  );
};

export default ArchivedProjectsPage;
