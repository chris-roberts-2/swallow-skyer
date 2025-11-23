import React, { useMemo } from 'react';
import { useAuth } from '../context';

const ProfilePage = () => {
  const { user, session, logout } = useAuth();

  const expiresAt = useMemo(() => {
    if (!session?.expires_at) {
      return 'Unknown';
    }
    return new Date(session.expires_at * 1000).toLocaleString();
  }, [session]);

  const sessionCreated = useMemo(() => {
    if (session?.created_at) {
      return new Date(session.created_at).toLocaleString();
    }
    if (user?.created_at) {
      return new Date(user.created_at).toLocaleString();
    }
    return 'Unknown';
  }, [session, user]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to logout', error);
    }
  };

  return (
    <div className="profile-page">
      <h2>Profile</h2>
      <div className="profile-card">
        <div className="profile-card__row">
          <strong>Email:</strong>
          <span>{user?.email || 'unknown'}</span>
        </div>
        <div className="profile-card__row">
          <strong>User ID:</strong>
          <span>{user?.id || 'unknown'}</span>
        </div>
        <div className="profile-card__row">
          <strong>Session expires:</strong>
          <span>{expiresAt}</span>
        </div>
        <div className="profile-card__row">
          <strong>Session created:</strong>
          <span>{sessionCreated}</span>
        </div>
        <button
          type="button"
          className="profile-card__logout"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
