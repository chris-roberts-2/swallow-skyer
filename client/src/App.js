import React, { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PhotoStack from './components/map/PhotoStack';
import UploadForm from './components/UploadForm';
import './App.css';
import PhotoMapLive from './PhotoMapLive';

// Sample data for testing
const samplePhotos = [
  {
    id: 1,
    caption: 'Sample Photo 1',
    latitude: 37.7749,
    longitude: -122.4194,
    url: 'https://via.placeholder.com/300x200/4CAF50/white?text=Sample+Photo+1',
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    caption: 'Sample Photo 2',
    latitude: 37.7849,
    longitude: -122.4094,
    url: 'https://via.placeholder.com/300x200/2196F3/white?text=Sample+Photo+2',
    createdAt: '2024-01-02',
  },
];

// Replace Home with a status/dashboard and uploads tree
const HomePage = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiBase =
    process.env.REACT_APP_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    'http://127.0.0.1:5000';

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/uploads/list`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load uploads');
        setFiles(Array.isArray(data.files) ? data.files : []);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        setError(e.message || 'Failed to load uploads');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [apiBase]);

  const org =
    process.env.REACT_APP_ORG_NAME ||
    'Swallow Robotics (set REACT_APP_ORG_NAME)';
  const project =
    process.env.REACT_APP_PROJECT_NAME ||
    'Swallow Skyer (set REACT_APP_PROJECT_NAME)';
  const user =
    process.env.REACT_APP_USER_NAME ||
    'Unknown User (set REACT_APP_USER_NAME)';

  return (
    <div className="home-page">
      <h1>Home</h1>
      <div style={{ marginBottom: 12 }}>
        <div><strong>Organization:</strong>&nbsp;{org}</div>
        <div><strong>Project:</strong>&nbsp;{project}</div>
        <div><strong>User:</strong>&nbsp;{user}</div>
      </div>
      <h3>Raw Images (uploads/)</h3>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: 'red' }}>{error}</div>
      ) : files.length === 0 ? (
        <div>No files found.</div>
      ) : (
        <ul style={{ lineHeight: 1.6 }}>
          {files.map(f => (
            <li key={f.path}>
              <a href={`${apiBase}/${f.path}`} target="_blank" rel="noreferrer">
                {f.path}
              </a>{' '}
              <span style={{ color: '#666', fontSize: 12 }}>
                ({Math.round((f.size || 0) / 1024)} KB)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// (Old welcome removed; replaced with dashboard above)

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Swallow Skyer</h1>
          <nav>
            <a href="/">Home</a> | <a href="/map">Map</a>
          </nav>
        </header>

        <main className="App-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/map" element={<PhotoMapLive />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
