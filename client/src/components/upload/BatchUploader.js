import React, { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../context';

const apiBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

const buildApiUrl = () =>
  `${(apiBase || '').replace(/\/$/, '')}/api/v1/photos/upload`;

const BatchUploader = () => {
  const { activeProject } = useAuth();
  const [files, setFiles] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback(newFiles => {
    if (!newFiles?.length) return;
    const next = [...files, ...Array.from(newFiles)];
    setFiles(next);
    const nextStatuses = { ...statuses };
    Array.from(newFiles).forEach(f => {
      nextStatuses[f.name] = 'pending';
    });
    setStatuses(nextStatuses);
  }, [files, statuses]);

  const handleInputChange = e => {
    addFiles(e.target.files);
  };

  const handleDragOver = e => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = e => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = e => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer?.files);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!files.length) return;
    setIsSubmitting(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    if (activeProject) {
      formData.append('project_id', activeProject);
    }

    const accessToken = localStorage.getItem('access_token') || '';
    try {
      const res = await fetch(buildApiUrl(), {
        method: 'POST',
        body: formData,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.message || payload?.error || `Upload failed (${res.status})`
        );
      }
      const nextStatuses = {};
      (payload?.uploaded || []).forEach(item => {
        nextStatuses[item.original_filename] = 'done';
      });
      files.forEach(f => {
        if (!nextStatuses[f.name]) {
          nextStatuses[f.name] = 'done';
        }
      });
      setStatuses(nextStatuses);
    } catch (err) {
      const nextStatuses = {};
      files.forEach(f => {
        nextStatuses[f.name] = 'error';
      });
      setStatuses(nextStatuses);
      // eslint-disable-next-line no-alert
      alert(err.message || 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div
          data-testid="dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: '2px dashed #999',
            padding: 16,
            marginBottom: 12,
            background: isDragging ? '#f0f6ff' : '#fff',
            cursor: 'pointer',
          }}
          onClick={() => inputRef.current?.click()}
        >
          <p style={{ margin: 0 }}>
            Drag & drop images here or click to select files (multiple allowed)
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleInputChange}
          />
        </div>
        <button type="submit" disabled={isSubmitting || !files.length}>
          {isSubmitting ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      {files.length > 0 && (
        <ul data-testid="file-list">
          {files.map(file => (
            <li key={file.name}>
              {file.name} — {statuses[file.name] || 'pending'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BatchUploader;

