import React from 'react';

const ProjectList = ({ projects, activeProjectId, onActivate }) => {
  if (!projects || projects.length === 0) {
    return <div>No projects yet.</div>;
  }

  return (
    <div data-testid="project-list">
      {projects.map(project => {
        const isActive = project.id === activeProjectId;
        return (
          <div
            key={project.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: 12,
              marginBottom: 8,
              background: isActive ? '#f0f6ff' : '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{project.name}</div>
              {project.description && (
                <div style={{ color: '#666' }}>{project.description}</div>
              )}
              <div style={{ fontSize: 12, color: '#555' }}>
                Role: {project.role || 'member'}
              </div>
              {isActive && (
                <div style={{ fontSize: 12, color: '#0070f3' }}>Active</div>
              )}
            </div>
            <div>
              {!isActive && (
                <button type="button" onClick={() => onActivate(project)}>
                  Set Active
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectList;
