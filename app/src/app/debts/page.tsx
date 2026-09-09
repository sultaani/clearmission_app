'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { formatNaira, formatDate } from '@/lib/format';
import { Button } from '@/components/Button';
import { downloadCsv } from '@/lib/csv';
import { DownloadSimple } from '@phosphor-icons/react/dist/ssr';

type Debt = {
  invoice_id: string; invoice_no: string; customer_name: string;
  outstanding: number; age_days: number; age_bucket: string; created_at: string;
};
type AgingSummary = { age_bucket: string; invoice_count: number; total_outstanding: number };

const BUCKET_TONE: Record<string, 'forest' | 'amber' | 'clay'> = {
  current: 'forest', '1-30': 'amber', '31-60': 'amber', '61-90': 'clay', '90+': 'clay',
};

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<AgingSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/debts').then((r) => r.json()),
      fetch('/api/debts?summary=true').then((r) => r.json()),
    ]).then(([d, s]) => {
      if (d.error) return setError(d.error);
      setDebts(d);
      setSummary(Array.isArray(s) ? s : []);
    });
  }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Debts</h1>
          <p className="text-sm text-ink/60">Outstanding customer balances, by age</p>
        </div>
        <Button
          variant="secondary" size="sm" disabled={!debts.length}
          onClick={() => downloadCsv(`clearmission-debts-${new Date().toISOString().slice(0, 10)}.csv`, debts as any)}
        >
          <DownloadSimple size={16} /> Export CSV
        </Button>
      </div>

      {error && <p className="text-sm text-clay">{error}</p>}

      {summary.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {summary.map((s) => (
            <div key={s.age_bucket} className="rounded-lg border border-mist-border p-3">
              <Badge tone={BUCKET_TONE[s.age_bucket] ?? 'neutral'}>{s.age_bucket}</Badge>
              <p className="mt-2 tabular-nums text-lg font-bold text-ink">{formatNaira(s.total_outstanding)}</p>
              <p className="text-xs text-ink/50">{s.invoice_count} invoice{s.invoice_count === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Since</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Age</th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.invoice_id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{d.invoice_no}</td>
                <td className="px-4 py-3 text-ink/70">{d.customer_name}</td>
                <td className="px-4 py-3 text-ink/70">{formatDate(d.created_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-clay">{formatNaira(d.outstanding)}</td>
                <td className="px-4 py-3"><Badge tone={BUCKET_TONE[d.age_bucket] ?? 'neutral'}>{d.age_bucket}</Badge></td>
              </tr>
            ))}
            {debts.length === 0 && !error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">No outstanding debts.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
