import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi } from '../services/api';
import type { MeResponse, UserResponse, TutorProfileBrief, UserRole } from '../types';

interface AuthState {
  user: UserResponse | null;
  tutorProfile: TutorProfileBrief | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<MeResponse>;
  logout: () => void;
  refresh: () => Promise<void>;
  isRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('access_token');
    return {
      user: null,
      tutorProfile: null,
      token,
      loading: Boolean(token),
    };
  });

  const fetchMe = useCallback(async () => {
    try {
      const me = await authApi.me();
      setState((s) => ({
        ...s,
        user: me.user,
        tutorProfile: me.tutor_profile,
        loading: false,
      }));
    } catch {
      localStorage.removeItem('access_token');
      setState({ user: null, tutorProfile: null, token: null, loading: false });
    }
  }, []);

  useEffect(() => {
    if (!state.token) return;
    void fetchMe();
  }, [state.token, fetchMe]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    localStorage.setItem('access_token', res.access_token);
    const me = await authApi.me();
    setState({
      user: me.user,
      tutorProfile: me.tutor_profile,
      token: res.access_token,
      loading: false,
    });
    return me;
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setState({ user: null, tutorProfile: null, token: null, loading: false });
  };

  const refresh = async () => {
    await fetchMe();
  };

  const isRole = (...roles: UserRole[]) => {
    return state.user ? roles.includes(state.user.role) : false;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refresh, isRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
