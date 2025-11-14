import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import authService from '../services/authService';
import apiClient from '../services/api';

export const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  signup: async () => {},
  login: async () => {},
  logout: () => {},
  refreshTokens: async () => {},
  loadUserFromTokens: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInFlight = useRef(null);

  const setTokens = useCallback((tokens) => {
    if (tokens?.access_token) {
      localStorage.setItem('access_token', tokens.access_token);
    }
    if (tokens?.refresh_token) {
      localStorage.setItem('refresh_token', tokens.refresh_token);
    }
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }, []);

  const loadUserFromTokens = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    if (!accessToken && !refreshToken) {
      setIsLoading(false);
      return null;
    }
    try {
      const me = await authService.me(accessToken);
      setUser(me.user);
      setIsLoading(false);
      return me.user;
    } catch (err) {
      if (refreshToken) {
        try {
          const refreshed = await authService.refresh(refreshToken);
          setTokens(refreshed);
          const nextAccessToken =
            refreshed?.access_token || localStorage.getItem('access_token');
          if (refreshed?.user) {
            setUser(refreshed.user);
            setIsLoading(false);
            return refreshed.user;
          }
          if (nextAccessToken) {
            const me = await authService.me(nextAccessToken);
            setUser(me.user);
            setIsLoading(false);
            return me.user;
          }
        } catch (refreshErr) {
          clearTokens();
          setUser(null);
          setIsLoading(false);
          throw refreshErr;
        }
      }
      clearTokens();
      setUser(null);
      setIsLoading(false);
      throw err;
    }
  }, [clearTokens]);

  const signup = useCallback(
    async (email, password, name) => {
      const result = await authService.signup({ email, password, name });
      setTokens(result);
      setUser(result.user);
      return result.user;
    },
    [setTokens]
  );

  const login = useCallback(
    async (email, password) => {
      const result = await authService.login({ email, password });
      setTokens(result);
      setUser(result.user);
      return result.user;
    },
    [setTokens]
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, [clearTokens]);

  const refreshTokens = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      logout();
      return null;
    }
    const promise = authService.refresh(refreshToken)
      .then(result => {
        setTokens(result);
        if (result.user) {
          setUser(result.user);
        }
        return result;
      })
      .catch(err => {
        logout();
        throw err;
      })
      .finally(() => {
        refreshInFlight.current = null;
      });
    refreshInFlight.current = promise;
    return promise;
  }, [logout, setTokens]);

  useEffect(() => {
    apiClient.setAuthHandlers({
      refreshTokens,
      logout,
    });
    loadUserFromTokens();
  }, [loadUserFromTokens, refreshTokens, logout]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      signup,
      login,
      logout,
      refreshTokens,
      loadUserFromTokens,
    }),
    [user, isLoading, signup, login, logout, refreshTokens, loadUserFromTokens]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);


