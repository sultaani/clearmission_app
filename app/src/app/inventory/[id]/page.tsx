'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { formatNaira, formatDateTime } from '@/lib/format';

type ItemDetail = {
  id: string; name: string; category: string; unit: string;
  quantity_on_hand: string; weighted_avg_cost: string; min_stock_threshold: string;
  movements: Array<{ id: string; movement_type: string; quantity_delta: string; unit_cost_at_time: string; performed_by_username: string; job_order_no: string | null; created_at: string; remark: string | null }>;
  procurements: Array<{ id: string; procurement_no: string; quantity: string; total_cost: string; unit_cost: string; procured_at: string }>;
};

const MOVEMENT_TONE: Record<string, 'forest' | 'clay' | 'amber' | 'slate'> = {
  procurement: 'forest', sale_deduction: 'clay', adjustment: 'amber', damage: 'clay', carry_out: 'amber',
};

export default function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);

  useEffect(() => {
    fetch(`/api/inventory/${id}`).then((r) => r.json()).then(setItem);
  }, [id]);

  if (!item) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">{item.name}</h1>
        <p className="text-sm text-ink/60 capitalize">{item.category.replace(/_/g, ' ')}</p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">On hand</p>
          <p className="tabular-nums text-lg font-bold text-ink">{Number(item.quantity_on_hand).toLocaleString()} {item.unit}</p>
        </div>
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">Unit cost (weighted avg)</p>
          <p className="tabular-nums text-lg font-bold text-forest-700">{formatNaira(item.weighted_avg_cost)}</p>
        </div>
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">Low-stock threshold</p>
          <p className="tabular-nums text-lg font-bold text-ink">{Number(item.min_stock_threshold).toLocaleString()} {item.unit}</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-ink">Movement history</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {item.movements.map((m) => (
              <tr key={m.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 text-ink/70">{formatDateTime(m.created_at)}</td>
                <td className="px-4 py-3"><Badge tone={MOVEMENT_TONE[m.movement_type] ?? 'neutral'}>{m.movement_type.replace('_', ' ')}</Badge></td>
                <td className={`px-4 py-3 text-right tabular-nums ${Number(m.quantity_delta) < 0 ? 'text-clay' : 'text-forest-700'}`}>
                  {Number(m.quantity_delta) > 0 ? '+' : ''}{Number(m.quantity_delta).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-ink/70">{m.performed_by_username}{m.job_order_no ? ` · ${m.job_order_no}` : ''}</td>
              </tr>
            ))}
            {item.movements.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-ink/50">No movements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-ink">Procurement history</h2>
      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Procurement</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Total cost</th><th className="px-4 py-3 text-right">Unit cost</th>
            </tr>
          </thead>
          <tbody>
            {item.procurements.map((p) => (
              <tr key={p.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{p.procurement_no}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{Number(p.quantity).toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(p.total_cost)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{formatNaira(p.unit_cost)}</td>
              </tr>
            ))}
            {item.procurements.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-ink/50">No procurements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
