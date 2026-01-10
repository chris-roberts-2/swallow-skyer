import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context';

const ProfileMenu = () => {
  const { user, profile, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const avatarLabel = useMemo(() => {
    const firstInitial = (profile?.firstName || '').trim().charAt(0);
    const lastInitial = (profile?.lastName || '').trim().charAt(0);
    if (firstInitial || lastInitial) {
      return `${firstInitial}${lastInitial}`.toUpperCase() || 'U';
    }
    const emailFallback = user?.email || '';
    const emailInitials = emailFallback.replace(/@.*$/, '').slice(0, 2);
    return (emailInitials || emailFallback.charAt(0) || 'U').toUpperCase();
  }, [profile, user]);

  const displayName = useMemo(() => {
    const nameParts = [profile?.firstName, profile?.lastName].filter(Boolean);
    return nameParts.length ? nameParts.join(' ') : '';
  }, [profile, user]);

  useEffect(() => {
    const handleOutsideClick = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setIsOpen(false);
    }
  };

  const handleGoToProfile = () => {
    navigate('/profile');
    setIsOpen(false);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        type="button"
        className="profile-menu__trigger"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Open profile menu"
      >
        <span className="profile-menu__avatar" aria-hidden="true">
          {avatarLabel}
        </span>
      </button>
      {isOpen && (
        <div className="profile-menu__panel">
          <div className="profile-menu__info">
            <span
              className="profile-menu__avatar profile-menu__avatar--inline"
              aria-hidden="true"
            >
              {avatarLabel}
            </span>
            <div>
              <div className="profile-menu__label">
                {displayName || user.email || 'User'}
              </div>
              {displayName ? (
                <div className="profile-menu__email">{user.email}</div>
              ) : null}
            </div>
          </div>
          <div className="profile-menu__actions profile-menu__actions--inline">
            <button
              type="button"
              className="profile-menu__action btn-format-1"
              onClick={handleGoToProfile}
            >
              Profile
            </button>
            <button
              type="button"
              className="profile-menu__action btn-format-1"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
