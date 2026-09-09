'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { formatDateTime } from '@/lib/format';

type Conflict = { id: string; entity_type: string; reason: string; cashier_username: string; created_at: string; payload: any };

export default function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  function refresh() {
    fetch('/api/sync-conflicts').then((r) => r.json()).then((data) => (data.error ? setError(data.error) : setConflicts(data)));
  }
  useEffect(refresh, []);

  async function resolve(id: string) {
    setResolving(id);
    try {
      const res = await fetch('/api/sync-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflictId: id }),
      });
      if (res.ok) refresh();
    } finally {
      setResolving(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Sync Conflicts</h1>
        <p className="text-sm text-ink/60">Offline transactions that couldn&apos;t auto-apply when a Cashier reconnected</p>
      </div>

      {error && <p className="text-sm text-ink/50">This view needs an Admin session.</p>}

      <div className="flex flex-col gap-3">
        {conflicts.map((c) => (
          <div key={c.id} className="rounded-lg border border-clay bg-clay-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{c.entity_type.replace(/_/g, ' ')} — queued by {c.cashier_username}</p>
                <p className="mt-1 text-sm text-clay">{c.reason}</p>
                <p className="mt-1 text-xs text-ink/50">{formatDateTime(c.created_at)}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={resolving === c.id} onClick={() => resolve(c.id)}>
                {resolving === c.id ? 'Marking…' : 'Mark reviewed'}
              </Button>
            </div>
          </div>
        ))}
        {conflicts.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-ink/50">No unresolved sync conflicts.</p>
        )}
      </div>
    </AppShell>
  );
}
