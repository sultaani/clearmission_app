'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { getMobileNavSplit } from '@/components/navItems';

export default function MorePage() {
  const { user } = useAuth();
  if (!user) return null;

  const { overflow } = getMobileNavSplit(user.role);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">More</h1>
        <p className="text-sm text-ink/60">Everything else, in one place</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {overflow.map((item) => {
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-mist-border p-4 text-center transition-colors duration-200 hover:border-forest hover:bg-mist"
            >
              <ItemIcon size={24} className="text-forest-700" aria-hidden="true" />
              <span className="text-xs font-medium leading-tight text-ink">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
