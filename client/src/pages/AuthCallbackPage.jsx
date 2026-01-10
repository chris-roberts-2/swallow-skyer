import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';

const parseHashParams = () => {
  const raw = (window.location.hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const error = params.get('error') || '';
  const error_code = params.get('error_code') || '';
  const error_description = params.get('error_description') || '';
  const access_token = params.get('access_token') || '';
  const refresh_token = params.get('refresh_token') || '';
  return {
    access_token,
    refresh_token,
    error,
    error_code,
    error_description,
    params,
  };
};

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    let isMounted = true;

    const finish = async () => {
      setError('');
      try {
        // Supabase email confirmation links can arrive in 2 shapes:
        // - PKCE flow (code in URL) -> exchangeCodeForSession
        // - implicit/hash flow (access_token & refresh_token in URL hash) -> setSession
        const {
          access_token,
          refresh_token,
          error: hashError,
          error_code,
          error_description,
        } = parseHashParams();

        if (hashError) {
          const friendly =
            error_code === 'otp_expired'
              ? 'This email confirmation link is invalid or has expired. Please request a new confirmation email and try again.'
              : decodeURIComponent(error_description || hashError);
          throw new Error(friendly);
        }

        if (access_token && refresh_token) {
          if (isMounted) {
            setStatus('Email confirmed. Finishing sign-in…');
          }
          const { data, error: setError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setError) {
            throw setError;
          }
          if (!data?.session) {
            throw new Error('No session returned from auth callback.');
          }
        } else {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exchangeError) {
            throw exchangeError;
          }
          if (!data?.session) {
            throw new Error('No session returned from auth callback.');
          }
        }
        if (isMounted) {
          navigate('/email-confirmed', { replace: true });
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Unable to complete sign-in.');
          setStatus('Email confirmation');
        }
      }
    };

    finish();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="auth-page">
      <h2>{status}</h2>
      {error ? (
        <>
          <div className="auth-error">{error}</div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="btn-format-1"
              onClick={() => navigate('/check-email', { replace: true })}
            >
              Resend confirmation email
            </button>
            <button
              type="button"
              className="btn-format-1"
              onClick={() => navigate('/login', { replace: true })}
            >
              Sign In
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AuthCallbackPage;
