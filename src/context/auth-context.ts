import { createContext } from 'react';
import type { Profile } from '../types';

export interface AuthSession {
  access_token: string;
}

export interface AuthUser {
  id: string;
}

export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
