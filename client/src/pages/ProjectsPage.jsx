import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import ProjectList from '../components/projects/ProjectList';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import EditProjectModal from '../components/projects/EditProjectModal';

const ProjectsPage = () => {
  const {
    projects,
    activeProject,
    setActiveProject,
    refreshProjects,
    isLoading,
    user,
  } = useAuth();
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const navigate = useNavigate();

  const activeProjectId = activeProject?.id || activeProject || null;

  useEffect(() => {
    refreshProjects({ redirectWhenEmpty: false });
  }, [refreshProjects]);

  const handleActivate = useCallback(
    project => {
      setActiveProject(project);
      navigate('/map');
    },
    [navigate, setActiveProject]
  );

  const handleEdit = useCallback(project => {
    setEditingProject(project);
  }, []);

  const handleEditSubmit = useCallback(
    async values => {
      if (!editingProject?.id) return;
      setError('');
      try {
        await apiClient.patch(`/v1/projects/${editingProject.id}`, values);
        setEditingProject(null);
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to update project. Please try again.'
        );
      }
    },
    [editingProject, refreshProjects]
  );

  const handleMembers = useCallback(
    project => {
      if (project?.id) {
        navigate(`/projects/${project.id}/members`);
      }
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async project => {
      if (!project?.id) return;
      setError('');
      try {
        await apiClient.delete(`/v1/projects/${project.id}`);
        if (activeProjectId === project.id) {
          setActiveProject(null);
        }
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to archive project. Please try again.'
        );
      }
    },
    [activeProjectId, refreshProjects, setActiveProject]
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
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to unjoin project. Please try again.'
        );
      }
    },
    [activeProjectId, refreshProjects, setActiveProject]
  );

  const handleCreate = useCallback(
    async ({ name, address }) => {
      setError('');
      try {
        const project = await apiClient.post('/v1/projects', {
          name,
          address,
        });
        await refreshProjects({ redirectWhenEmpty: false, force: true });
        setActiveProject(project);
        setIsModalOpen(false);
        navigate('/dashboard');
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to create project. Please try again.'
        );
      }
    },
    [navigate, refreshProjects, setActiveProject]
  );

  const userHasProjects = useMemo(
    () => (projects || []).length > 0,
    [projects]
  );

  const handleArchived = useCallback(() => {
    navigate('/projects/archived');
  }, [navigate]);

  return (
    <div className="projects-page page-container">
      <div className="page-content">
        <div className="page-header">
          <div className="page-header__left" />
          <div className="page-header__center">
            <h2 className="page-header__title">Projects</h2>
          </div>
          <div className="page-header__right">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              title="Create Project"
              className="btn-primary btn-icon"
            >
              +
            </button>
          </div>
        </div>
        {error && <div className="page-error">{error}</div>}
        {isLoading && !user ? (
          <div className="page-empty">Loading...</div>
        ) : (
          <ProjectList
            projects={projects}
            activeProjectId={activeProjectId}
            onActivate={handleActivate}
            onEdit={handleEdit}
            onMembers={handleMembers}
            onDelete={handleDelete}
            onUnjoin={handleUnjoin}
            currentUserId={user?.id || null}
          />
        )}
        {!userHasProjects && (
          <p className="page-empty">
            You have no projects yet. Create one to start uploading and viewing
            photos.
          </p>
        )}
        <div
          style={{
            marginTop: 'var(--space-lg)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleArchived}
            className="btn-secondary"
          >
            Archived Projects
          </button>
        </div>
        <CreateProjectModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreate}
        />
        <EditProjectModal
          open={!!editingProject}
          onClose={() => setEditingProject(null)}
          onSubmit={handleEditSubmit}
          initial={editingProject || {}}
        />
      </div>
    </div>
  );
};

export default ProjectsPage;
