import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';

const EmailConfirmedPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="auth-page">
      <h2>Email Confirmed</h2>
      <p style={{ maxWidth: 560 }}>
        Your email has been confirmed. You can continue into the portal.
      </p>
      <div
        style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}
      >
        {user ? (
          <button
            type="button"
            className="btn-format-1"
            onClick={() => navigate('/map', { replace: true })}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn-format-1"
            onClick={() => navigate('/login', { replace: true })}
          >
            Sign In
          </button>
        )}
      </div>
    </div>
  );
};

export default EmailConfirmedPage;
