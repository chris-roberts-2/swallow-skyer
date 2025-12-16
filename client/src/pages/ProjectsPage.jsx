import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import ProjectList from '../components/projects/ProjectList';
import CreateProjectModal from '../components/projects/CreateProjectModal';

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

  const handleCreate = useCallback(
    async ({ name, description }) => {
      setError('');
      try {
        const project = await apiClient.post('/v1/projects', {
          name,
          description,
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

  const userHasProjects = useMemo(() => (projects || []).length > 0, [projects]);

  return (
    <div className="projects-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Projects</h2>
        <button type="button" onClick={() => setIsModalOpen(true)}>
          Create Project
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
    </div>
  );
};

export default ProjectsPage;
