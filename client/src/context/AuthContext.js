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
import { getApiOrigin } from '../utils/apiEnv';

const PROJECT_ROLES_STORAGE_KEY = 'projectRoles';
const getLocalStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore
  }
  return null;
};

const persistAccessToken = session => {
  const storage = getLocalStorage();
  if (!storage) return;
  if (session) {
    if (session.access_token) {
      storage.setItem('access_token', session.access_token);
    }
  } else {
    storage.removeItem('access_token');
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
  profile: null,
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
  refreshProfile: async () => {},
  updateProfile: async () => {},
  updateLogin: async () => {},
};

export const AuthContext = createContext(defaultContextValue);

const getInitialAuthState = () => {
  const storedProject = getLocalStorage()?.getItem('activeProjectId') || null;
  return {
    session: null,
    user: null,
    profile: null,
    activeProjectId: storedProject,
    projects: [],
    projectRoles: readStoredProjectRoles(),
  };
};

const normalizeProfile = row => {
  if (!row) return null;
  return {
    id: row.id || null,
    email: row.email || '',
    username: row.username || '',
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    company: row.company || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(getInitialAuthState);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingProjects = useRef(false);
  const lastProjectsFetchAt = useRef(0);
  const isFetchingProfile = useRef(false);
  const lastProfileFetchAt = useRef(0);
  const lastAccessedProject = useRef({ projectId: null, at: 0 });

  // If projects cannot be fetched temporarily (backend 500, offline, etc), keep the
  // active project id usable for upload/map flows by falling back to the stored id.
  const activeProject =
    authState.projects.find(p => p.id === authState.activeProjectId) ||
    authState.activeProjectId ||
    null;

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

  const setProfileState = useCallback(profile => {
    setAuthState(prev => ({ ...prev, profile }));
  }, []);

  const refreshProfile = useCallback(
    async ({
      ensureExists = false,
      userOverride = null,
      force = false,
    } = {}) => {
      const sessionUser = userOverride || authState.session?.user;
      if (!sessionUser?.id) {
        setProfileState(null);
        return null;
      }
      if (isFetchingProfile.current) {
        return authState.profile;
      }
      const now = Date.now();
      if (!force && now - lastProfileFetchAt.current < 300_000) {
        return authState.profile;
      }
      isFetchingProfile.current = true;
      lastProfileFetchAt.current = now;

      try {
        // Production: fetch profile via backend (service-role Supabase) so frontend
        // isn't blocked by RLS policies on public.users.
        const resp = await apiClient.get('/v1/profile');
        const row = resp?.profile || null;
        const profile = normalizeProfile(row);
        setProfileState(profile);
        return profile;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load profile', err);
        return null;
      } finally {
        isFetchingProfile.current = false;
      }
    },
    [authState.profile, authState.session, setProfileState]
  );

  const updateProfile = useCallback(
    async updates => {
      const sessionUser = authState.session?.user;
      if (!sessionUser?.id) {
        throw new Error('Not authenticated');
      }

      const payload = {
        email: sessionUser.email,
      };

      if (typeof updates.firstName === 'string') {
        payload.first_name = updates.firstName.trim();
      }
      if (typeof updates.lastName === 'string') {
        payload.last_name = updates.lastName.trim();
      }
      if (typeof updates.company === 'string') {
        payload.company = updates.company.trim();
      }

      const resp = await apiClient.patch('/v1/profile', payload);
      const profile = normalizeProfile(resp?.profile || null);
      setProfileState(profile);
      return profile;
    },
    [authState.session, setProfileState]
  );

  const syncSession = useCallback(nextSession => {
    persistAccessToken(nextSession);
    setAuthState(prev => ({
      session: nextSession,
      user: nextSession?.user ?? null,
      profile: nextSession ? (prev?.profile ?? null) : null,
      activeProjectId: prev?.activeProjectId ?? null,
      projects: prev?.projects ?? [],
      projectRoles: prev?.projectRoles ?? {},
    }));
  }, []);

  const updateLogin = useCallback(
    async ({ email, password }) => {
      const sessionUser = authState.session?.user;
      if (!sessionUser?.id) {
        throw new Error('Not authenticated');
      }

      const payload = {};
      const trimmedEmail = typeof email === 'string' ? email.trim() : '';
      if (trimmedEmail && trimmedEmail !== sessionUser.email) {
        payload.email = trimmedEmail;
      }
      if (typeof password === 'string' && password.length) {
        payload.password = password;
      }

      if (!payload.email && !payload.password) {
        return { user: sessionUser };
      }

      const { data, error } = await supabase.auth.updateUser(payload);
      if (error) {
        throw error;
      }

      const refreshed =
        data?.session ??
        (await supabase.auth.getSession())?.data?.session ??
        null;
      syncSession(refreshed);

      if (payload.email) {
        try {
          const profileResp = await apiClient.patch('/v1/profile', {
            email: payload.email,
          });
          setProfileState(normalizeProfile(profileResp?.profile || null));
        } catch (profileErr) {
          // eslint-disable-next-line no-console
          console.error('Failed to sync profile email', profileErr);
        }
      }

      return data;
    },
    [authState.session, setProfileState, syncSession]
  );

  const refreshProjects = useCallback(
    async ({ redirectWhenEmpty = false, force = false } = {}) => {
      if (isFetchingProjects.current) return false;
      if (!authState.session) {
        setAuthState(prev => ({ ...prev, projects: [] }));
        return false;
      }

      // Throttle to avoid hammering backend/Supabase (multiple consumers + retries).
      const now = Date.now();
      if (!force && now - lastProjectsFetchAt.current < 300_000) {
        return false;
      }
      lastProjectsFetchAt.current = now;

      isFetchingProjects.current = true;
      try {
        const resp = await apiClient.get('/v1/projects');
        const list = resp?.projects || [];

        // persist for quick render
        try {
          window.localStorage.setItem(
            PROJECTS_STORAGE_KEY,
            JSON.stringify(list)
          );
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
        isFetchingProjects.current = false;
        return true;
      } catch (err) {
        isFetchingProjects.current = false;
        // eslint-disable-next-line no-console
        console.error('Failed to load projects', err);
        throw err;
      }
    },
    [authState.session]
  );

  const isRetryableError = useCallback(err => {
    if (!err) return false;
    if (err.isRetryable === true) return true;
    if (err.name === 'AbortError') return true;
    if (
      err.message === 'Failed to fetch' ||
      (err.message && err.message.includes('network'))
    )
      return true;
    if (typeof err.status === 'number' && err.status >= 500 && err.status < 600)
      return true;
    return false;
  }, []);

  const loadProjectsWithRetry = useCallback(async () => {
    if (!authState.session) return;
    const maxRetries = 20;
    const maxSkips = 30;
    const backoffMs = [2000, 4000, 8000, 16000, 30000];
    let attempt = 0;
    let skips = 0;
    while (true) {
      try {
        const didLoad = await refreshProjects({ force: true });
        if (didLoad) return;
        skips += 1;
        if (skips >= maxSkips) return;
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        if (!isRetryableError(err) || attempt >= maxRetries) {
          // eslint-disable-next-line no-console
          console.error('Projects load failed after retries', err);
          return;
        }
        attempt += 1;
        const delay = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }, [authState.session, refreshProjects, isRetryableError]);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) {
          return;
        }
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to restore Supabase session', error);
          syncSession(null);
        } else {
          syncSession(data?.session ?? null);
          if (data?.session) {
            loadProjectsWithRetry();
          }
        }
      } catch (err) {
        if (isMounted) {
          // eslint-disable-next-line no-console
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
        loadProjectsWithRetry();
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
  }, [loadProjectsWithRetry, syncSession]);

  useEffect(() => {
    if (authState.session?.user?.id) {
      refreshProfile({ ensureExists: true });
    } else {
      setProfileState(null);
    }
  }, [authState.session, refreshProfile, setProfileState]);

  useEffect(() => {
    if (!authState.session || !authState.activeProjectId) return;
    const projectId = authState.activeProjectId;
    const hasProject = (authState.projects || []).some(p => p.id === projectId);
    if (!hasProject) return;
    const now = Date.now();
    const last = lastAccessedProject.current;
    if (last.projectId === projectId && now - last.at < 300_000) {
      return;
    }
    lastAccessedProject.current = { projectId, at: now };
    apiClient.post(`/v1/projects/${projectId}/access`).catch(() => {});
  }, [authState.activeProjectId, authState.projects, authState.session]);

  // If signup required email confirmation, we may have collected first/last/company
  // before we had a session. Once we have a session, flush that pending profile to
  // the backend so it lands in Supabase public.users.
  const registerProfileMetadata = useCallback(
    async ({ userId, email, firstName, lastName, company }) => {
      const payload = {
        userId,
        email: (email || '').trim(),
        first_name: (firstName || '').trim(),
        last_name: (lastName || '').trim(),
        company: (company || '').trim(),
      };
      const baseUrl = `${getApiOrigin().replace(/\/+$/, '')}/api/v1/profile/register`;
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || 'Unable to store user profile');
      }
      return response.json();
    },
    []
  );

  const login = useCallback(
    async (email, password) => {
      const normalizedEmail = (email || '').trim();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        // Supabase commonly returns a generic 400 "Invalid login credentials" for
        // both wrong credentials and some unconfirmed-email cases.
        if (
          (error?.status === 400 || error?.status === 401) &&
          (error?.message || '')
            .toLowerCase()
            .includes('invalid login credentials')
        ) {
          throw new Error(
            'Invalid email/password, or the account email has not been confirmed yet.'
          );
        }
        throw error;
      }
      syncSession(data?.session ?? null);
      await refreshProfile({ ensureExists: false, userOverride: data?.user });
      return data?.user ?? data?.session?.user ?? null;
    },
    [refreshProfile, syncSession]
  );

  const signup = useCallback(
    async (email, password, { firstName, lastName, company } = {}) => {
      const normalizedEmail = (email || '').trim();
      const emailRedirectTo =
        typeof window !== 'undefined' && window.location
          ? `${window.location.origin}/auth/callback`
          : undefined;
      const { data, error } = await supabase.auth.signUp(
        emailRedirectTo
          ? {
              email: normalizedEmail,
              password,
              options: { emailRedirectTo },
            }
          : {
              email: normalizedEmail,
              password,
            }
      );
      if (error) {
        throw error;
      }

      let user = data?.user ?? null;
      let session = data?.session ?? null;

      if (user?.id) {
        await registerProfileMetadata({
          userId: user.id,
          email: normalizedEmail,
          firstName,
          lastName,
          company,
        });
      } else {
        throw new Error('Unable to register profile metadata');
      }

      // If signup didn't return a session, Supabase is likely configured to require
      // email confirmation. In that case, we cannot log in yet.
      if (!session) {
        return {
          user,
          needsEmailConfirmation: true,
          email: normalizedEmail,
        };
      }

      syncSession(session);
      await refreshProfile({ ensureExists: true, userOverride: user });
      return { user, needsEmailConfirmation: false, email: normalizedEmail };
    },
    [refreshProfile, registerProfileMetadata, syncSession]
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    syncSession(null);
  }, [syncSession]);

  // Register API auth handlers once so the ApiClient can refresh on 401
  // and force logout if refresh fails.
  useEffect(() => {
    const refreshTokens = async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        throw error;
      }
      syncSession(data?.session ?? null);
      return data?.session ?? null;
    };

    const apiLogout = async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      syncSession(null);
    };

    apiClient.setAuthHandlers({ refreshTokens, logout: apiLogout });
  }, [syncSession]);

  const value = useMemo(
    () => ({
      user: authState.user,
      profile: authState.profile,
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
      refreshProfile,
      updateProfile,
      updateLogin,
    }),
    [
      authState.projects,
      authState.session,
      authState.projectRoles,
      authState.profile,
      authState.user,
      isLoading,
      login,
      signup,
      logout,
      setActiveProject,
      setProjectRole,
      roleForActiveProject,
      activeProject,
      refreshProjects,
      refreshProfile,
      updateProfile,
      updateLogin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
