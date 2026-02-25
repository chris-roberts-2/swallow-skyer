import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useLocation,
} from 'react-router-dom';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';
import { AuthProvider, useAuth } from './context';
import AuthGuard from './components/auth/AuthGuard';
import ProfileMenu from './components/auth/ProfileMenu';
import PageLayout from './components/layout/PageLayout';
import {
  LoginPage,
  RegisterPage,
  MapPage,
  PhotosPage,
  ProfilePage,
  ProjectsPage,
  ArchivedProjectsPage,
  ProjectMembersPage,
  DashboardPage,
} from './pages';
import PhotoOptionsPage from './pages/PhotoOptionsPage';
import PublicProjectView from './pages/PublicProjectView';
import ConfirmEmailPage from './pages/ConfirmEmailPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import EmailConfirmedPage from './pages/EmailConfirmedPage';

const Header = () => {
  const { user } = useAuth();

  return (
    <header className="App-header">
      <div className="App-header__inner">
        <Link
          to="/projects"
          className="App-header__logoLink"
          aria-label="Go to Projects"
        >
          <img
            src={`${process.env.PUBLIC_URL}/logo192-white.png`}
            alt="Swallow Robotics"
            className="App-header__logo"
          />
        </Link>
        {user && <ProfileMenu />}
      </div>
    </header>
  );
};

const navLinkClass = ({ isActive }) =>
  isActive ? 'App-subnav__link App-subnav__link--active' : 'App-subnav__link';

const SecondaryNav = () => {
  const { user, activeProject } = useAuth();
  const hasActiveProject = !!(activeProject?.id || activeProject);

  if (!user) return null;

  return (
    <nav className="App-subnav" aria-label="Primary navigation">
      <div className="App-subnav__inner">
        <NavLink to="/projects" className={navLinkClass}>
          Projects
        </NavLink>
        {hasActiveProject && (
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
        )}
        {hasActiveProject && (
          <NavLink to="/photos" className={navLinkClass}>
            Photos
          </NavLink>
        )}
        <NavLink to="/map" className={navLinkClass}>
          Map
        </NavLink>
      </div>
    </nav>
  );
};

const RootRedirect = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Supabase email confirmation links may redirect back to the site root with
  // access tokens in the URL hash (/#access_token=...&type=signup) or errors
  // (/#error=access_denied&error_code=otp_expired...). Handle those here so
  // users don't get stuck on a blank/incorrect route.
  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    if (
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      hash.includes('error=')
    ) {
      return <AuthCallbackPage />;
    }
  }

  return <Navigate to={user ? '/map' : '/login'} replace />;
};

/**
 * AuthLayout — combines auth protection with the shared page layout frame.
 * Used for all authenticated routes except the full-screen map view.
 */
const AuthLayout = ({ children }) => (
  <AuthGuard>
    <PageLayout>{children}</PageLayout>
  </AuthGuard>
);

export function AppRoutes() {
  const location = useLocation();
  const showHeader = !(
    location.pathname.startsWith('/public') &&
    new URLSearchParams(location.search).get('embed') === '1'
  );

  return (
    <div className="App">
      {showHeader && <Header />}
      {showHeader && <SecondaryNav />}
      <main className="App-main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/check-email" element={<ConfirmEmailPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/email-confirmed" element={<EmailConfirmedPage />} />
          <Route
            path="/map"
            element={
              <AuthGuard>
                <MapPage />
              </AuthGuard>
            }
          />
          <Route
            path="/dashboard"
            element={
              <AuthLayout>
                <DashboardPage />
              </AuthLayout>
            }
          />
          <Route
            path="/photos"
            element={
              <AuthLayout>
                <PhotosPage />
              </AuthLayout>
            }
          />
          <Route
            path="/photos/:id/options"
            element={
              <AuthLayout>
                <PhotoOptionsPage />
              </AuthLayout>
            }
          />
          <Route path="/upload" element={<Navigate to="/photos" replace />} />
          <Route
            path="/projects"
            element={
              <AuthLayout>
                <ProjectsPage />
              </AuthLayout>
            }
          />
          <Route
            path="/projects/archived"
            element={
              <AuthLayout>
                <ArchivedProjectsPage />
              </AuthLayout>
            }
          />
          <Route
            path="/projects/:id/members"
            element={
              <AuthLayout>
                <ProjectMembersPage />
              </AuthLayout>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthLayout>
                <ProfilePage />
              </AuthLayout>
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
      <Router basename={process.env.PUBLIC_URL || '/'}>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
