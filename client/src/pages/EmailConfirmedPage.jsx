import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';

const EmailConfirmedPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="auth-page-wrapper">
      <div className="auth-brand">
        <span className="auth-brand-name">Swallow Robotics</span>
        <span className="auth-brand-tagline">Flight Operations Platform</span>
      </div>
      <div className="auth-page">
        <h2>Email Confirmed</h2>
        <p>Your email has been confirmed. You can continue into the portal.</p>
        <div className="auth-actions">
          {user ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/map', { replace: true })}
            >
              Continue to Portal
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/login', { replace: true })}
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailConfirmedPage;
