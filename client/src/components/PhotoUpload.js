import React from 'react';

const PhotoUpload = () => {
  const [file, setFile] = React.useState(null);
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [status, setStatus] = React.useState('idle');
  const [message, setMessage] = React.useState('');
  const [progress, setProgress] = React.useState(0);

  const onFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    setProgress(0);

    if (!file) {
      setStatus('error');
      setMessage('Please select an image file.');
      return;
    }
    if (!latitude || !longitude) {
      setStatus('error');
      setMessage('Please enter latitude and longitude.');
      return;
    }

    try {
      const baseUrl = process.env.REACT_APP_API_BASE_URL || '';
      const url = `${baseUrl}/api/photos/upload`;

      const form = new FormData();
      form.append('file', file);
      form.append('latitude', latitude);
      form.append('longitude', longitude);
      if (userId) form.append('user_id', userId);

      // Use XMLHttpRequest to track upload progress
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            setProgress(percent);
          }
        };

        xhr.onload = () => {
          const text = xhr.responseText || '';
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(text);
              setStatus('success');
              setMessage(JSON.stringify(data));
              resolve();
            } catch (err) {
              setStatus('error');
              setMessage('Invalid JSON response');
              reject(err);
            }
          } else {
            try {
              const errJson = text ? JSON.parse(text) : null;
              const errMsg = errJson?.message || `HTTP ${xhr.status}`;
              setStatus('error');
              setMessage(errMsg);
              reject(new Error(errMsg));
            } catch (_) {
              setStatus('error');
              setMessage(`HTTP ${xhr.status}`);
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => {
          setStatus('error');
          setMessage('Network error');
          reject(new Error('Network error'));
        };

        xhr.send(form);
      });
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Upload failed');
    }
  };

  return (
    <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
      <h3>Upload Photo</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>
            File:
            <input type="file" accept="image/*" onChange={onFileChange} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Latitude:
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Longitude:
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            User ID (optional):
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </label>
        </div>
        <button type="submit">Upload</button>
      </form>
      {status === 'loading' && (
        <div style={{ marginTop: 8 }}>
          <div>Uploading... {progress}%</div>
          <div
            style={{
              marginTop: 4,
              width: '100%',
              background: '#eee',
              height: 8,
              borderRadius: 4,
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                background: '#4caf50',
                height: '100%',
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      )}
      {status !== 'idle' && message && (
        <pre style={{ marginTop: 8, background: '#f7f7f7', padding: 8 }}>
          {message}
        </pre>
      )}
    </div>
  );
};

export default PhotoUpload;


