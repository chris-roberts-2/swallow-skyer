import React, { useEffect, useState, useCallback } from 'react';

const menuItemStyle = {
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  transition: 'background 120ms ease',
};

const ProjectList = ({
  projects,
  activeProjectId,
  onActivate,
  onEdit,
  onMembers,
  onDelete,
  onUnjoin,
  currentUserId,
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

  const cardStyle = (isActive, isMenuOpen) => ({
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '12px 14px',
    textAlign: 'left',
    background: isActive ? '#f4f7ff' : '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
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
          onActivate(project);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            closeMenu();
            onActivate(project);
          }
        }}
        style={cardStyle(isActive, isMenuOpen)}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              {project.name}
            </div>
            {project.address ? (
              <div style={{ color: '#6b7280', fontSize: 12 }}>
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
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '50%',
                width: 28,
                height: 28,
                background: '#fff',
                cursor: 'pointer',
                lineHeight: '24px',
              }}
            >
              ⋮
            </button>
            {isMenuOpen ? (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  zIndex: 70,
                  minWidth: 180,
                  padding: '6px 0',
                }}
                onClick={e => e.stopPropagation()}
              >
                {canManageProject ? (
                  <>
                    <button
                      type="button"
                      style={menuItemStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#f5f7fb';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                      onClick={() => {
                        closeMenu();
                        onEdit(project);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={menuItemStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#f5f7fb';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                      }}
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
                        style={{ ...menuItemStyle, color: '#dc2626' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#fef2f2';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                        }}
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
                        style={menuItemStyle}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#f5f7fb';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                        }}
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
                      style={menuItemStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#f5f7fb';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                      }}
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
                        style={menuItemStyle}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#f5f7fb';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                        }}
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
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {project.role || 'Viewer'}
          </div>
          {isActive ? (
            <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
              Active
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="project-list"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {activeProject ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
          }}
        >
          {renderCard(activeProject, true)}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 16,
          width: '100%',
        }}
      >
        {otherProjects.map(project => renderCard(project, false))}
      </div>
    </div>
  );
};

export default ProjectList;
