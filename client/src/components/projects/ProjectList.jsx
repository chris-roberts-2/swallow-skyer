import React, { useEffect, useState, useCallback } from 'react';

const ProjectList = ({
  projects,
  activeProjectId,
  onActivate,
  onEdit,
  onMembers,
  onDelete,
  onUnjoin,
  onUnarchive,
  currentUserId,
  isArchivedView = false,
}) => {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const [menuOpenId, setMenuOpenId] = useState(null);

  const closeMenu = useCallback(() => setMenuOpenId(null), []);

  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('.project-card-menu')) {
        closeMenu();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [closeMenu]);

  if (safeProjects.length === 0) {
    return <div>No projects yet.</div>;
  }

  const activeProject = safeProjects.find(p => p.id === activeProjectId);
  const otherProjects = safeProjects.filter(p => p.id !== activeProjectId);

  const getCardStyle = (isActive, isMenuOpen) => ({
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-lg)',
    textAlign: 'left',
    background: isActive
      ? 'var(--color-surface-secondary)'
      : 'var(--color-surface-primary)',
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
    position: 'relative',
    overflow: 'visible',
    zIndex: isMenuOpen ? 50 : isActive ? 5 : 1,
  });

  const renderCard = (project, isActive = false) => {
    const role = (project.role || '').toLowerCase();
    const canManageProject = role === 'owner' || role === 'administrator';
    const isOwner = role === 'owner';
    const isCreator = project.owner_id && currentUserId === project.owner_id;

    const isMenuOpen = menuOpenId === project.id;

    return (
      <div
        key={project.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          closeMenu();
          if (!isArchivedView) {
            onActivate(project);
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            closeMenu();
            if (!isArchivedView) {
              onActivate(project);
            }
          }
        }}
        style={getCardStyle(isActive, isMenuOpen)}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--space-sm)',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--font-size-md)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              {project.name}
            </div>
            {project.address ? (
              <div
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {project.address}
              </div>
            ) : null}
          </div>
          <div
            className="project-card-menu"
            style={{ position: 'relative', zIndex: isMenuOpen ? 60 : 1 }}
          >
            <button
              type="button"
              aria-label="Project actions"
              onClick={e => {
                e.stopPropagation();
                setMenuOpenId(prev =>
                  prev === project.id ? null : project.id
                );
              }}
              className="btn-secondary btn-icon-sm"
            >
              ⋮
            </button>
            {isMenuOpen ? (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: 'var(--color-surface-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 70,
                  minWidth: 180,
                  padding: 'var(--space-xs) 0',
                }}
                onClick={e => e.stopPropagation()}
              >
                {isArchivedView ? (
                  <button
                    type="button"
                    className="btn-menu-item"
                    onClick={() => {
                      closeMenu();
                      onUnarchive(project);
                    }}
                  >
                    Unarchive
                  </button>
                ) : canManageProject ? (
                  <>
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => {
                        closeMenu();
                        onEdit(project);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => {
                        closeMenu();
                        onMembers(project);
                      }}
                    >
                      Project Members
                    </button>
                    {isOwner ? (
                      <button
                        type="button"
                        className="btn-menu-item btn-menu-item-destructive"
                        onClick={() => {
                          closeMenu();
                          onDelete(project);
                        }}
                      >
                        Archive
                      </button>
                    ) : null}
                    {!isCreator ? (
                      <button
                        type="button"
                        className="btn-menu-item"
                        onClick={() => {
                          closeMenu();
                          onUnjoin(project);
                        }}
                      >
                        Unjoin
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => {
                        closeMenu();
                        onMembers(project);
                      }}
                    >
                      Project Members
                    </button>
                    {!isCreator ? (
                      <button
                        type="button"
                        className="btn-menu-item"
                        onClick={() => {
                          closeMenu();
                          onUnjoin(project);
                        }}
                      >
                        Unjoin
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {project.role || 'Viewer'}
          </div>
          {isActive ? (
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-primary)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              Active
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div data-testid="project-list" className="project-list-container">
      {activeProject ? <div>{renderCard(activeProject, true)}</div> : null}

      <div className="project-list-grid">
        {otherProjects.map(project => renderCard(project, false))}
      </div>
    </div>
  );
};

export default ProjectList;
