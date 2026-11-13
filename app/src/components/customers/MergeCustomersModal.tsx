'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { formatNaira } from '@/lib/format';

export type MergeCandidate = {
  customer_id: string;
  customer_code: string;
  name: string;
  total_job_orders: number;
  total_revenue: number;
};

export type MergeResult = { survivorName: string; mergedCount: number; recordsMoved: number };

export function MergeCustomersModal({
  open, onClose, customers, onMerged,
}: {
  open: boolean;
  onClose: () => void;
  customers: MergeCandidate[];
  onMerged: (result: MergeResult) => void;
}) {
  // The form only mounts while the modal is open, so it starts fresh every time.
  return (
    <Modal open={open} onClose={onClose} title={`Merge ${customers.length} customers`}>
      <MergeForm customers={customers} onClose={onClose} onMerged={onMerged} />
    </Modal>
  );
}

function MergeForm({
  customers, onClose, onMerged,
}: {
  customers: MergeCandidate[];
  onClose: () => void;
  onMerged: (result: MergeResult) => void;
}) {
  // Start with the record that has the most history as the one to keep.
  const [survivorId, setSurvivorId] = useState(
    () => [...customers].sort((a, b) => b.total_job_orders - a.total_job_orders)[0]?.customer_id ?? ''
  );
  const [name, setName] = useState(
    () => [...customers].sort((a, b) => b.total_job_orders - a.total_job_orders)[0]?.name ?? ''
  );
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseSurvivor(c: MergeCandidate) {
    setSurvivorId(c.customer_id);
    if (!nameTouched) setName(c.name);
  }

  const others = customers.filter((c) => c.customer_id !== survivorId);
  const movingOrders = others.reduce((s, c) => s + c.total_job_orders, 0);
  const movingRevenue = others.reduce((s, c) => s + c.total_revenue, 0);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/customers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survivorId,
          sourceIds: others.map((c) => c.customer_id),
          newName: name.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Merge failed');
      const moved = (data.merged as Array<{ moved: Record<string, number> }>).reduce(
        (s, m) => s + Object.values(m.moved).reduce((a, b) => a + b, 0), 0);
      onMerged({ survivorName: data.survivor.name, mergedCount: data.merged.length, recordsMoved: moved });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-ink">Which record should stay?</legend>
        <div className="flex flex-col gap-2">
          {customers.map((c) => (
            <label
              key={c.customer_id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-200 ${
                c.customer_id === survivorId ? 'border-forest bg-forest-50' : 'border-mist-border hover:border-forest'
              }`}
            >
              <input
                type="radio"
                name="survivor"
                checked={c.customer_id === survivorId}
                onChange={() => chooseSurvivor(c)}
                className="mt-1 accent-forest"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                <span className="block text-xs text-ink/50">
                  {c.customer_code} · {c.total_job_orders} job order{c.total_job_orders === 1 ? '' : 's'} · {formatNaira(c.total_revenue)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        label="Name to use"
        value={name}
        maxLength={120}
        onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
        hint="Edit this to save the customer under a different name."
      />

      <div className="mt-4 rounded-lg bg-mist p-3 text-sm text-ink/80">
        <p>
          {movingOrders} job order{movingOrders === 1 ? '' : 's'} ({formatNaira(movingRevenue)}) and all related invoices,
          payments, receipts and quotations will move to <strong>{name.trim() || '…'}</strong>.
        </p>
        <p className="mt-1 text-ink/60">
          The other {others.length} record{others.length === 1 ? ' is' : 's are'} archived, not deleted. You can undo this from Merge history.
        </p>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={submit} disabled={submitting || !name.trim() || others.length === 0}>
          {submitting ? 'Merging…' : `Merge ${customers.length} customers`}
        </Button>
      </div>
    </>
  );
}
