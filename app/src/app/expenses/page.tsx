'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatNaira, formatDate } from '@/lib/format';
import { Plus } from '@phosphor-icons/react/dist/ssr';

type Category = { id: string; name: string };
type Expense = { id: string; description: string | null; amount: string; category_name: string; incurred_at: string; recorded_by_username: string };

export default function ExpensesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    fetch('/api/expenses').then((r) => r.json()).then(setExpenses);
  }

  useEffect(() => {
    fetch('/api/expenses/categories').then((r) => r.json()).then(setCategories);
    refresh();
  }, []);

  async function handleSubmit() {
    setError(null);
    if (!categoryId || !amount) {
      setError('Choose a category and enter an amount.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, description, amount: Number(amount), paymentMethod: method }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setDescription('');
      setAmount('');
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
          <h1 className="text-xl font-bold text-ink">Expenses</h1>
          <p className="text-sm text-ink/60">Record a business expense</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> Add expense</Button>
      </div>

      {expenses.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-mist-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-mist-border last:border-0">
                  <td className="px-4 py-3 text-ink/70">{formatDate(e.incurred_at)}</td>
                  <td className="px-4 py-3 text-ink">{e.category_name}</td>
                  <td className="px-4 py-3 text-ink/70">{e.description ?? '—'}</td>
                  <td className="px-4 py-3 text-ink/70">{e.recorded_by_username}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink/50">No expenses recorded yet.</p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add expense">
        <div className="flex flex-col gap-4">
          <ErrorSummary message={error} />
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input label="Amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="pos">POS</option>
            <option value="other">Other</option>
          </Select>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save expense'}</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
