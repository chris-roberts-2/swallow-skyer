import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import supabase from '../lib/supabaseClient';

const SESSION_STORAGE_KEY = 'supabaseSession';
const PROJECT_ROLES_STORAGE_KEY = 'projectRoles';

const readStoredSession = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

const persistSession = session => {
  if (typeof window === 'undefined') {
    return;
  }
  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    if (session.access_token) {
      window.localStorage.setItem('access_token', session.access_token);
    }
    if (session.refresh_token) {
      window.localStorage.setItem('refresh_token', session.refresh_token);
    }
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem('access_token');
    window.localStorage.removeItem('refresh_token');
  }
};

const readStoredProjectRoles = () => {
  if (typeof window === 'undefined') {
    return {};
  }
  const raw = window.localStorage.getItem(PROJECT_ROLES_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    window.localStorage.removeItem(PROJECT_ROLES_STORAGE_KEY);
    return {};
  }
};

const persistProjectRoles = roles => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      PROJECT_ROLES_STORAGE_KEY,
      JSON.stringify(roles || {})
    );
  } catch {
    // ignore storage failures
  }
};

const defaultContextValue = {
  user: null,
  session: null,
  activeProject: null,
  setActiveProject: () => {},
  projectRoles: {},
  setProjectRole: () => {},
  roleForActiveProject: () => null,
  isLoading: true,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
};

export const AuthContext = createContext(defaultContextValue);

const getInitialAuthState = () => {
  const storedSession = readStoredSession();
  const storedProject =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('activeProjectId')
      : null;
  return {
    session: storedSession,
    user: storedSession?.user ?? null,
    activeProject: storedProject,
    projectRoles: readStoredProjectRoles(),
  };
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(getInitialAuthState);
  const [isLoading, setIsLoading] = useState(true);

  const setActiveProject = useCallback(projectId => {
    if (typeof window !== 'undefined') {
      if (projectId) {
        window.localStorage.setItem('activeProjectId', projectId);
      } else {
        window.localStorage.removeItem('activeProjectId');
      }
    }
    setAuthState(prev => ({
      ...prev,
      activeProject: projectId || null,
    }));
  }, []);

  const setProjectRole = useCallback((projectId, role) => {
    if (!projectId) {
      return;
    }
    setAuthState(prev => {
      const nextRoles = { ...(prev?.projectRoles || {}) };
      if (role) {
        nextRoles[projectId] = role;
      } else {
        delete nextRoles[projectId];
      }
      persistProjectRoles(nextRoles);
      return { ...prev, projectRoles: nextRoles };
    });
  }, []);

  const roleForActiveProject = useCallback(
    (projectIdOverride = null) => {
      const target = projectIdOverride || authState.activeProject;
      if (!target) {
        return null;
      }
      return authState.projectRoles?.[target] || null;
    },
    [authState.activeProject, authState.projectRoles]
  );

  const syncSession = useCallback(nextSession => {
    persistSession(nextSession);
    setAuthState(prev => ({
      session: nextSession,
      user: nextSession?.user ?? null,
      activeProject: prev?.activeProject ?? null,
      projectRoles: prev?.projectRoles ?? {},
    }));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) {
          return;
        }
        if (error) {
          console.error('Failed to restore Supabase session', error);
          syncSession(null);
        } else {
          syncSession(data?.session ?? null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Unexpected Supabase auth error', err);
          syncSession(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }
      syncSession(nextSession || null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const login = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw error;
      }
      syncSession(data?.session ?? null);
      return data?.user ?? data?.session?.user ?? null;
    },
    [syncSession]
  );

  const signup = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        throw error;
      }
      syncSession(data?.session ?? null);
      return data?.user ?? null;
    },
    [syncSession]
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    syncSession(null);
  }, [syncSession]);

  const value = useMemo(
    () => ({
      user: authState.user,
      session: authState.session,
      activeProject: authState.activeProject,
      setActiveProject,
      projectRoles: authState.projectRoles,
      setProjectRole,
      roleForActiveProject,
      isLoading,
      login,
      signup,
      logout,
    }),
    [
      authState,
      isLoading,
      login,
      signup,
      logout,
      setActiveProject,
      setProjectRole,
      roleForActiveProject,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
