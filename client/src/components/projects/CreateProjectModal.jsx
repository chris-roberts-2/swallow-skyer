import React, { useState, useEffect } from 'react';

const CreateProjectModal = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setAddress('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = e => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Project name is required');
      return;
    }
    onSubmit({ name: name.trim(), address: address.trim() || null });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(31, 58, 95, 0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-primary)',
          padding: 'var(--space-xl)',
          borderRadius: 'var(--radius-lg)',
          width: 400,
          maxWidth: '90%',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <h3
          style={{
            color: 'var(--color-text-primary)',
            margin: '0 0 var(--space-lg) 0',
          }}
        >
          Create Project
        </h3>
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
          }}
        >
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
            }}
          >
            Name (required)
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 'var(--space-sm) var(--space-md)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-base)',
                transition: 'border-color 0.2s ease',
              }}
            />
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
              color: 'var(--color-text-primary)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            Address (optional)
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-sm) var(--space-md)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-base)',
                transition: 'border-color 0.2s ease',
              }}
              placeholder="Street, city, etc."
            />
          </label>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-sm)',
              justifyContent: 'flex-end',
              marginTop: 'var(--space-md)',
            }}
          >
            <button type="button" onClick={onClose} className="btn-format-1">
              Cancel
            </button>
            <button type="submit" className="btn-format-1">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;
