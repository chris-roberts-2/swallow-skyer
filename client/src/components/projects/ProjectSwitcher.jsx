import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context';

const ProjectSwitcher = () => {
  const { activeProject, setActiveProject, projects, refreshProjects } =
    useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await refreshProjects({ redirectWhenEmpty: false });
    } catch (err) {
      setError('Unable to load projects');
    } finally {
      setLoading(false);
    }
  }, [refreshProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleChange = e => {
    const value = e.target.value;
    const selected =
      projects.find(p => p.id === value) || (value ? { id: value } : null);
    setActiveProject(selected);
  };

  if (loading && !projects.length) {
    return <div>Loading projects…</div>;
  }
  if (error) {
    return <div data-testid="project-switcher-error">{error}</div>;
  }

  return (
    <div data-testid="project-switcher" style={{ marginBottom: 12 }}>
      <label>
        Project:{' '}
        <select value={activeProject?.id || ''} onChange={handleChange}>
          <option value="">Select a project</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.role})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default ProjectSwitcher;
