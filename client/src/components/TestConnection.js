import React from 'react';

const TestConnection = () => {
  const [status, setStatus] = React.useState('idle');
  const [message, setMessage] = React.useState('');

  const handleTest = async () => {
    const baseUrl = process.env.REACT_APP_API_BASE_URL || '';
    const url = `${baseUrl}/api/test/connection`;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatus('success');
      setMessage(JSON.stringify(data));
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Request failed');
    }
  };

  return (
    <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
      <h3>Test Backend Connection</h3>
      <button onClick={handleTest}>Test Connection</button>
      <div style={{ marginTop: 8 }}>
        <strong>Status:</strong> {status}
      </div>
      {message && (
        <pre style={{ background: '#f7f7f7', padding: 8, borderRadius: 4 }}>
          {message}
        </pre>
      )}
    </div>
  );
};

export default TestConnection;
