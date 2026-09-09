'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { installCsrfFetch } from './csrfFetch';

export type SessionUser = { id: string; username: string; role: 'admin' | 'cashier' };

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUser: (user: SessionUser) => void;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true, logout: async () => {}, setUser: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    installCsrfFetch();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal — the app works fine without offline shell caching, this just
        // means a page won't load if the network is down AND it wasn't visited before.
      });
    }
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  }

  return <AuthContext.Provider value={{ user, loading, logout, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
