// invest-premier/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";

type User = { id: string; email: string; roles?: string[]; apps?: string[] };

type AuthContextType = {
  user: User | null;
  ready: boolean;
  isAuthenticated: boolean;
  fetchSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const fetchSession = async () => {
    try {
      // 1) Try current access cookie
      let r = await fetch("/api/session", { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setUser(data.user);
        return;
      }

      // 2) If it failed, silently use domain-scoped refresh cookie
      const rf = await fetch("/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (rf.ok) {
        // 3) Re-try session after refreshing
        r = await fetch("/api/session", { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setUser(data.user);
          return;
        }
      }

      // Still not authenticated
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setReady(true); // IMPORTANT: only after refresh attempt
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const logout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        isAuthenticated: !!user,
        fetchSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
