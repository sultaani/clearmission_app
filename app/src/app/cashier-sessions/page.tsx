'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { formatNaira, formatDateTime } from '@/lib/format';

type Session = {
  id: string; username: string; opened_at: string; closed_at: string | null; status: string;
  expected_cash: string | null; expected_transfer: string | null; expected_pos: string | null;
  actual_cash: string | null; actual_transfer: string | null; actual_pos: string | null; variance: string | null;
};

export default function CashierSessionHistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    fetch('/api/cashier-sessions/history').then((r) => r.json()).then(setSessions);
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Session History</h1>
        <p className="text-sm text-ink/60">Every cashier session, open and closed</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Cashier</th><th className="px-4 py-3">Opened</th><th className="px-4 py-3">Closed</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{s.username}</td>
                <td className="px-4 py-3 text-ink/70">{formatDateTime(s.opened_at)}</td>
                <td className="px-4 py-3 text-ink/70">{s.closed_at ? formatDateTime(s.closed_at) : '—'}</td>
                <td className="px-4 py-3"><Badge tone={s.status === 'open' ? 'slate' : 'neutral'}>{s.status}</Badge></td>
                <td className={`px-4 py-3 text-right tabular-nums ${s.variance && Number(s.variance) < 0 ? 'text-clay' : s.variance && Number(s.variance) > 0 ? 'text-amber' : 'text-ink/50'}`}>
                  {s.variance !== null ? formatNaira(s.variance) : '—'}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">No sessions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
