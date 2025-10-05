/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";

interface User {
  userid: number;
  name: string;
  email: string;
  roleid: number;
  status?: string;
  managerid?: number | null;
  departmentid?: number | null;
  lastlogin?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshTokenValue: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  refreshToken: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("auth");
    if (stored) {
      const { user, token, accessToken, refreshToken } = JSON.parse(stored);
      setUser(user);
      setToken(accessToken || token || null);
      setRefreshTokenValue(refreshToken || null);
    }
  }, []);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  console.log(API_BASE_URL);
  const login = async (email: string, password: string) => {
    const lower = email.toLowerCase();
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: lower, password })
    });
    if (!res.ok) {
      throw new Error("Invalid credentials");
    }
    const data = await res.json();
    if (data.user?.status && data.user.status.toLowerCase() !== "active") {
      throw new Error("Account is disabled");
    }
    setUser(data.user);
    const newAccess = data.accessToken || data.token;
    setToken(newAccess);
    setRefreshTokenValue(data.refreshToken);
    localStorage.setItem(
      "auth",
      JSON.stringify({ user: data.user, accessToken: newAccess, refreshToken: data.refreshToken })
    );
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setRefreshTokenValue(null);
    localStorage.removeItem("auth");
  };

  const fetchWithAuth = async (
    input: RequestInfo,
    init: RequestInit = {},
    retry = true
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // Lightweight timing instrumentation in dev to spot slow calls
    const traceEnabled = import.meta.env.DEV === true;
    const req: Request | undefined =
      typeof input === "object" && input !== null && (input as Request).url
        ? (input as Request)
        : undefined;
    const method = (init.method ?? req?.method ?? "GET").toString().toUpperCase();
    const urlStr = typeof input === "string" ? input : req?.url || "";
    const url = (() => {
      try {
        return new URL(urlStr);
      } catch {
        return null;
      }
    })();
    const label = `[API] ${method} ${url?.pathname || urlStr}`;
    const start = performance.now();

    const response = await fetch(input, { ...init, headers });
    const firstDuration = performance.now() - start;
    if (traceEnabled) {
      console.info(`${label} -> ${response.status} in ${firstDuration.toFixed(0)}ms`);
    }

    if (response.status === 401 && retry) {
      const refreshStart = performance.now();
      const refreshed = await refreshToken();
      const refreshDur = performance.now() - refreshStart;
      if (traceEnabled) {
        console.info(`[API] token refresh -> ${refreshed ? "ok" : "fail"} in ${refreshDur.toFixed(0)}ms`);
      }
      if (refreshed) {
        const retryHeaders = new Headers(init.headers);
        // Use most recent token from localStorage to avoid stale closure
        try {
          const stored = localStorage.getItem("auth");
          const parsed = stored ? JSON.parse(stored) : undefined;
          const latest = parsed?.accessToken || token;
          if (latest) retryHeaders.set("Authorization", `Bearer ${latest}`);
        } catch {
          if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
        }
        const retryStart = performance.now();
        const second = await fetch(input, { ...init, headers: retryHeaders });
        const retryDur = performance.now() - retryStart;
        if (traceEnabled) {
          console.info(`${label} (retry) -> ${second.status} in ${retryDur.toFixed(0)}ms`);
        }
        if (second.status === 401) logout();
        return second;
      }
      logout();
    }
    return response;
  };

  const refreshToken = async (): Promise<boolean> => {
    if (!refreshTokenValue) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshTokenValue })
      });
      if (!res.ok) return false;
      const data = await res.json();
      const newAccess = data.accessToken || data.token;
      if (!newAccess) return false;
      setToken(newAccess);
      setRefreshTokenValue(data.refreshToken ?? refreshTokenValue);
      localStorage.setItem(
        "auth",
        JSON.stringify({ user, accessToken: newAccess, refreshToken: data.refreshToken ?? refreshTokenValue })
      );
      return true;
    } catch {
      return false;
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    const res = await fetchWithAuth(`${API_BASE_URL}/me`);
    if (res.ok) {
      const data = await res.json();
      setUser(data);
      const stored = localStorage.getItem("auth");
      const prev = stored ? JSON.parse(stored) : {};
      localStorage.setItem(
        "auth",
        JSON.stringify({ user: data, accessToken: prev.accessToken || token, refreshToken: refreshTokenValue })
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        refreshTokenValue,
        login,
        logout,
        fetchWithAuth,
        refreshToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
