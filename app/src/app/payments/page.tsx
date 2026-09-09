'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatNaira } from '@/lib/format';

type Customer = { customer_id: string; name: string; outstanding_balance: number };
type Invoice = { id: string; invoice_no: string; outstanding: string };

export default function PaymentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/customers').then((r) => r.json()).then((all) => setCustomers(all.filter((c: Customer) => c.outstanding_balance > 0)));
  }, []);

  useEffect(() => {
    // Intentional: clear the previous customer's invoice list immediately when the
    // selection is cleared, rather than leaving a stale list attributed to no one.
    if (!customerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInvoices([]);
      return;
    }
    fetch(`/api/customers/${customerId}/outstanding-invoices`).then((r) => r.json()).then(setInvoices);
  }, [customerId]);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!customerId || !amount) {
      setError('Select a customer and enter an amount.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, amount: Number(amount), method }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setSuccess(`Payment recorded — receipt ${data.receiptNo}`);
      setAmount('');
      fetch(`/api/customers/${customerId}/outstanding-invoices`).then((r) => r.json()).then(setInvoices);
    } finally {
      setSubmitting(false);
    }
  }

  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.outstanding), 0);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Record a Payment</h1>
        <p className="text-sm text-ink/60">Against an existing customer&apos;s outstanding balance</p>
      </div>

      <div className="max-w-md">
        <ErrorSummary message={error} />
        {success && (
          <p className="mb-4 rounded border border-forest-100 bg-forest-50 px-4 py-3 text-sm text-forest-700">{success}</p>
        )}

        <div className="flex flex-col gap-4">
          <Select label="Customer with debt" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select…</option>
            {customers.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>{c.name} — owes {formatNaira(c.outstanding_balance)}</option>
            ))}
          </Select>

          {invoices.length > 0 && (
            <div className="rounded border border-mist-border p-3 text-sm">
              <p className="mb-1 font-medium text-ink">Outstanding invoices (oldest paid first)</p>
              {invoices.map((inv) => (
                <div key={inv.id} className="flex justify-between text-ink/70">
                  <span>{inv.invoice_no}</span>
                  <span className="tabular-nums">{formatNaira(inv.outstanding)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-mist-border pt-1 font-medium">
                <span>Total</span><span className="tabular-nums">{formatNaira(totalOutstanding)}</span>
              </div>
            </div>
          )}

          <Input label="Amount received" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
            hint="Applied to the oldest outstanding invoice(s) first" />
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="pos">POS</option>
            <option value="other">Other</option>
          </Select>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Recording…' : 'Record payment'}</Button>
        </div>
      </div>
    </AppShell>
  );
}
