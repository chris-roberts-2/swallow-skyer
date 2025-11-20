import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context';

const ProfileMenu = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const avatarLabel = useMemo(() => {
    if (!user?.email) {
      return 'U';
    }
    return user.email.charAt(0).toUpperCase();
  }, [user]);

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
        <span className="profile-menu__email">{user.email}</span>
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
              <div className="profile-menu__label">Signed in as</div>
              <div className="profile-menu__email">{user.email}</div>
            </div>
          </div>
          <button
            type="button"
            className="profile-menu__logout"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
