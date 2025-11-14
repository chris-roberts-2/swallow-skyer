import React, { useState } from 'react';

const envBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5001';

const UploadForm = ({ onUploaded }) => {
  const [file, setFile] = useState(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const onSubmit = async e => {
    e.preventDefault();
    if (!file || latitude === '' || longitude === '') {
      alert('Please select a file and enter latitude and longitude.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      // Normalize coordinates for USA-only usage:
      // If longitude is positive, assume West hemisphere and invert.
      const latNum = Number(latitude);
      let lngNum = Number(longitude);
      if (!Number.isNaN(lngNum) && lngNum > 0) {
        lngNum = -Math.abs(lngNum);
      }
      formData.append('latitude', String(latNum));
      formData.append('longitude', String(lngNum));
      if (takenAt) formData.append('timestamp', takenAt);

      // Try preferred API bases in order (favor 5001 to avoid macOS AirPlay on 5000)
      const candidates = Array.from(
        new Set(
          [
            envBase ? `${envBase.replace(/\/$/, '')}/api/v1/photos/upload` : null,
          ].filter(Boolean)
        )
      );

      let lastError = new Error('Upload failed');
      for (const base of candidates) {
        try {
          const res = await fetch(base, {
            method: 'POST',
            body: formData,
            headers: {
              Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
            },
          });
          // Try to parse JSON, fallback to text for better diagnostics
          let payload = null;
          try {
            payload = await res.json();
          } catch {
            try {
              const txt = await res.text();
              payload = { message: txt };
            } catch {
              payload = {};
            }
          }
          if (!res.ok) {
            lastError = new Error(
              (payload && (payload.message || payload.error)) ||
                `Upload failed (status ${res.status})`
            );
            // try next base
            // eslint-disable-next-line no-continue
            continue;
          }
          if (typeof onUploaded === 'function') {
            try { onUploaded(); } catch (_) {}
          }
          alert('Uploaded!');
          // reset
          setFile(null);
          setLatitude('');
          setLongitude('');
          setTakenAt('');
          return;
        } catch (err) {
          lastError = err;
          // try next base
          // eslint-disable-next-line no-continue
          continue;
        }
      }
      throw lastError;
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: 8,
      }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={e => setFile(e.target.files?.[0] || null)}
      />
      <input
        type="number"
        step="any"
        placeholder="Latitude"
        value={latitude}
        onChange={e => setLatitude(e.target.value)}
        style={{ width: 140 }}
      />
      <input
        type="number"
        step="any"
        placeholder="Longitude"
        value={longitude}
        onChange={e => setLongitude(e.target.value)}
        style={{ width: 140 }}
      />
      <input
        type="datetime-local"
        placeholder="Taken at"
        value={takenAt}
        onChange={e => setTakenAt(e.target.value)}
      />
      <button type="submit" disabled={isUploading || !file}>
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>
    </form>
  );
};

export default UploadForm;
