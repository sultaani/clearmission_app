'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatNaira } from '@/lib/format';
import { useAuth } from '@/lib/AuthContext';
import { Plus } from '@phosphor-icons/react/dist/ssr';

type Item = {
  id: string; name: string; category: string; unit: string;
  quantity_on_hand: string; weighted_avg_cost: string; min_stock_threshold: string;
};

export default function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    fetch('/api/inventory/items').then((r) => r.json()).then(setItems);
  }
  useEffect(refresh, []);

  async function handleProcure() {
    setError(null);
    if (!itemId || !quantity || !totalCost) {
      setError('Select an item and enter quantity and total cost.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory/procurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryItemId: itemId, quantity: Number(quantity), totalCost: Number(totalCost) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setQuantity('');
      setTotalCost('');
      setOpen(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Inventory</h1>
          <p className="text-sm text-ink/60">Stock on hand, by material</p>
        </div>
        {user?.role === 'admin' && (
          <Button onClick={() => setOpen(true)}><Plus size={16} /> Record procurement</Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Unit cost</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const low = Number(item.quantity_on_hand) <= Number(item.min_stock_threshold);
              return (
                <tr key={item.id} className="border-b border-mist-border last:border-0 hover:bg-mist/50">
                  <td className="px-4 py-3">
                    <Link href={`/inventory/${item.id}`} className="font-medium text-forest-700 hover:underline">{item.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{item.category.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{Number(item.quantity_on_hand).toLocaleString()} {item.unit}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/70">{formatNaira(item.weighted_avg_cost)}</td>
                  <td className="px-4 py-3">{low ? <Badge tone="amber">Low stock</Badge> : <Badge tone="forest">OK</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record procurement">
        <div className="flex flex-col gap-4">
          <ErrorSummary message={error} />
          <Select label="Item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Input label="Quantity" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Input label="Total cost paid" type="number" min={0} value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
          <Button onClick={handleProcure} disabled={submitting}>{submitting ? 'Saving…' : 'Save procurement'}</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
