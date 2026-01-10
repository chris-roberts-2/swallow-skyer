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
      if (project?.id) {
        apiClient.post(`/v1/projects/${project.id}/access`).catch(() => {});
      }
      navigate('/map');
    },
    [navigate, setActiveProject]
  );

  // Ensure active project access timestamp is recorded on page load
  useEffect(() => {
    if (activeProject?.id) {
      apiClient.post(`/v1/projects/${activeProject.id}/access`).catch(() => {});
    }
  }, [activeProject]);

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
        await refreshProjects({ redirectWhenEmpty: false });
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
        await refreshProjects({ redirectWhenEmpty: false });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to delete project. Please try again.'
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
        await refreshProjects({ redirectWhenEmpty: false });
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
        await refreshProjects({ redirectWhenEmpty: false });
        setActiveProject(project);
        setIsModalOpen(false);
        navigate('/map');
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
          <h2 style={{ margin: 0 }}>Projects</h2>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            title="Create Project"
            style={{
              borderRadius: '50%',
              width: 36,
              height: 36,
              border: '1px solid #e0e0e0',
              background: '#f7f9fc',
              fontSize: 20,
              fontWeight: 600,
              lineHeight: '32px',
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
        {error && (
          <div
            style={{
              marginBottom: 12,
              color: 'red',
            }}
          >
            {error}
          </div>
        )}
        {isLoading && !user ? (
          <div>Loading...</div>
        ) : (
          <ProjectList
            projects={projects}
            activeProjectId={activeProjectId}
            onActivate={handleActivate}
            onEdit={handleEdit}
            onMembers={handleMembers}
            onDelete={handleDelete}
            onUnjoin={handleUnjoin}
          />
        )}
        {!userHasProjects && (
          <p style={{ marginTop: 12 }}>
            You have no projects yet. Create one to start uploading and viewing
            photos.
          </p>
        )}
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
