import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from 'react-router-dom';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';
import { AuthProvider, useAuth } from './context';
import AuthGuard from './components/auth/AuthGuard';
import ProfileMenu from './components/auth/ProfileMenu';
import {
  LoginPage,
  RegisterPage,
  MapPage,
  UploadPage,
  ProfilePage,
  ProjectsPage,
} from './pages';
import PublicProjectView from './pages/PublicProjectView';

const Header = () => {
  const { user, activeProject } = useAuth();
  const hasActiveProject = !!(activeProject?.id || activeProject);

  return (
    <header className="App-header">
      <div className="App-header__inner">
        <div className="App-header__brand">
          <h1>Swallow Skyer</h1>
          <nav className="App-nav">
            {user ? (
              <>
                <Link to="/map">Map</Link>
                <Link to="/projects">Projects</Link>
                {hasActiveProject && <Link to="/upload">Upload</Link>}
              </>
            ) : (
              <>
                <Link to="/login">Login</Link>
                <Link to="/register">Register</Link>
              </>
            )}
          </nav>
        </div>
        {user && <ProfileMenu />}
      </div>
    </header>
  );
};

const RootRedirect = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return <Navigate to={user ? '/map' : '/login'} replace />;
};

export function AppRoutes() {
  const location = useLocation();
  const showHeader =
    !(location.pathname.startsWith('/public') &&
      new URLSearchParams(location.search).get('embed') === '1');

  return (
    <div className="App">
      {showHeader && <Header />}
      <main className="App-main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/map"
            element={
              <AuthGuard>
                <MapPage />
              </AuthGuard>
            }
          />
          <Route
            path="/upload"
            element={
              <AuthGuard>
                <UploadPage />
              </AuthGuard>
            }
          />
          <Route
            path="/projects"
            element={
              <AuthGuard>
                <ProjectsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGuard>
                <ProfilePage />
              </AuthGuard>
            }
          />
          <Route path="/public/:token" element={<PublicProjectView />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
