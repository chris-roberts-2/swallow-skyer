import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context';

const RegisterPage = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState({
    firstName: '',
    lastName: '',
    company: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = event => {
    const { name, value } = event.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await signup(formValues.email, formValues.password, {
        firstName: formValues.firstName,
        lastName: formValues.lastName,
        company: formValues.company,
      });
      navigate('/map', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to register');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h2>Create an account</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-form__row">
          <label htmlFor="firstName">
            First name *
            <input
              id="firstName"
              name="firstName"
              type="text"
              value={formValues.firstName}
              onChange={handleChange}
              required
            />
          </label>
          <label htmlFor="lastName">
            Last name *
            <input
              id="lastName"
              name="lastName"
              type="text"
              value={formValues.lastName}
              onChange={handleChange}
              required
            />
          </label>
        </div>
        <label htmlFor="company">
          Company (optional)
          <input
            id="company"
            name="company"
            type="text"
            value={formValues.company}
            onChange={handleChange}
            placeholder="Company or organization"
          />
        </label>
        <label htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            value={formValues.email}
            onChange={handleChange}
            required
          />
        </label>
        <label htmlFor="password">
          Password
          <div className="auth-input-with-toggle">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formValues.password}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              className="auth-toggle"
              onClick={() => setShowPassword(prev => !prev)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        {error ? <div className="auth-error">{error}</div> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>
      <div className="auth-footer">
        Already have an account? <Link to="/login">Login</Link>
      </div>
    </div>
  );
};

export default RegisterPage;
