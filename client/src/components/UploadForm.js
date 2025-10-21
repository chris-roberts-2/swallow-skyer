import React, { useState } from 'react';

const apiBase = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';

const UploadForm = () => {
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
      formData.append('latitude', latitude);
      formData.append('longitude', longitude);
      if (takenAt) formData.append('timestamp', takenAt);

      // Use v1 upload route
      const res = await fetch(`${apiBase}/api/v1/photos/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Upload failed');
      }

      alert('Uploaded! Reload the map to verify.');
      // reset
      setFile(null);
      setLatitude('');
      setLongitude('');
      setTakenAt('');
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
