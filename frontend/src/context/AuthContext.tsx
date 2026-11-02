import { createContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import api from "../services/api";

export interface AuthUser {
  username: string;
  role: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface LoginResponse {
  username: string;
  role: string;
  message: string;
}

interface UserProfileResponse {
  username: string;
  role: string;
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async (): Promise<void> => {
    const { data } = await api.get<UserProfileResponse>("/api/auth/me");
    setUser({ username: data.username, role: data.role });
  };

  const bootstrapAuth = async () => {
    setIsLoading(true);
    try {
      await api.get("/api/auth/csrf");
      await refreshUser();
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);
    try {
      await api.get("/api/auth/csrf");
      const { data } = await api.post<LoginResponse>("/api/auth/login", credentials);
      setUser({
        username: data.username,
        role: data.role,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setUser(null);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
