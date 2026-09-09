'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { formatDateTime } from '@/lib/format';

type DeletedRow = { entity: string; id: string; label: string; deleted_at: string };

export default function DeletedRecordsPage() {
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  function refresh() {
    fetch('/api/deleted-records').then((r) => r.json()).then((data) => (data.error ? setError(data.error) : setRows(data)));
  }
  useEffect(refresh, []);

  async function handleRestore(entity: string, id: string) {
    setRestoring(id);
    try {
      const res = await fetch(`/api/deleted-records/${entity}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (res.ok) refresh();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Deleted Records</h1>
        <p className="text-sm text-ink/60">Nothing is ever permanently deleted — restore anything here</p>
      </div>

      {error && <p className="text-sm text-ink/50">This view needs an Admin session.</p>}

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Type</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Deleted at</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.entity}-${r.id}`} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3"><Badge tone="neutral">{r.entity.replace(/_/g, ' ')}</Badge></td>
                <td className="px-4 py-3 text-ink">{r.label}</td>
                <td className="px-4 py-3 text-ink/70">{formatDateTime(r.deleted_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="secondary" disabled={restoring === r.id} onClick={() => handleRestore(r.entity, r.id)}>
                    {restoring === r.id ? 'Restoring…' : 'Restore'}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/50">Nothing deleted.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
