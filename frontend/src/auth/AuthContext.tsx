import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loginRequest, logoutRequest } from '../api/authApi';
import { refreshSession, setAccessToken } from '../api/httpClient';
import type { AuthUser } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;

    refreshSession().then((res) => {
      if (!active) return;
      if (res) {
        setUser(res.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginRequest(email, password);
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return ctx;
}
