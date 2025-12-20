import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context';

const ProfilePage = () => {
  const {
    user,
    profile,
    logout,
    refreshProfile,
    updateProfile,
    updateLogin,
  } = useAuth();

  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingLogin, setIsEditingLogin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
    company: '',
  });
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    refreshProfile({ ensureExists: true });
  }, [refreshProfile]);

  useEffect(() => {
    if (!isEditingUser) {
      setUserForm({
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        company: profile?.company || '',
      });
    }
    if (!isEditingLogin) {
      setLoginForm({
        email: profile?.email || user?.email || '',
        password: '',
      });
    }
  }, [profile, user, isEditingUser, isEditingLogin]);

  const displayName = useMemo(() => {
    const parts = [profile?.firstName, profile?.lastName].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Add your name';
  }, [profile]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Failed to logout', err);
    }
  };

  const handleSaveUser = async () => {
    setError('');
    setStatus('');

    if (!userForm.firstName.trim() || !userForm.lastName.trim()) {
      setError('Name is required (first and last).');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        company: userForm.company,
      });
      setStatus('Profile updated.');
      setIsEditingUser(false);
    } catch (err) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLogin = async () => {
    setError('');
    setStatus('');

    if (!loginForm.email.trim()) {
      setError('Email is required.');
      return;
    }

    setIsSaving(true);
    try {
      await updateLogin({
        email: loginForm.email,
        password: loginForm.password || undefined,
      });
      setStatus(
        loginForm.password
          ? 'Login email/password updated.'
          : 'Login email updated.'
      );
      setIsEditingLogin(false);
      setLoginForm(prev => ({ ...prev, password: '' }));
    } catch (err) {
      setError(err?.message || 'Failed to update login.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <h2>Profile</h2>

      {(error || status) && (
        <div
          className={`profile-page__alert ${
            error ? 'profile-page__alert--error' : 'profile-page__alert--info'
          }`}
        >
          {error || status}
        </div>
      )}

      <div className="profile-section">
        <div className="profile-section__header">
          <h3>User</h3>
          {!isEditingUser ? (
            <button
              type="button"
              className="profile-section__edit profile-section__edit--ghost"
              onClick={() => {
                setUserForm({
                  firstName: profile?.firstName || '',
                  lastName: profile?.lastName || '',
                  company: profile?.company || '',
                });
                setIsEditingUser(true);
                setError('');
                setStatus('');
              }}
            >
              Edit
            </button>
          ) : null}
        </div>
        <div className="profile-section__body">
          <div className={`profile-card ${isEditingUser ? 'profile-card--edit' : ''}`}>
            <div className="profile-card__row">
              <strong>Name:</strong>
              {isEditingUser ? (
                <div className="profile-card__inputs" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    name="firstName"
                    value={userForm.firstName}
                    onChange={e =>
                      setUserForm(prev => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                    autoFocus
                    placeholder="First name"
                    required
                  />
                  <input
                    type="text"
                    name="lastName"
                    value={userForm.lastName}
                    onChange={e =>
                      setUserForm(prev => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                    placeholder="Last name"
                    required
                  />
                </div>
              ) : (
                <span>{displayName}</span>
              )}
            </div>
            <div className="profile-card__row">
              <strong>Email:</strong>
              <span>{profile?.email || user?.email || 'Unknown'}</span>
            </div>
            <div className="profile-card__row">
              <strong>Company:</strong>
              {isEditingUser ? (
                <input
                  type="text"
                  name="company"
                  value={userForm.company}
                  onChange={e =>
                    setUserForm(prev => ({
                      ...prev,
                      company: e.target.value,
                    }))
                  }
                  placeholder="Company name"
                />
              ) : (
                <span>{profile?.company || 'Add your company'}</span>
              )}
            </div>
            {isEditingUser && (
              <div className="profile-card__actions">
                <button
                  type="button"
                  onClick={handleSaveUser}
                  disabled={isSaving}
                  className="btn-format-1"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingUser(false);
                    setError('');
                    setStatus('');
                    setUserForm({
                      firstName: profile?.firstName || '',
                      lastName: profile?.lastName || '',
                      company: profile?.company || '',
                    });
                  }}
                  className="btn-format-1"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section__header">
          <h3>Login</h3>
          {!isEditingLogin ? (
            <button
              type="button"
              className="profile-section__edit profile-section__edit--ghost"
              onClick={() => {
                setLoginForm({
                  email: profile?.email || user?.email || '',
                  password: '',
                });
                setIsEditingLogin(true);
                setError('');
                setStatus('');
              }}
            >
              Edit
            </button>
          ) : null}
        </div>
        <div className="profile-section__body">
          <div className={`profile-card ${isEditingLogin ? 'profile-card--edit' : ''}`}>
            <div className="profile-card__row">
              <strong>Email:</strong>
              {isEditingLogin ? (
                <input
                  type="email"
                  name="loginEmail"
                  value={loginForm.email}
                  onChange={e =>
                    setLoginForm(prev => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  required
                />
              ) : (
                <span>{profile?.email || user?.email || 'Unknown'}</span>
              )}
            </div>
            <div className="profile-card__row">
              <strong>Password:</strong>
              {isEditingLogin ? (
                <input
                  type="password"
                  name="loginPassword"
                  value={loginForm.password}
                  onChange={e =>
                    setLoginForm(prev => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  placeholder="Leave blank to keep current password"
                />
              ) : (
                <span>••••••••</span>
              )}
            </div>
            {isEditingLogin && (
              <div className="profile-card__actions">
                <button
                  type="button"
                  onClick={handleSaveLogin}
                  disabled={isSaving}
                  className="btn-format-1"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingLogin(false);
                    setError('');
                    setStatus('');
                    setLoginForm({
                      email: profile?.email || user?.email || '',
                      password: '',
                    });
                  }}
                  className="btn-format-1"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="profile-card__logout"
        onClick={handleLogout}
      >
        Logout
      </button>
    </div>
  );
};

export default ProfilePage;
