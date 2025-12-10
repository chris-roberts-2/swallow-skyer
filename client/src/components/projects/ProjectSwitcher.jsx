import React, { useEffect, useState, useCallback } from 'react';
import apiClient from '../../services/api';
import { useAuth } from '../../context';

const ProjectSwitcher = () => {
  const { activeProject, setActiveProject, setProjectRole } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await apiClient.get('/v1/projects');
      const list = resp.projects || [];
      setProjects(list);
      list.forEach(p => {
        if (p.id && p.role) {
          setProjectRole(p.id, p.role);
        }
      });
      if (!activeProject && list.length) {
        setActiveProject(list[0].id);
      }
    } catch (err) {
      setError('Unable to load projects');
    } finally {
      setLoading(false);
    }
  }, [activeProject, setActiveProject, setProjectRole]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleChange = e => {
    const value = e.target.value;
    setActiveProject(value || null);
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
        <select value={activeProject || ''} onChange={handleChange}>
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

