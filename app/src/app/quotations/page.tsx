'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatNaira, formatDate } from '@/lib/format';
import { Plus, Trash } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

type Quotation = { id: string; quotation_no: string; customer_id: string; total: string; valid_until: string | null; created_at: string };
type Line = { description: string; quantity: number; rate: number };

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: 1, rate: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    fetch('/api/quotations').then((r) => r.json()).then(setQuotations);
  }
  useEffect(refresh, []);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit() {
    setError(null);
    if (!customerName.trim()) {
      setError('Enter a customer name.');
      return;
    }
    setSubmitting(true);
    try {
      // Quotations need a customer id — reuse createCustomer via customers API first (simplification: always creates/looks up by name)
      const custRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customerName }),
      });
      const customer = await custRes.json();

      const items = lines.map((l) => ({ ...l, total: l.quantity * l.rate }));
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, items }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setOpen(false);
      setCustomerName('');
      setLines([{ description: '', quantity: 1, rate: 0 }]);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Quotations</h1>
          <p className="text-sm text-ink/60">Price estimates for customers</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New quotation</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Quotation</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/quotations/${q.id}`} className="font-medium text-forest-700 hover:underline">{q.quotation_no}</Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{formatDate(q.created_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(q.total)}</td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-ink/50">No quotations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New quotation">
        <div className="flex flex-col gap-4">
          <ErrorSummary message={error} />
          <Input label="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
              <Input label="Description" value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
              <Input label="Qty" type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className="w-16" />
              <Input label="Rate" type="number" min={0} value={line.rate} onChange={(e) => updateLine(i, { rate: Number(e.target.value) })} className="w-24" />
              {lines.length > 1 && (
                <button onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove line" className="mb-2 cursor-pointer rounded p-2 text-ink/40 hover:text-clay">
                  <Trash size={16} />
                </button>
              )}
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLines((prev) => [...prev, { description: '', quantity: 1, rate: 0 }])} className="self-start">
            <Plus size={16} /> Add line
          </Button>
          <div className="flex justify-between border-t border-mist-border pt-3 text-sm font-medium">
            <span>Total</span>
            <span className="tabular-nums text-forest-700">{formatNaira(lines.reduce((s, l) => s + l.quantity * l.rate, 0))}</span>
          </div>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save quotation'}</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
