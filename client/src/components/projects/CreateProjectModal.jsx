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
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: 24,
          borderRadius: 8,
          width: 400,
          maxWidth: '90%',
        }}
      >
        <h3>Create Project</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Name (required)
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Address (optional)
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Street, city, etc."
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
