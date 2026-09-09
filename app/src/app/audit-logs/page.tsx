'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { formatDateTime } from '@/lib/format';

type LogRow = { id: number; actor_username: string | null; action: string; module: string; record_id: string; created_at: string };

const ACTION_TONE: Record<string, 'forest' | 'amber' | 'clay' | 'slate'> = {
  insert: 'slate', update: 'amber', soft_delete: 'clay', restore: 'forest',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/audit-logs').then((r) => r.json()).then((data) => (data.error ? setError(data.error) : setLogs(data)));
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Audit Log</h1>
        <p className="text-sm text-ink/60">Every create, edit, delete and restore, across the whole system</p>
      </div>

      {error && <p className="text-sm text-ink/50">This view needs an Admin session.</p>}

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Module</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 text-ink/70">{formatDateTime(l.created_at)}</td>
                <td className="px-4 py-3 text-ink">{l.actor_username ?? 'system'}</td>
                <td className="px-4 py-3"><Badge tone={ACTION_TONE[l.action] ?? 'neutral'}>{l.action.replace('_', ' ')}</Badge></td>
                <td className="px-4 py-3 text-ink/70">{l.module.replace(/_/g, ' ')}</td>
              </tr>
            ))}
            {logs.length === 0 && !error && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/50">No activity logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
