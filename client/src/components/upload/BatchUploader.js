import React, { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../context';
import { appendProjectId, requireProjectId } from '../../services/uploadHelper';

const apiBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

const buildApiUrl = () =>
  `${(apiBase || '').replace(/\/$/, '')}/api/photos/upload`;

const BatchUploader = ({ onForbidden, onUploaded, variant = 'full' }) => {
  const { activeProject } = useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
  const [files, setFiles] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  const performUpload = useCallback(
    async uploadFiles => {
      if (!uploadFiles.length) return;
      try {
        requireProjectId(activeProjectId);
      } catch (err) {
        alert(err.message);
        return;
      }
      setIsSubmitting(true);
      const formData = new FormData();
      uploadFiles.forEach(f => formData.append('files', f));
      appendProjectId(formData, activeProjectId);

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
        if (res.status === 403 && typeof onForbidden === 'function') {
          onForbidden();
        }
        if (!res.ok) {
          const errorMessage =
            payload?.message ||
            payload?.error ||
            (res.status === 403
              ? 'You do not have permission for this action.'
              : `Upload failed (${res.status})`);
          throw new Error(errorMessage);
        }
        const nextStatuses = {};
        (payload?.uploaded || []).forEach(item => {
          nextStatuses[item.original_filename] = 'done';
        });
        uploadFiles.forEach(f => {
          if (!nextStatuses[f.name]) {
            nextStatuses[f.name] = 'done';
          }
        });
        setStatuses(nextStatuses);
        setFiles([]);
        if (typeof onUploaded === 'function') {
          onUploaded(payload);
        }
      } catch (err) {
        const nextStatuses = {};
        uploadFiles.forEach(f => {
          nextStatuses[f.name] = 'error';
        });
        setStatuses(nextStatuses);
        // eslint-disable-next-line no-alert
        alert(err.message || 'Upload failed');
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeProjectId, onForbidden, onUploaded]
  );

  const addFiles = useCallback(
    newFiles => {
      if (!newFiles?.length) return;
      const next = [...files, ...Array.from(newFiles)];
      setFiles(next);
      const nextStatuses = { ...statuses };
      Array.from(newFiles).forEach(f => {
        nextStatuses[f.name] = 'pending';
      });
      setStatuses(nextStatuses);
      if (variant === 'compact') {
        performUpload(next);
      }
    },
    [files, performUpload, statuses, variant]
  );

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
    await performUpload(files);
  };

  const triggerFileSelect = () => inputRef.current?.click();

  if (variant === 'compact') {
    const activeBorder = isDragging ? '2px solid #1e88e5' : '1px solid #e5e7eb';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          data-testid="compact-drop"
          className="btn-format-1"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerFileSelect();
            }
          }}
          style={{
            borderRadius: '50%',
            width: 28,
            height: 28,
            minWidth: 28,
            border: activeBorder,
            background: isDragging ? '#f1f5f9' : '#f7f9fc',
            fontSize: 20,
            fontWeight: 700,
            lineHeight: '24px',
            textAlign: 'center',
            cursor: 'pointer',
            boxShadow: isDragging ? '0 0 0 3px rgba(30,136,229,0.18)' : 'none',
            transition: 'all 120ms ease',
          }}
          title="Upload photos"
        >
          {isSubmitting ? '…' : '+'}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleInputChange}
          />
        </div>
        {isSubmitting ? (
          <span style={{ fontSize: 12, color: '#6b7280' }}>Uploading…</span>
        ) : (
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Click or drop to upload
          </span>
        )}
      </div>
    );
  }

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
