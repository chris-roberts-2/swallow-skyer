import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';

const ConfirmEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const email = useMemo(() => location.state?.email || '', [location.state]);
  const [status, setStatus] = useState('');
  const [isSending, setIsSending] = useState(false);

  const resend = async () => {
    if (!email) {
      setStatus('Enter your email on the Register page, then come back here.');
      return;
    }
    setIsSending(true);
    setStatus('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) {
        throw error;
      }
      setStatus('Confirmation email re-sent. Please check your inbox.');
    } catch (err) {
      setStatus(err?.message || 'Unable to resend confirmation email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-page">
        <h2>Confirm your email</h2>
        <p>
          Signup successful. Please check your email to confirm your account
          before logging in.
        </p>
        {status ? (
          <p
            style={{
              color: 'var(--color-primary-dark)',
              fontSize: 'var(--font-size-base)',
              marginBottom: 0,
            }}
          >
            {status}
          </p>
        ) : null}
        <div className="auth-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={resend}
            disabled={isSending}
          >
            {isSending ? 'Sending…' : 'Resend confirmation email'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/login', { replace: true })}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmEmailPage;
