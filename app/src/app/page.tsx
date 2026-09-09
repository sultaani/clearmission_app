'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else router.replace(user.role === 'admin' ? '/dashboard' : '/pos');
  }, [user, loading, router]);

  return <div className="flex min-h-screen items-center justify-center text-ink/50">Loading…</div>;
}
