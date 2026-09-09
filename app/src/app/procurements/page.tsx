'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { formatNaira, formatDateTime } from '@/lib/format';

type Procurement = { id: string; procurement_no: string; item_name: string; quantity: string; total_cost: string; unit_cost: string; recorded_by_username: string; procured_at: string };

export default function ProcurementsPage() {
  const [rows, setRows] = useState<Procurement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/procurements').then((r) => r.json()).then((d) => (d.error ? setError(d.error) : setRows(d)));
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Procurement History</h1>
        <p className="text-sm text-ink/60">Every stock purchase, most recent first</p>
      </div>

      {error && <p className="text-sm text-ink/50">This view needs an Admin session.</p>}

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Procurement</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Total cost</th><th className="px-4 py-3 text-right">Unit cost</th><th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{p.procurement_no}</td>
                <td className="px-4 py-3 text-ink/70">{p.item_name}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{Number(p.quantity).toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(p.total_cost)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{formatNaira(p.unit_cost)}</td>
                <td className="px-4 py-3 text-ink/70">{p.recorded_by_username}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50">No procurements recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
