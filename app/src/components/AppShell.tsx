'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { NAV_ITEMS, SignOut } from './navItems';
import clsx from 'clsx';
import { useEffect } from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink/50">Loading…</div>;
  }
  if (!user) return null;

  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));
  const mobileItems = items.filter((i) => i.primary).slice(0, 5);

  return (
    <div className="min-h-screen bg-white lg:flex">
      {/* Desktop sidebar — PRD #85 */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-mist-border lg:bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-mist-border px-5">
          <div className="h-2.5 w-2.5 rounded-full bg-forest" aria-hidden="true" />
          <span className="font-bold text-ink">Clearmission</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors duration-200',
                  active ? 'bg-forest-50 text-forest-700' : 'text-ink/70 hover:bg-mist'
                )}
              >
                <ItemIcon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-mist-border p-3">
          <div className="flex items-center justify-between rounded px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-ink">{user.username}</span>
              <span className="text-xs text-ink/50 capitalize">{user.role}</span>
            </div>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="cursor-pointer rounded p-2 text-ink/50 transition-colors duration-200 hover:bg-mist hover:text-clay"
            >
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 pb-16 lg:pb-0">
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {/* Mobile bottom nav — PRD #84 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-mist-border bg-white lg:hidden">
        {mobileItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors duration-200',
                active ? 'text-forest-700' : 'text-ink/50'
              )}
            >
              <ItemIcon size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
