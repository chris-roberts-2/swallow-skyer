import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import supabase from '../lib/supabaseClient';
import apiClient from '../services/api';

const SESSION_STORAGE_KEY = 'supabaseSession';
const PROJECT_ROLES_STORAGE_KEY = 'projectRoles';
const getLocalStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // ignore
  }
  return null;
};

const readStoredSession = () => {
  const storage = getLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

const persistSession = session => {
  const storage = getLocalStorage();
  if (!storage) return;
  if (session) {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    if (session.access_token) {
      storage.setItem('access_token', session.access_token);
    }
    if (session.refresh_token) {
      storage.setItem('refresh_token', session.refresh_token);
    }
  } else {
    storage.removeItem(SESSION_STORAGE_KEY);
    storage.removeItem('access_token');
    storage.removeItem('refresh_token');
  }
};

const readStoredProjectRoles = () => {
  const storage = getLocalStorage();
  if (!storage) return {};
  const raw = storage.getItem(PROJECT_ROLES_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    storage.removeItem(PROJECT_ROLES_STORAGE_KEY);
    return {};
  }
};

const persistProjectRoles = roles => {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.setItem(PROJECT_ROLES_STORAGE_KEY, JSON.stringify(roles || {}));
  } catch {
    // ignore storage failures
  }
};

const PROJECTS_STORAGE_KEY = 'projects';

const defaultContextValue = {
  user: null,
  session: null,
  projects: [],
  activeProject: null,
  setActiveProject: () => {},
  refreshProjects: async () => {},
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
    getLocalStorage()?.getItem('activeProjectId') || null;
  return {
    session: storedSession,
    user: storedSession?.user ?? null,
    activeProjectId: storedProject,
    projects: [],
    projectRoles: readStoredProjectRoles(),
  };
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(getInitialAuthState);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingProjects = useRef(false);
  const lastProjectsFetchAt = useRef(0);

  const activeProject =
    authState.projects.find(p => p.id === authState.activeProjectId) || null;

  const setActiveProject = useCallback(project => {
    const projectId =
      typeof project === 'string' ? project : project?.id || null;
    if (typeof window !== 'undefined') {
      if (projectId) {
        window.localStorage.setItem('activeProjectId', projectId);
      } else {
        window.localStorage.removeItem('activeProjectId');
      }
    }
    setAuthState(prev => ({
      ...prev,
      activeProjectId: projectId || null,
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
      const target = projectIdOverride || authState.activeProjectId;
      if (!target) {
        return null;
      }
      return authState.projectRoles?.[target] || null;
    },
    [authState.activeProjectId, authState.projectRoles]
  );

  const syncSession = useCallback(nextSession => {
    persistSession(nextSession);
    setAuthState(prev => ({
      session: nextSession,
      user: nextSession?.user ?? null,
      activeProjectId: prev?.activeProjectId ?? null,
      projects: prev?.projects ?? [],
      projectRoles: prev?.projectRoles ?? {},
    }));
  }, []);

  const refreshProjects = useCallback(
    async ({ redirectWhenEmpty = false } = {}) => {
      if (isFetchingProjects.current) return;
      if (!authState.session) {
        setAuthState(prev => ({ ...prev, projects: [] }));
        return;
      }

      // Throttle to avoid hammering backend/Supabase in React dev (StrictMode + multiple consumers)
      const now = Date.now();
      if (now - lastProjectsFetchAt.current < 1500) {
        return;
      }
      lastProjectsFetchAt.current = now;

      isFetchingProjects.current = true;
      try {
        const resp = await apiClient.get('/v1/projects');
        const list = resp?.projects || [];

        // persist for quick render
        try {
          window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(list));
        } catch {
          // ignore
        }

        setAuthState(prev => {
          const nextRoles = { ...(prev?.projectRoles || {}) };
          list.forEach(p => {
            if (p.id && p.role) {
              nextRoles[p.id] = p.role;
            }
          });
          persistProjectRoles(nextRoles);

          const currentId = prev?.activeProjectId;
          const hasCurrent = currentId && list.some(p => p.id === currentId);
          const nextActiveId =
            hasCurrent || !list.length ? currentId || null : list[0].id;

          return {
            ...prev,
            projects: list,
            activeProjectId: nextActiveId,
            projectRoles: nextRoles,
          };
        });

        // Redirect removed to avoid unexpected tab switches; callers can handle UI.
      } catch (err) {
        console.error('Failed to load projects', err);
      } finally {
        isFetchingProjects.current = false;
      }
    },
    [authState.session]
  );

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
          if (data?.session) {
            refreshProjects({ redirectWhenEmpty: false });
          }
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
      if (nextSession) {
        refreshProjects({ redirectWhenEmpty: false });
      } else {
        setAuthState(prev => ({
          ...prev,
          projects: [],
          activeProjectId: null,
        }));
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProjects, syncSession]);

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
      projects: authState.projects,
      activeProject,
      setActiveProject,
      refreshProjects,
      projectRoles: authState.projectRoles,
      setProjectRole,
      roleForActiveProject,
      isLoading,
      login,
      signup,
      logout,
    }),
    [
      authState.projects,
      authState.session,
      authState.projectRoles,
      isLoading,
      login,
      signup,
      logout,
      setActiveProject,
      setProjectRole,
      roleForActiveProject,
      activeProject,
      refreshProjects,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
