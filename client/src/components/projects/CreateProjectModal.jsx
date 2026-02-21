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
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div className="modal-body">
        <h3 className="modal-header">Create Project</h3>
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
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
            }}
          >
            Address (optional)
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Street, city, etc."
              style={{
                width: '100%',
                padding: 'var(--space-sm) var(--space-md)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-base)',
                transition: 'border-color 0.2s ease',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;
