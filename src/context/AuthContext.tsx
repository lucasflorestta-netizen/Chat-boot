import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../lib/api';
import { connectSocket, disconnectSocket, reconnectSocketWithToken } from '../lib/socket';
import { mapProfile } from '../lib/mappers';
import type { Profile } from '../types';

interface AuthSession {
  access_token: string;
}

interface AuthUser {
  id: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: AuthUser | null;
  profile: Profile | null;
  profileError: string | null;
  loading: boolean;
  signIn: (usernameOrEmail: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchProfile: (partial: Partial<Profile>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = (token: string, rawUser: unknown) => {
    setToken(token);
    const mapped = mapProfile(rawUser);
    setSession({ access_token: token });
    setUser({ id: mapped.id });
    setProfile(mapped);
    setProfileError(null);
    reconnectSocketWithToken();
  };

  const clearAuth = () => {
    setToken(null);
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileError(null);
    disconnectSocket();
  };

  const fetchMe = async () => {
    try {
      const me = await api('/auth/me');
      const mapped = mapProfile(me);
      setProfile(mapped);
      setUser({ id: mapped.id });
      setProfileError(null);
      connectSocket();
    } catch (err) {
      clearAuth();
      setProfileError(err instanceof Error ? err.message : 'Falha ao carregar perfil');
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setSession({ access_token: token });
    fetchMe().finally(() => setLoading(false));
  }, []);

  const signIn = async (usernameOrEmail: string, password: string) => {
    try {
      const data = await api<{ access_token: string; user: unknown }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: usernameOrEmail, password }),
      });
      applyAuth(data.access_token, data.user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Falha no login' };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const data = await api<{ access_token: string; user: unknown }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: email,
          email,
          password,
          name,
        }),
      });
      applyAuth(data.access_token, data.user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Falha no cadastro' };
    }
  };

  const signOut = async () => {
    clearAuth();
  };

  const refreshProfile = async () => {
    if (!getToken()) return;
    await fetchMe();
  };

  const patchProfile = (partial: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        profileError,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        patchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
